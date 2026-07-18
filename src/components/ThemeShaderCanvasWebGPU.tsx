import { useLayoutEffect, useRef } from 'react';
import type { ThemeShaderTransition } from './ThemeShaderCanvas';

type ShaderTheme = ThemeShaderTransition['from'];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type GpuDevice = {
  queue: {
    writeBuffer: (buffer: unknown, offset: number, data: BufferSource) => void;
    writeTexture: (dst: unknown, data: BufferSource, layout: unknown, size: unknown) => void;
    submit: (buffers: unknown[]) => void;
  };
  createBindGroup: (descriptor: unknown) => unknown;
  createBuffer: (descriptor: unknown) => unknown;
  createCommandEncoder: () => {
    beginComputePass: () => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, bindGroup: unknown) => void;
      dispatchWorkgroups: (x: number, y: number, z?: number) => void;
      end: () => void;
    };
    beginRenderPass: (descriptor: unknown) => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, bindGroup: unknown) => void;
      draw: (vertexCount: number) => void;
      end: () => void;
    };
    copyTextureToBuffer: (src: unknown, dst: unknown, size: unknown) => void;
    finish: () => unknown;
  };
  createRenderPipeline: (descriptor: unknown) => { getBindGroupLayout: (index: number) => unknown };
  createComputePipeline: (descriptor: unknown) => { getBindGroupLayout: (index: number) => unknown };
  createSampler: (descriptor: unknown) => unknown;
  createShaderModule: (descriptor: unknown) => unknown;
  createTexture: (descriptor: unknown) => { createView: () => unknown; destroy: () => void };
};

type GpuContext = {
  configure: (descriptor: unknown) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

type WebGpuRuntime = {
  device: GpuDevice;
  context: GpuContext;
  format: string;
  simPipeline: { getBindGroupLayout: (index: number) => unknown };
  renderPipeline: { getBindGroupLayout: (index: number) => unknown };
  transformPipeline: { getBindGroupLayout: (index: number) => unknown };
  particlePipeline: { getBindGroupLayout: (index: number) => unknown };
  sampler: unknown;
  simParams: unknown;
  particleParams: unknown;
  renderParams: unknown;
  particleSeedBuffer: unknown;
  particleBuffer: unknown;
  particleBindGroup: unknown;
  smokeReadbacks: ReadbackSlot[];
};

type WebGpuSurface = {
  w: number;
  h: number;
  ox: number;
  oy: number;
  fullW: number;
  fullH: number;
  tex: [ReturnType<GpuDevice['createTexture']>, ReturnType<GpuDevice['createTexture']>];
  views: [unknown, unknown];
  simBindGroups: [unknown, unknown];
  renderBindGroups: [unknown, unknown];
  transformBindGroups: [unknown, unknown];
  read: 0 | 1;
};

type TransitionMeta = Pick<ThemeShaderTransition, 'from' | 'to'>;
type MappableBuffer = {
  mapAsync: (mode: number) => Promise<void>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
};
type ReadbackSlot = {
  buffer: MappableBuffer;
  busy: boolean;
};

const PARTICLES = 18;
const CELL_SIZE = 14;
const SETTLE_MS = 600;
const MAX_PARTICLE_BYTES = PARTICLES * 16;
const PARTICLE_SEED_STRIDE_BYTES = 512;
const PARTICLE_SEED_BYTES = PARTICLE_SEED_STRIDE_BYTES * 2;
const BUFFER = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
const TEXTURE = (globalThis as { GPUTextureUsage?: Record<string, number> }).GPUTextureUsage;
const MAP_MODE = (globalThis as { GPUMapMode?: Record<string, number> }).GPUMapMode;

const colors: Record<ShaderTheme, [number, number, number]> = {
  light: [251 / 255, 251 / 255, 250 / 255],
  dark: [5 / 255, 5 / 255, 5 / 255],
};

const align = (value: number, alignment: number) => Math.ceil(value / alignment) * alignment;

const pageSize = () => {
  const body = document.body;
  const doc = document.documentElement;

  return {
    w: Math.max(window.innerWidth, body.scrollWidth, doc.scrollWidth, body.offsetWidth, doc.offsetWidth),
    h: Math.max(window.innerHeight, body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight),
  };
};

const getDiffusionRate = (progress: number, dt: number) => {
  const ramp = 0.08 + 1.35 * progress * progress * progress;
  return 1 - Math.exp(-dt * ramp);
};

const makeParticles = (transition: ThemeShaderTransition, docW: number, docH: number, surface: WebGpuSurface, speedCells: number) => {
  const x = (transition.origin.x / docW) * surface.w;
  const y = ((docH - transition.origin.y) / docH) * surface.h;

  return Array.from({ length: PARTICLES }, (_, i): Particle => {
    const angle = (i / PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.85;
    const v = speedCells * (0.95 + Math.random() * 0.5);
    return {
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      radius: 0.65 + Math.random() * 1.1,
    };
  });
};

const writeParticleSeeds = (particles: Particle[], values: Float32Array) => {
  values.fill(0);
  const stride = PARTICLE_SEED_STRIDE_BYTES / 4;

  particles.forEach((p, index) => {
    const a = index * 4;
    const b = stride + a;

    values[a] = p.x;
    values[a + 1] = p.y;
    values[a + 2] = p.vx;
    values[a + 3] = p.vy;
    values[b] = p.radius;
  });
};

const shader = `const PARTICLES = ${PARTICLES}u;

struct SimParams {
  size: vec2<f32>,
  diffuse: f32,
  particle_count: f32,
};

struct ParticleParams {
  size: vec2<f32>,
  elapsed: f32,
  particle_count: f32,
};

struct RenderParams {
  resolution: vec2<f32>,
  state_size: vec2<f32>,
  page: vec4<f32>,
  surface: vec4<f32>,
  from_color: vec4<f32>,
  to_color: vec4<f32>,
};

fn reflect_coord(value: f32, max_value: f32) -> f32 {
  let period = max_value * 2.0;
  let wrapped = value - floor(value / period) * period;
  return select(wrapped, period - wrapped, wrapped > max_value);
}

@group(3) @binding(0) var<storage, read> particle_seed_a: array<vec4<f32>>;
@group(3) @binding(1) var<storage, read> particle_seed_b: array<vec4<f32>>;
@group(3) @binding(3) var<storage, read_write> live_particles: array<vec4<f32>>;
@group(3) @binding(4) var<uniform> particle_params: ParticleParams;

@compute @workgroup_size(64)
fn particle_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= PARTICLES || f32(gid.x) >= particle_params.particle_count) { return; }

  let seed_a = particle_seed_a[gid.x];
  let seed_b = particle_seed_b[gid.x];
  let radius = seed_b.x;

  // let delay = seed_b.x;
  // let life = seed_b.y;
  let age = particle_params.elapsed;
  // if (age < 0.0 || age > life) {
  //   live_particles[gid.x] = vec4<f32>(0.0);
  //   return;
  // }

  let seconds = age / 1000.0;
  // let progress = age / life;
  // let fade = select((1.0 - progress) / 0.14, 1.0, progress < 0.86);

  let fade = 1.0;
  let x = reflect_coord(seed_a.x + seed_a.z * seconds, particle_params.size.x - 1.0);
  let y = reflect_coord(seed_a.y + seed_a.w * seconds, particle_params.size.y - 1.0);
  live_particles[gid.x] = vec4<f32>(x, y, radius, max(0.0, fade));
}

@group(0) @binding(0) var sim_src: texture_2d<f32>;
@group(0) @binding(1) var sim_dst: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> sim_params: SimParams;
@group(0) @binding(3) var<storage, read> particles: array<vec4<f32>>;

fn sample_state(pos: vec2<i32>) -> f32 {
  let limit = vec2<i32>(sim_params.size) - vec2<i32>(1);
  return textureLoad(sim_src, clamp(pos, vec2<i32>(0), limit), 0).r;
}

@compute @workgroup_size(8, 8)
fn sim_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = vec2<i32>(gid.xy);
  if (p.x >= i32(sim_params.size.x) || p.y >= i32(sim_params.size.y)) { return; }
  let c = sample_state(p);
  var m = max(max(sample_state(p + vec2<i32>(-1, 0)), sample_state(p + vec2<i32>(1, 0))), max(sample_state(p + vec2<i32>(0, -1)), sample_state(p + vec2<i32>(0, 1))));
  m = max(m, max(max(sample_state(p + vec2<i32>(-1, -1)), sample_state(p + vec2<i32>(1, -1))), max(sample_state(p + vec2<i32>(-1, 1)), sample_state(p + vec2<i32>(1, 1)))));
  var v = max(c, mix(c, m, sim_params.diffuse));

  for (var i = 0u; i < PARTICLES; i = i + 1u) {
    if (f32(i) >= sim_params.particle_count) { break; }
    let particle = particles[i];
    let d = distance(vec2<f32>(p) + vec2<f32>(0.5), particle.xy);
    v = max(v, (1.0 - smoothstep(particle.z * 0.35, particle.z, d)) * particle.w);
  }

  textureStore(sim_dst, p, vec4<f32>(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0));
}

@group(1) @binding(0) var render_tex: texture_2d<f32>;
@group(1) @binding(1) var render_sampler: sampler;
@group(1) @binding(2) var<uniform> render_params: RenderParams;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VertexOut;
  out.position = vec4<f32>(pos[index], 0.0, 1.0);
  return out;
}

fn state_at(uv: vec2<f32>) -> f32 {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return 0.0;
  }
  return textureSampleLevel(render_tex, render_sampler, uv, 0.0).r;
}

@fragment
fn fragment_main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let page_xy = vec2<f32>(render_params.page.x + frag.x, render_params.page.w - (render_params.page.y + render_params.resolution.y - frag.y));
  let global_cell = page_xy / render_params.page.zw * render_params.surface.zw;
  let uv = (global_cell - render_params.surface.xy) / render_params.state_size;
  let px = 1.0 / render_params.state_size;
  var state = state_at(uv) * 4.0;
  state += (state_at(uv + vec2<f32>(px.x, 0.0)) + state_at(uv - vec2<f32>(px.x, 0.0)) + state_at(uv + vec2<f32>(0.0, px.y)) + state_at(uv - vec2<f32>(0.0, px.y))) * 2.0;
  state += state_at(uv + px) + state_at(uv - px) + state_at(uv + vec2<f32>(px.x, -px.y)) + state_at(uv + vec2<f32>(-px.x, px.y));
  state = smoothstep(0.01, 0.99, state / 16.0);
  return vec4<f32>(mix(render_params.from_color.rgb, render_params.to_color.rgb, state), 1.0);
}

@group(2) @binding(0) var transform_src: texture_2d<f32>;
@group(2) @binding(1) var transform_dst: texture_storage_2d<rgba8unorm, write>;
@group(2) @binding(2) var<uniform> transform_params: SimParams;

@compute @workgroup_size(8, 8)
fn transform_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u32(transform_params.size.x) || gid.y >= u32(transform_params.size.y)) { return; }
  let value = textureLoad(transform_src, vec2<i32>(gid.xy), 0).r;
  textureStore(transform_dst, vec2<i32>(gid.xy), vec4<f32>(1.0 - value, 0.0, 0.0, 1.0));
}`;

const createRuntime = async (canvas: HTMLCanvasElement): Promise<WebGpuRuntime | null> => {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown>; getPreferredCanvasFormat: () => string } }).gpu;
    if (!gpu || !BUFFER || !TEXTURE) return null;

    const adapter = (await gpu.requestAdapter()) as { requestDevice: () => Promise<GpuDevice> } | null;
    const device = await adapter?.requestDevice();
    const context = canvas.getContext('webgpu') as GpuContext | null;
    if (!device || !context) return null;

    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    const module = device.createShaderModule({ code: shader });
    const simPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'sim_main' } });
    const particlePipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'particle_main' } });
    const transformPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'transform_main' } });
    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex_main' },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const particleSeedBuffer = device.createBuffer({ size: PARTICLE_SEED_BYTES, usage: BUFFER.STORAGE | BUFFER.COPY_DST });
    const particleBuffer = device.createBuffer({ size: MAX_PARTICLE_BYTES, usage: BUFFER.STORAGE });
    const particleParams = device.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
    const particleBindGroup = device.createBindGroup({
      layout: particlePipeline.getBindGroupLayout(3),
      entries: [
        { binding: 0, resource: { buffer: particleSeedBuffer, offset: 0, size: MAX_PARTICLE_BYTES } },
        { binding: 1, resource: { buffer: particleSeedBuffer, offset: PARTICLE_SEED_STRIDE_BYTES, size: MAX_PARTICLE_BYTES } },
        { binding: 3, resource: { buffer: particleBuffer } },
        { binding: 4, resource: { buffer: particleParams } },
      ],
    });

    return {
      device,
      context,
      format,
      simPipeline,
      renderPipeline,
      transformPipeline,
      particlePipeline,
      sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
      simParams: device.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
      particleParams,
      renderParams: device.createBuffer({ size: 80, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
      particleSeedBuffer,
      particleBuffer,
      particleBindGroup,
      smokeReadbacks: Array.from({ length: 3 }, () => ({
        buffer: device.createBuffer({ size: 256 * 3, usage: BUFFER.COPY_DST | BUFFER.MAP_READ }) as MappableBuffer,
        busy: false,
      })),
    };
  } catch (error) {
    console.warn('WebGPU theme shader unavailable; falling back to WebGL.', error);
    return null;
  }
};

const activeRegion = (doc: { w: number; h: number }, cell: number) => {
  const fullW = Math.max(2, Math.ceil(doc.w / cell));
  const fullH = Math.max(2, Math.ceil(doc.h / cell));
  return { ox: 0, oy: 0, fullW, fullH, w: fullW, h: fullH };
};

const createSurface = (
  runtime: WebGpuRuntime,
  { w, h, ox, oy, fullW, fullH }: ReturnType<typeof activeRegion>,
): WebGpuSurface => {
  const usage = TEXTURE!.TEXTURE_BINDING | TEXTURE!.STORAGE_BINDING | TEXTURE!.COPY_DST | TEXTURE!.COPY_SRC;
  const tex = [
    runtime.device.createTexture({ size: [w, h], format: 'rgba8unorm', usage }),
    runtime.device.createTexture({ size: [w, h], format: 'rgba8unorm', usage }),
  ] as WebGpuSurface['tex'];
  const views = [tex[0].createView(), tex[1].createView()] as [unknown, unknown];
  const row = align(w * 4, 256);
  const data = new Uint8Array(row * h);

  tex.forEach((texture) => {
    runtime.device.queue.writeTexture({ texture }, data, { bytesPerRow: row, rowsPerImage: h }, [w, h]);
  });

  return {
    w,
    h,
    ox,
    oy,
    fullW,
    fullH,
    tex,
    views,
    simBindGroups: [
      runtime.device.createBindGroup({
        layout: runtime.simPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: views[0] },
          { binding: 1, resource: views[1] },
          { binding: 2, resource: { buffer: runtime.simParams } },
          { binding: 3, resource: { buffer: runtime.particleBuffer } },
        ],
      }),
      runtime.device.createBindGroup({
        layout: runtime.simPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: views[1] },
          { binding: 1, resource: views[0] },
          { binding: 2, resource: { buffer: runtime.simParams } },
          { binding: 3, resource: { buffer: runtime.particleBuffer } },
        ],
      }),
    ],
    renderBindGroups: [
      runtime.device.createBindGroup({
        layout: runtime.renderPipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: views[0] },
          { binding: 1, resource: runtime.sampler },
          { binding: 2, resource: { buffer: runtime.renderParams } },
        ],
      }),
      runtime.device.createBindGroup({
        layout: runtime.renderPipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: views[1] },
          { binding: 1, resource: runtime.sampler },
          { binding: 2, resource: { buffer: runtime.renderParams } },
        ],
      }),
    ],
    transformBindGroups: [
      runtime.device.createBindGroup({
        layout: runtime.transformPipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: views[0] },
          { binding: 1, resource: views[1] },
          { binding: 2, resource: { buffer: runtime.simParams } },
        ],
      }),
      runtime.device.createBindGroup({
        layout: runtime.transformPipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: views[1] },
          { binding: 1, resource: views[0] },
          { binding: 2, resource: { buffer: runtime.simParams } },
        ],
      }),
    ],
    read: 0,
  };
};

const destroySurface = (surface: WebGpuSurface | null) => {
  surface?.tex.forEach((texture) => texture.destroy());
};

export const ThemeShaderCanvasWebGPU = ({
  transition,
  onSmokeVisibilityChange,
  onUnavailable,
}: {
  transition: ThemeShaderTransition | null;
  onSmokeVisibilityChange: (visible: boolean) => void;
  onUnavailable: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<WebGpuRuntime | null>(null);
  const surfaceRef = useRef<WebGpuSurface | null>(null);
  const metaRef = useRef<TransitionMeta | null>(null);
  const onSmokeVisibilityChangeRef = useRef(onSmokeVisibilityChange);

  useLayoutEffect(() => {
    onSmokeVisibilityChangeRef.current = onSmokeVisibilityChange;
  }, [onSmokeVisibilityChange]);

  useLayoutEffect(() => {
    let frame = 0;
    let cancelled = false;

    if (!transition) {
      destroySurface(surfaceRef.current);
      surfaceRef.current = null;
      metaRef.current = null;
      return;
    }

    const run = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const runtime = runtimeRef.current ?? (await createRuntime(canvas));
      if (!runtime || cancelled) {
        onUnavailable();
        return;
      }

      runtimeRef.current = runtime;

      const doc = pageSize();
      const from = colors[transition.from];
      const to = colors[transition.to];
      const previous = metaRef.current;
      const particleSeedValues = new Float32Array(PARTICLE_SEED_BYTES / 4);
      const particleParamValues = new Float32Array(8);
      const renderValues = new Float32Array(20);
      const simValues = new Float32Array(8);
      let prepared = false;
      let last = performance.now();
      const started = last;
      let nextSmokeSample = 0;
      let lastSmokeVisible: boolean | null = null;

      const ensureSurface = () => {
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const cell = viewportW < 640 ? 12 : CELL_SIZE;
        const region = activeRegion(doc, cell);

        if (canvas.width !== viewportW || canvas.height !== viewportH) {
          canvas.width = viewportW;
          canvas.height = viewportH;
          runtime.context.configure({ device: runtime.device, format: runtime.format, alphaMode: 'opaque' });
        }

        if (
          !surfaceRef.current ||
          surfaceRef.current.w !== region.w ||
          surfaceRef.current.h !== region.h ||
          surfaceRef.current.ox !== region.ox ||
          surfaceRef.current.oy !== region.oy ||
          surfaceRef.current.fullW !== region.fullW ||
          surfaceRef.current.fullH !== region.fullH
        ) {
          destroySurface(surfaceRef.current);
          surfaceRef.current = createSurface(runtime, region);
          prepared = false;
        }

        const surface = surfaceRef.current;
        if (!surface) return null;

        if (!prepared) {
          if (previous?.from === transition.to && previous.to === transition.from) {
            const write = surface.read === 0 ? 1 : 0;
            simValues.set([surface.w, surface.h, 0, 0]);
            runtime.device.queue.writeBuffer(runtime.simParams, 0, simValues);
            const encoder = runtime.device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(runtime.transformPipeline);
            pass.setBindGroup(2, surface.transformBindGroups[surface.read]);
            pass.dispatchWorkgroups(Math.ceil(surface.w / 8), Math.ceil(surface.h / 8));
            pass.end();
            runtime.device.queue.submit([encoder.finish()]);
            surface.read = write as 0 | 1;
          } else if (previous && (previous.from !== transition.from || previous.to !== transition.to)) {
            destroySurface(surface);
            surfaceRef.current = createSurface(runtime, region);
          }

          const activeSurface = surfaceRef.current ?? surface;
          writeParticleSeeds(makeParticles(transition, doc.w, doc.h, activeSurface, Math.max(window.innerWidth, window.innerHeight) / cell), particleSeedValues);
          runtime.device.queue.writeBuffer(runtime.particleSeedBuffer, 0, particleSeedValues);
          metaRef.current = { from: transition.from, to: transition.to };
          prepared = true;
        }

        return surfaceRef.current;
      };

      const sampleSmoke = (surface: WebGpuSurface, now: number) => {
        if (now < nextSmokeSample || !BUFFER || !MAP_MODE) return;

        const smoke = document.querySelector<HTMLElement>('[data-smoke-link]');
        const rect = smoke?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const slot = runtime.smokeReadbacks.find((readback) => !readback.busy);
        if (!slot) return;

        nextSmokeSample = now + 140;
        slot.busy = true;
        const sampleW = Math.min(3, surface.w);
        const sampleH = Math.min(3, surface.h);
        const x = Math.floor(((window.scrollX + rect.left + rect.width / 2) / doc.w) * surface.fullW - surface.ox) - 1;
        const y = Math.floor(((doc.h - (window.scrollY + rect.top + rect.height / 2)) / doc.h) * surface.fullH - surface.oy) - 1;
        if (x < -sampleW || y < -sampleH || x >= surface.w || y >= surface.h) {
          if (lastSmokeVisible !== false) {
            lastSmokeVisible = false;
            onSmokeVisibilityChangeRef.current(false);
          }
          slot.busy = false;
          return;
        }
        const sx = Math.min(surface.w - sampleW, Math.max(0, x));
        const sy = Math.min(surface.h - sampleH, Math.max(0, y));
        const bytesPerRow = 256;
        const buffer = slot.buffer;
        const encoder = runtime.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
          { texture: surface.tex[surface.read], origin: { x: sx, y: sy } },
          { buffer, bytesPerRow, rowsPerImage: sampleH },
          [sampleW, sampleH],
        );
        runtime.device.queue.submit([encoder.finish()]);
        buffer.mapAsync(MAP_MODE.READ).then(() => {
          const data = new Uint8Array(buffer.getMappedRange());
          let total = 0;
          for (let row = 0; row < sampleH; row += 1) {
            for (let col = 0; col < sampleW; col += 1) total += data[row * bytesPerRow + col * 4];
          }
          const state = total / (sampleW * sampleH);
          const blackness = transition.to === 'dark' ? state : 255 - state;
          const smokeVisible = blackness > 138;
          if (smokeVisible !== lastSmokeVisible) {
            lastSmokeVisible = smokeVisible;
            onSmokeVisibilityChangeRef.current(smokeVisible);
          }
          buffer.unmap();
        }).catch(() => {
          // A lost device or cancelled transition can reject a pending readback.
        }).finally(() => {
          slot.busy = false;
        });
      };

      const render = (now: number) => {
        if (cancelled) return;
        const surface = ensureSurface();
        if (!surface) return;

        const dt = Math.min(2.2, Math.max(0.2, (now - last) / 16.67));
        const elapsed = now - started;
        const progress = Math.min(1, elapsed / transition.duration);
        const diffusion = progress < 1 ? getDiffusionRate(progress, dt) : 1;
        const write = surface.read === 0 ? 1 : 0;
        last = now;

        particleParamValues.set([surface.w, surface.h, elapsed, PARTICLES, 0, 0, 0, 0]);
        simValues.set([surface.w, surface.h, diffusion, PARTICLES, 0, 0, 0, 0]);
        runtime.device.queue.writeBuffer(runtime.particleParams, 0, particleParamValues);
        runtime.device.queue.writeBuffer(runtime.simParams, 0, simValues);

        renderValues.set([
          canvas.width,
          canvas.height,
          surface.w,
          surface.h,
          window.scrollX,
          window.scrollY,
          doc.w,
          doc.h,
          surface.ox,
          surface.oy,
          surface.fullW,
          surface.fullH,
          from[0],
          from[1],
          from[2],
          1,
          to[0],
          to[1],
          to[2],
          1,
        ]);
        runtime.device.queue.writeBuffer(runtime.renderParams, 0, renderValues);

        const encoder = runtime.device.createCommandEncoder();
        const particlePass = encoder.beginComputePass();
        particlePass.setPipeline(runtime.particlePipeline);
        particlePass.setBindGroup(3, runtime.particleBindGroup);
        particlePass.dispatchWorkgroups(Math.ceil(PARTICLES / 64), 1);
        particlePass.end();
        const simPass = encoder.beginComputePass();
        simPass.setPipeline(runtime.simPipeline);
        simPass.setBindGroup(0, surface.simBindGroups[surface.read]);
        simPass.dispatchWorkgroups(Math.ceil(surface.w / 8), Math.ceil(surface.h / 8));
        simPass.end();
        surface.read = write as 0 | 1;

        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: runtime.context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: from[0], g: from[1], b: from[2], a: 1 },
          }],
        });
        renderPass.setPipeline(runtime.renderPipeline);
        renderPass.setBindGroup(1, surface.renderBindGroups[surface.read]);
        renderPass.draw(3);
        renderPass.end();
        runtime.device.queue.submit([encoder.finish()]);

        sampleSmoke(surface, now);
        if (elapsed < transition.duration + SETTLE_MS) frame = requestAnimationFrame(render);
      };

      render(started);
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [transition, onUnavailable]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`theme-shader-canvas ${transition ? 'is-active' : ''}`} />;
};
