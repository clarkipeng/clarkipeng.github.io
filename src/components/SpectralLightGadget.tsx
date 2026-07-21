import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const SOURCES_PER_SIDE = 32;
const SPECTRAL_SAMPLES = 32;
const BUNDLES = SOURCES_PER_SIDE * 4;
const RAYS = BUNDLES * SPECTRAL_SAMPLES;
const STEPS = 128;
const FIELD_SIZE = 192;

type Device = {
  queue: {
    writeBuffer: (buffer: unknown, offset: number, data: BufferSource) => void;
    submit: (commands: unknown[]) => void;
  };
  createBindGroup: (descriptor: unknown) => unknown;
  createBuffer: (descriptor: unknown) => unknown;
  createCommandEncoder: () => {
    beginComputePass: () => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, group: unknown) => void;
      dispatchWorkgroups: (x: number, y?: number) => void;
      end: () => void;
    };
    beginRenderPass: (descriptor: unknown) => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, group: unknown) => void;
      draw: (vertices: number, instances: number) => void;
      end: () => void;
    };
    finish: () => unknown;
  };
  createComputePipeline: (descriptor: unknown) => { getBindGroupLayout: (index: number) => unknown };
  createRenderPipeline: (descriptor: unknown) => { getBindGroupLayout: (index: number) => unknown };
  createSampler: (descriptor: unknown) => unknown;
  createShaderModule: (descriptor: unknown) => unknown;
  createTexture: (descriptor: unknown) => { createView: () => unknown; destroy: () => void };
};

type Context = {
  configure: (descriptor: unknown) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

const shader = `
const RAYS = ${RAYS}u;
const SOURCES_PER_SIDE = ${SOURCES_PER_SIDE}u;
const SPECTRAL_SAMPLES = ${SPECTRAL_SAMPLES}u;
const BUNDLES = ${BUNDLES}u;
const VIRTUAL_WAVELENGTHS = 1000.0;
const STEPS = ${STEPS}u;
const FIELD_SIZE = ${FIELD_SIZE}u;

struct Params {
  resolution: vec2<f32>,
  time: f32,
  reduced_motion: f32,
  pointer: vec2<f32>,
  pointer_delta: vec2<f32>,
  progress: f32,
  delta_time: f32,
  padding: vec2<f32>,
};

fn base_density(p: vec2<f32>, time: f32, reduced_motion: f32, pointer: vec2<f32>) -> f32 {
  let drift = select(0.035 * vec2<f32>(sin(time * 0.37), cos(time * 0.29)), vec2<f32>(0.0), reduced_motion > 0.5);
  let a = (p - pointer - drift) * vec2<f32>(1.35, 2.2);
  let b = (p - (pointer + vec2<f32>(0.12, -0.2) - drift)) * vec2<f32>(2.4, 3.4);
  let c = (p - (pointer + vec2<f32>(-0.1, 0.23))) * vec2<f32>(2.0, 4.2);
  return clamp(exp(-dot(a, a) * 9.0) + 0.7 * exp(-dot(b, b) * 12.0) + 0.55 * exp(-dot(c, c) * 14.0), 0.0, 1.0);
}

@group(1) @binding(0) var fluid_source: texture_2d<f32>;
@group(1) @binding(1) var fluid_sampler: sampler;
@group(1) @binding(2) var fluid_target: texture_storage_2d<rgba16float, write>;
@group(1) @binding(3) var<uniform> fluid_params: Params;

fn fluid_at(uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(fluid_source, fluid_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).rgb;
}

@compute @workgroup_size(8, 8)
fn fluid(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= FIELD_SIZE || gid.y >= FIELD_SIZE) { return; }
  let texel = 1.0 / f32(FIELD_SIZE);
  let uv = (vec2<f32>(gid.xy) + 0.5) * texel;
  let current = fluid_at(uv);
  let velocity = current.yz;
  let advected = fluid_at(uv - velocity * fluid_params.delta_time * 2.0);
  let neighbors = (
    fluid_at(uv + vec2<f32>(texel, 0.0)) + fluid_at(uv - vec2<f32>(texel, 0.0))
    + fluid_at(uv + vec2<f32>(0.0, texel)) + fluid_at(uv - vec2<f32>(0.0, texel))
  ) * 0.25;
  var density_value = mix(advected.r, neighbors.r, 0.08);
  var next_velocity = mix(advected.yz, neighbors.yz, 0.12) * 0.985;
  density_value += (base_density(uv, fluid_params.time, fluid_params.reduced_motion, fluid_params.pointer) - density_value) * 0.003;

  let relative = uv - fluid_params.pointer;
  let pointer_speed = length(fluid_params.pointer_delta);
  let influence = exp(-dot(relative, relative) / 0.0025) * smoothstep(0.0005, 0.025, pointer_speed);
  let pointer_direction = fluid_params.pointer_delta / max(pointer_speed, 0.0001);
  let dipole = dot(relative / max(length(relative), 0.0001), pointer_direction);
  density_value += influence * dipole * 0.16;
  next_velocity += influence * fluid_params.pointer_delta * 7.0;

  textureStore(fluid_target, vec2<i32>(gid.xy), vec4<f32>(clamp(density_value, 0.0, 1.0), clamp(next_velocity, vec2<f32>(-0.12), vec2<f32>(0.12)), 1.0));
}

@group(0) @binding(0) var light_density: texture_2d<f32>;
@group(0) @binding(1) var light_sampler: sampler;
@group(0) @binding(2) var<storage, read_write> points: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: Params;

fn density_at(p: vec2<f32>) -> f32 {
  return textureSampleLevel(light_density, light_sampler, clamp(p, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).r;
}

fn water_index(wavelength_nm: f32) -> f32 {
  let wavelength_um = wavelength_nm * 0.001;
  return 1.32292 + 0.00306 / (wavelength_um * wavelength_um);
}

@compute @workgroup_size(64)
fn trace(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= RAYS) { return; }
  let bundle = gid.x / SPECTRAL_SAMPLES;
  let spectral_index = gid.x % SPECTRAL_SAMPLES;
  let wavelength = mix(380.0, 780.0, f32(spectral_index) / f32(SPECTRAL_SAMPLES - 1u));
  let step_length = 1.0 / f32(STEPS);
  let epsilon = vec2<f32>(step_length, step_length * params.resolution.x / params.resolution.y);
  let side = bundle / SOURCES_PER_SIDE;
  let offset = (f32(bundle % SOURCES_PER_SIDE) + 0.5) / f32(SOURCES_PER_SIDE);
  let edge_weight = abs(offset * 2.0 - 1.0);
  let toward_center = select(-1.0, 1.0, offset < 0.5);
  let inward = 1.0 - edge_weight * 0.95;
  let lateral = toward_center * edge_weight;
  var position = vec2<f32>(0.0, offset);
  var direction = normalize(vec2<f32>(inward, lateral));
  switch side {
    case 1u: { position = vec2<f32>(1.0, offset); direction = normalize(vec2<f32>(-inward, lateral)); }
    case 2u: { position = vec2<f32>(offset, 0.0); direction = normalize(vec2<f32>(lateral, inward)); }
    case 3u: { position = vec2<f32>(offset, 1.0); direction = normalize(vec2<f32>(lateral, -inward)); }
    default: {}
  }
  var normal_direction = vec2<f32>(1.0, 0.0);
  switch side {
    case 1u: { normal_direction = vec2<f32>(-1.0, 0.0); }
    case 2u: { normal_direction = vec2<f32>(0.0, 1.0); }
    case 3u: { normal_direction = vec2<f32>(0.0, -1.0); }
    default: {}
  }
  direction = normalize(mix(direction, normal_direction, smoothstep(0.2, 1.0, params.progress)));
  var optical_depth = 0.0;

  for (var step = 0u; step <= STEPS; step = step + 1u) {
    points[gid.x * (STEPS + 1u) + step] = vec4<f32>(position, wavelength, optical_depth);
    if (step == STEPS) { break; }
    let local_density = density_at(position);
    let density_gradient = vec2<f32>(
      (density_at(position + vec2<f32>(epsilon.x, 0.0)) - density_at(position - vec2<f32>(epsilon.x, 0.0))) / (2.0 * epsilon.x),
      (density_at(position + vec2<f32>(0.0, epsilon.y)) - density_at(position - vec2<f32>(0.0, epsilon.y))) / (2.0 * epsilon.y)
    );
    let water_n = water_index(wavelength);
    let n = mix(1.000293, water_n, local_density);
    let grad_n = density_gradient * (water_n - 1.000293);
    let transverse = grad_n - direction * dot(direction, grad_n);
    let diffraction = sin(f32(bundle) * 2.39996 + f32(step) * 1.61803) * length(density_gradient) * wavelength / 550.0;
    let perpendicular = vec2<f32>(-direction.y, direction.x);
    direction = normalize(direction + transverse * (step_length / n) + perpendicular * diffraction * step_length * 0.0015);
    optical_depth = clamp(optical_depth + local_density * 2.0 / f32(STEPS), 0.0, 1.0);
    position += direction * step_length;
  }
}

@group(0) @binding(0) var<storage, read> rendered_points: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> render_params: Params;

fn wavelength_rgb(w: f32) -> vec3<f32> {
  var rgb = vec3<f32>(0.0);
  if (w < 440.0) {
    rgb = vec3<f32>((440.0 - w) / 60.0, 0.0, 1.0);
  } else if (w < 490.0) {
    rgb = vec3<f32>(0.0, (w - 440.0) / 50.0, 1.0);
  } else if (w < 510.0) {
    rgb = vec3<f32>(0.0, 1.0, (510.0 - w) / 20.0);
  } else if (w < 580.0) {
    rgb = vec3<f32>((w - 510.0) / 70.0, 1.0, 0.0);
  } else if (w < 645.0) {
    rgb = vec3<f32>(1.0, (645.0 - w) / 65.0, 0.0);
  } else {
    rgb = vec3<f32>(1.0, 0.0, 0.0);
  }
  let edge = select(select(1.0, 0.3 + 0.7 * (780.0 - w) / 80.0, w > 700.0), 0.3 + 0.7 * (w - 380.0) / 40.0, w < 420.0);
  return pow(rgb * edge, vec3<f32>(0.8)) * vec3<f32>(0.644, 1.0, 1.408);
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) opacity: f32,
};

@vertex
fn vertex(@builtin(vertex_index) vertex_id: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let ray = instance / STEPS;
  let step = instance % STEPS;
  let bundle = ray / SPECTRAL_SAMPLES;
  let side = bundle / SOURCES_PER_SIDE;
  let offset = (f32(bundle % SOURCES_PER_SIDE) + 0.5) / f32(SOURCES_PER_SIDE);
  let source_intensity = 0.35 + 0.65 * (1.0 - abs(offset * 2.0 - 1.0));
  let a = rendered_points[ray * (STEPS + 1u) + step];
  let b = rendered_points[ray * (STEPS + 1u) + step + 1u];
  let spectral = smoothstep(0.005, 0.08, max(a.w, b.w));
  let endpoints = array<f32, 6>(0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  let sides = array<f32, 6>(-1.0, 1.0, 1.0, -1.0, 1.0, -1.0);
  let pa = a.xy * render_params.resolution;
  let pb = b.xy * render_params.resolution;
  let normal = normalize(vec2<f32>(-(pb.y - pa.y), pb.x - pa.x));
  let spacing = select(render_params.resolution.y, render_params.resolution.x, side >= 2u) / f32(SOURCES_PER_SIDE);
  let half_width = spacing * mix(0.08, 0.025, spectral);
  let screen = mix(pa, pb, endpoints[vertex_id]) + normal * sides[vertex_id] * half_width;
  let clip = screen / render_params.resolution * 2.0 - 1.0;
  var out: VertexOut;
  out.position = select(vec4<f32>(2.0, 2.0, 0.0, 1.0), vec4<f32>(clip.x, -clip.y, 0.0, 1.0), f32(step + 1u) / f32(STEPS) <= render_params.progress);
  out.color = mix(vec3<f32>(1.0), wavelength_rgb(a.z) * 2.0, spectral) * source_intensity;
  out.opacity = mix(0.0005, 0.025, spectral);
  return out;
}

@fragment
fn fragment(in: VertexOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, in.opacity);
}

struct RibbonOut {
  @builtin(position) position: vec4<f32>,
  @location(0) wavelength: f32,
  @location(1) opacity: f32,
};

@vertex
fn ribbon_vertex(@builtin(vertex_index) vertex_id: u32, @builtin(instance_index) instance: u32) -> RibbonOut {
  let strip = instance / STEPS;
  let step = instance % STEPS;
  let bundle = strip / (SPECTRAL_SAMPLES - 1u);
  let spectral_index = strip % (SPECTRAL_SAMPLES - 1u);
  let wavelength_offsets = array<u32, 6>(0u, 1u, 1u, 0u, 1u, 0u);
  let step_offsets = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
  let ray = bundle * SPECTRAL_SAMPLES + spectral_index + wavelength_offsets[vertex_id];
  let point = rendered_points[ray * (STEPS + 1u) + step + step_offsets[vertex_id]];
  let screen = point.xy * render_params.resolution;
  let clip = screen / render_params.resolution * 2.0 - 1.0;
  let offset = (f32(bundle % SOURCES_PER_SIDE) + 0.5) / f32(SOURCES_PER_SIDE);
  var out: RibbonOut;
  out.position = select(vec4<f32>(2.0, 2.0, 0.0, 1.0), vec4<f32>(clip.x, -clip.y, 0.0, 1.0), f32(step + step_offsets[vertex_id]) / f32(STEPS) <= render_params.progress);
  out.wavelength = point.z;
  out.opacity = smoothstep(0.005, 0.08, point.w) * (0.00015 + 0.00045 * (1.0 - abs(offset * 2.0 - 1.0)));
  return out;
}

@fragment
fn ribbon_fragment(in: RibbonOut) -> @location(0) vec4<f32> {
  let t = round(clamp((in.wavelength - 380.0) / 400.0, 0.0, 1.0) * (VIRTUAL_WAVELENGTHS - 1.0)) / (VIRTUAL_WAVELENGTHS - 1.0);
  let wavelength = mix(380.0, 780.0, t);
  return vec4<f32>(wavelength_rgb(wavelength) * 2.0, in.opacity);
}`;

export const SpectralLightGadget = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const usage = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
    const textureUsage = (globalThis as { GPUTextureUsage?: Record<string, number> }).GPUTextureUsage;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown>; getPreferredCanvasFormat: () => string } }).gpu;
    if (!isDark || !canvas || !gpu || !usage || !textureUsage) return;

    let frame = 0;
    let cancelled = false;
    let pointer = { x: 0.58, y: 0.5 };
    const pointerDelta = { x: 0, y: 0 };
    const started = performance.now();

    const run = async () => {
      const adapter = await gpu.requestAdapter() as { requestDevice: () => Promise<Device> } | null;
      const device = await adapter?.requestDevice();
      const context = canvas.getContext('webgpu') as Context | null;
      if (!device || !context || cancelled) return;

      const format = gpu.getPreferredCanvasFormat();
      const module = device.createShaderModule({ code: shader });
      const fluid = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'fluid' } });
      const compute = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'trace' } });
      const render = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vertex' },
        fragment: {
          module,
          entryPoint: 'fragment',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
      const ribbon = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'ribbon_vertex' },
        fragment: {
          module,
          entryPoint: 'ribbon_fragment',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
      const pointBuffer = device.createBuffer({ size: RAYS * (STEPS + 1) * 16, usage: usage.STORAGE });
      const paramsBuffer = device.createBuffer({ size: 48, usage: usage.UNIFORM | usage.COPY_DST });
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
      const densityTextures = [0, 1].map(() => device.createTexture({
        size: [FIELD_SIZE, FIELD_SIZE],
        format: 'rgba16float',
        usage: textureUsage.TEXTURE_BINDING | textureUsage.STORAGE_BINDING,
      }));
      const densityViews = densityTextures.map((texture) => texture.createView());
      const fluidGroups = densityViews.map((view, index) => device.createBindGroup({
        layout: fluid.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: view },
          { binding: 1, resource: sampler },
          { binding: 2, resource: densityViews[1 - index] },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      }));
      const computeGroups = densityViews.map((view) => device.createBindGroup({
        layout: compute.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: view },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: pointBuffer } },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      }));
      const renderGroup = device.createBindGroup({
        layout: render.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: pointBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } },
        ],
      });
      const ribbonGroup = device.createBindGroup({
        layout: ribbon.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: pointBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } },
        ],
      });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const params = new Float32Array(12);
      let fieldRead = 0;
      let last = performance.now();

      const draw = (now: number) => {
        if (cancelled) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(2, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(2, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          context.configure({ device, format, alphaMode: 'opaque' });
        }
        const progress = reducedMotion ? 1 : Math.min(1, (now - started) / 5200);
        const deltaTime = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
        last = now;
        params.set([
          width, height, now / 1000, reducedMotion ? 1 : 0,
          pointer.x, pointer.y, pointerDelta.x, pointerDelta.y,
          progress, deltaTime, 0, 0,
        ]);
        device.queue.writeBuffer(paramsBuffer, 0, params);
        const encoder = device.createCommandEncoder();
        const fluidPass = encoder.beginComputePass();
        fluidPass.setPipeline(fluid);
        fluidPass.setBindGroup(1, fluidGroups[fieldRead]);
        fluidPass.dispatchWorkgroups(Math.ceil(FIELD_SIZE / 8), Math.ceil(FIELD_SIZE / 8));
        fluidPass.end();
        fieldRead = 1 - fieldRead;
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(compute);
        computePass.setBindGroup(0, computeGroups[fieldRead]);
        computePass.dispatchWorkgroups(Math.ceil(RAYS / 64));
        computePass.end();
        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.02, g: 0.02, b: 0.02, a: 1 },
          }],
        });
        renderPass.setPipeline(render);
        renderPass.setBindGroup(0, renderGroup);
        renderPass.draw(6, RAYS * STEPS);
        renderPass.setPipeline(ribbon);
        renderPass.setBindGroup(0, ribbonGroup);
        renderPass.draw(6, BUNDLES * (SPECTRAL_SAMPLES - 1) * STEPS);
        renderPass.end();
        device.queue.submit([encoder.finish()]);
        pointerDelta.x *= 0.82;
        pointerDelta.y *= 0.82;
        if (!reducedMotion) frame = requestAnimationFrame(draw);
      };

      draw(performance.now());
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const next = {
        x: Math.min(0.95, Math.max(0.05, (event.clientX - rect.left) / rect.width)),
        y: Math.min(0.95, Math.max(0.05, (event.clientY - rect.top) / rect.height)),
      };
      pointerDelta.x += next.x - pointer.x;
      pointerDelta.y += next.y - pointer.y;
      pointer = next;
    };
    window.addEventListener('pointermove', move);
    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
    };
  }, [isDark]);

  if (!isDark) return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full bg-[#050505]" />;
};
