import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const RAYS = 1000;
const RAYS_PER_SIDE = RAYS / 4;
const STEPS = 128;

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
      dispatchWorkgroups: (x: number) => void;
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
  createShaderModule: (descriptor: unknown) => unknown;
};

type Context = {
  configure: (descriptor: unknown) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

const shader = `
const RAYS = ${RAYS}u;
const RAYS_PER_SIDE = ${RAYS_PER_SIDE}u;
const STEPS = ${STEPS}u;

struct Params {
  resolution: vec2<f32>,
  time: f32,
  reduced_motion: f32,
  pointer: vec2<f32>,
  progress: f32,
  padding: f32,
};

@group(0) @binding(0) var<storage, read_write> points: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> params: Params;

fn density(p: vec2<f32>) -> f32 {
  let drift = select(0.035 * vec2<f32>(sin(params.time * 0.37), cos(params.time * 0.29)), vec2<f32>(0.0), params.reduced_motion > 0.5);
  let a = (p - params.pointer - drift) * vec2<f32>(1.35, 2.2);
  let b = (p - (params.pointer + vec2<f32>(0.12, -0.2) - drift)) * vec2<f32>(2.4, 3.4);
  let c = (p - (params.pointer + vec2<f32>(-0.1, 0.23))) * vec2<f32>(2.0, 4.2);
  return clamp(exp(-dot(a, a) * 9.0) + 0.7 * exp(-dot(b, b) * 12.0) + 0.55 * exp(-dot(c, c) * 14.0), 0.0, 1.0);
}

fn water_index(wavelength_nm: f32) -> f32 {
  let wavelength_um = wavelength_nm * 0.001;
  return 1.32292 + 0.00306 / (wavelength_um * wavelength_um);
}

@compute @workgroup_size(64)
fn trace(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= RAYS) { return; }
  let spectral_index = (gid.x * 613u) % RAYS;
  let wavelength = mix(380.0, 780.0, f32(spectral_index) / f32(RAYS - 1u));
  let step_length = 1.0 / f32(STEPS);
  let epsilon = vec2<f32>(step_length, step_length * params.resolution.x / params.resolution.y);
  let side = gid.x / RAYS_PER_SIDE;
  let offset = (f32(gid.x % RAYS_PER_SIDE) + 0.5) / f32(RAYS_PER_SIDE);
  var position = vec2<f32>(0.0, offset);
  var direction = vec2<f32>(1.0, 0.0);
  switch side {
    case 1u: { position = vec2<f32>(1.0, offset); direction = vec2<f32>(-1.0, 0.0); }
    case 2u: { position = vec2<f32>(offset, 0.0); direction = vec2<f32>(0.0, 1.0); }
    case 3u: { position = vec2<f32>(offset, 1.0); direction = vec2<f32>(0.0, -1.0); }
    default: {}
  }
  var optical_depth = 0.0;

  for (var step = 0u; step <= STEPS; step = step + 1u) {
    points[gid.x * (STEPS + 1u) + step] = vec4<f32>(position, wavelength, optical_depth);
    if (step == STEPS) { break; }
    let local_density = density(position);
    let density_gradient = vec2<f32>(
      density(position + vec2<f32>(epsilon.x, 0.0)) - density(position - vec2<f32>(epsilon.x, 0.0)),
      density(position + vec2<f32>(0.0, epsilon.y)) - density(position - vec2<f32>(0.0, epsilon.y))
    ) * 0.5;
    let water_n = water_index(wavelength);
    let n = mix(1.000293, water_n, local_density);
    let grad_n = density_gradient * (water_n - 1.000293);
    let transverse = grad_n - direction * dot(direction, grad_n);
    let diffraction = sin(f32(gid.x) * 2.39996 + f32(step) * 1.61803) * length(density_gradient) * wavelength / 550.0;
    let perpendicular = vec2<f32>(-direction.y, direction.x);
    direction = normalize(direction + transverse * (0.12 / n) + perpendicular * diffraction * 0.0008);
    optical_depth = clamp(optical_depth + local_density * 2.0 / f32(STEPS), 0.0, 1.0);
    position += direction * step_length;
  }
}

@group(0) @binding(0) var<storage, read> rendered_points: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> render_params: Params;

fn gaussian(wavelength: f32, center: f32, width: f32) -> f32 {
  let x = (wavelength - center) / width;
  return exp(-0.5 * x * x);
}

fn wavelength_rgb(w: f32) -> vec3<f32> {
  let xyz = vec3<f32>(
    1.056 * gaussian(w, 599.8, 37.9) + 0.362 * gaussian(w, 442.0, 16.0) - 0.065 * gaussian(w, 501.1, 20.4),
    0.821 * gaussian(w, 568.8, 46.9) + 0.286 * gaussian(w, 530.9, 16.3),
    1.217 * gaussian(w, 437.0, 11.8) + 0.681 * gaussian(w, 459.0, 26.0)
  );
  let rgb = max(vec3<f32>(0.0), vec3<f32>(
    3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
    -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
    0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z
  ));
  return rgb / max(0.001, max(rgb.r, max(rgb.g, rgb.b)));
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) vertex_id: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let ray = instance / STEPS;
  let step = instance % STEPS;
  let side = ray / RAYS_PER_SIDE;
  let a = rendered_points[ray * (STEPS + 1u) + step];
  let b = rendered_points[ray * (STEPS + 1u) + step + 1u];
  let endpoints = array<f32, 6>(0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  let sides = array<f32, 6>(-1.0, 1.0, 1.0, -1.0, 1.0, -1.0);
  let pa = a.xy * render_params.resolution;
  let pb = b.xy * render_params.resolution;
  let normal = normalize(vec2<f32>(-(pb.y - pa.y), pb.x - pa.x));
  let spacing = select(render_params.resolution.y, render_params.resolution.x, side >= 2u) / f32(RAYS_PER_SIDE);
  let half_width = spacing * 0.55;
  let screen = mix(pa, pb, endpoints[vertex_id]) + normal * sides[vertex_id] * half_width;
  let clip = screen / render_params.resolution * 2.0 - 1.0;
  var out: VertexOut;
  out.position = select(vec4<f32>(2.0, 2.0, 0.0, 1.0), vec4<f32>(clip.x, -clip.y, 0.0, 1.0), f32(step + 1u) / f32(STEPS) <= render_params.progress);
  out.color = mix(vec3<f32>(1.0), wavelength_rgb(a.z), max(a.w, b.w));
  return out;
}

@fragment
fn fragment(in: VertexOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 0.018);
}`;

export const SpectralLightGadget = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const usage = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown>; getPreferredCanvasFormat: () => string } }).gpu;
    if (!isDark || !canvas || !gpu || !usage) return;

    let frame = 0;
    let cancelled = false;
    let pointer = { x: 0.58, y: 0.5 };
    const started = performance.now();

    const run = async () => {
      const adapter = await gpu.requestAdapter() as { requestDevice: () => Promise<Device> } | null;
      const device = await adapter?.requestDevice();
      const context = canvas.getContext('webgpu') as Context | null;
      if (!device || !context || cancelled) return;

      const format = gpu.getPreferredCanvasFormat();
      const module = device.createShaderModule({ code: shader });
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
      const pointBuffer = device.createBuffer({ size: RAYS * (STEPS + 1) * 16, usage: usage.STORAGE });
      const paramsBuffer = device.createBuffer({ size: 32, usage: usage.UNIFORM | usage.COPY_DST });
      const computeGroup = device.createBindGroup({
        layout: compute.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: pointBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } },
        ],
      });
      const renderGroup = device.createBindGroup({
        layout: render.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: pointBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } },
        ],
      });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const params = new Float32Array(8);

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
        params.set([width, height, now / 1000, reducedMotion ? 1 : 0, pointer.x, pointer.y, progress, 0]);
        device.queue.writeBuffer(paramsBuffer, 0, params);
        const encoder = device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(compute);
        computePass.setBindGroup(0, computeGroup);
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
        renderPass.end();
        device.queue.submit([encoder.finish()]);
        if (!reducedMotion) frame = requestAnimationFrame(draw);
      };

      draw(performance.now());
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = {
        x: Math.min(0.85, Math.max(0.35, (event.clientX - rect.left) / rect.width)),
        y: Math.min(0.85, Math.max(0.15, (event.clientY - rect.top) / rect.height)),
      };
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
