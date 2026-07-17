import { useLayoutEffect, useRef } from 'react';
import type { ThemeShaderTransition } from './ThemeShaderCanvas';

type ShaderTheme = ThemeShaderTransition['from'];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  delay: number;
  life: number;
  radius: number;
  phase: number;
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
    copyBufferToBuffer: (src: unknown, srcOffset: number, dst: unknown, dstOffset: number, size: number) => void;
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
  classifyPipeline: { getBindGroupLayout: (index: number) => unknown };
  sampler: unknown;
  simParams: unknown;
  renderParams: unknown;
  particleBuffer: unknown;
  tileBuffer: unknown;
  tileStatusBuffer: unknown;
  tileStatusReadback: MappableBuffer;
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
  classifyBindGroups: [unknown, unknown];
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
const TILE_SIZE = 128;
const MAX_TILES = 256;
const MAX_PARTICLE_BYTES = PARTICLES * 16;
const MAX_TILE_BYTES = MAX_TILES * 16;
const MAX_TILE_STATUS_BYTES = MAX_TILES * 16;
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

const reflect = (value: number, max: number) => {
  const period = max * 2;
  const wrapped = ((value % period) + period) % period;
  return wrapped > max ? period - wrapped : wrapped;
};

const makeParticles = (transition: ThemeShaderTransition, docW: number, docH: number, surface: WebGpuSurface, speedCells: number) => {
  const x = (transition.origin.x / docW) * surface.fullW - surface.ox;
  const y = ((docH - transition.origin.y) / docH) * surface.fullH - surface.oy;

  return Array.from({ length: PARTICLES }, (_, i): Particle => {
    const angle = (i / PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.85;
    const v = speedCells * (0.95 + Math.random() * 0.5);
    return {
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      wobble: 1.2 + Math.random() * 3.8,
      delay: Math.random() * 240,
      life: 760 + Math.random() * 520,
      radius: 0.65 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
    };
  });
};

const writeParticles = (particles: Particle[], elapsed: number, values: Float32Array, w: number, h: number) => {
  values.fill(0);
  let count = 0;

  particles.forEach((p) => {
    const age = elapsed - p.delay;
    if (age < 0 || age > p.life || count >= PARTICLES) return;

    const seconds = age / 1000;
    const progress = age / p.life;
    const fade = progress < 0.86 ? 1 : (1 - progress) / 0.14;
    const wobble = Math.sin(seconds * 12 + p.phase) * p.wobble * (1 - progress);
    const offset = count * 4;

    values[offset] = reflect(p.x + p.vx * seconds + wobble, w - 1);
    values[offset + 1] = reflect(p.y + p.vy * seconds + Math.cos(seconds * 8 + p.phase) * p.wobble * (1 - progress), h - 1);
    values[offset + 2] = p.radius;
    values[offset + 3] = Math.max(0, fade);
    count += 1;
  });

  return count;
};

const addTile = (tiles: Map<string, [number, number]>, fullTiles: Set<string>, tx: number, ty: number, maxX: number, maxY: number) => {
  const key = `${tx}:${ty}`;
  if (tx < 0 || ty < 0 || tx > maxX || ty > maxY || fullTiles.has(key) || tiles.size >= MAX_TILES) return;
  tiles.set(key, [tx, ty]);
};

const writeActiveTiles = (
  surface: WebGpuSurface,
  doc: { w: number; h: number },
  particles: Float32Array,
  particleCount: number,
  values: Float32Array,
  fullTiles: Set<string>,
  keys: string[],
) => {
  const tiles = new Map<string, [number, number]>();
  const maxX = Math.ceil(surface.w / TILE_SIZE) - 1;
  const maxY = Math.ceil(surface.h / TILE_SIZE) - 1;
  const viewX0 = Math.floor((((window.scrollX / doc.w) * surface.fullW - surface.ox) / TILE_SIZE)) - 1;
  const viewX1 = Math.ceil(((((window.scrollX + window.innerWidth) / doc.w) * surface.fullW - surface.ox) / TILE_SIZE)) + 1;
  const viewY0 = Math.floor(((((doc.h - (window.scrollY + window.innerHeight)) / doc.h) * surface.fullH - surface.oy) / TILE_SIZE)) - 1;
  const viewY1 = Math.ceil(((((doc.h - window.scrollY) / doc.h) * surface.fullH - surface.oy) / TILE_SIZE)) + 1;

  for (let y = viewY0; y <= viewY1; y += 1) {
    for (let x = viewX0; x <= viewX1; x += 1) addTile(tiles, fullTiles, x, y, maxX, maxY);
  }

  for (let i = 0; i < particleCount; i += 1) {
    const offset = i * 4;
    const radius = particles[offset + 2] + 8;
    const x0 = Math.floor((particles[offset] - radius) / TILE_SIZE) - 1;
    const x1 = Math.ceil((particles[offset] + radius) / TILE_SIZE) + 1;
    const y0 = Math.floor((particles[offset + 1] - radius) / TILE_SIZE) - 1;
    const y1 = Math.ceil((particles[offset + 1] + radius) / TILE_SIZE) + 1;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) addTile(tiles, fullTiles, x, y, maxX, maxY);
    }
  }

  values.fill(0);
  keys.length = 0;
  let index = 0;
  tiles.forEach(([tx, ty], key) => {
    const x = tx * TILE_SIZE;
    const y = ty * TILE_SIZE;
    const offset = index * 4;
    keys.push(key);
    values[offset] = x;
    values[offset + 1] = y;
    values[offset + 2] = Math.min(TILE_SIZE, surface.w - x);
    values[offset + 3] = Math.min(TILE_SIZE, surface.h - y);
    index += 1;
  });

  return index;
};

const shader = `const PARTICLES = ${PARTICLES}u;

struct SimParams {
  size: vec2<f32>,
  diffuse: f32,
  particle_count: f32,
  tile_count: f32,
};

struct RenderParams {
  resolution: vec2<f32>,
  state_size: vec2<f32>,
  page: vec4<f32>,
  surface: vec4<f32>,
  from_color: vec4<f32>,
  to_color: vec4<f32>,
};

@group(0) @binding(0) var sim_src: texture_2d<f32>;
@group(0) @binding(1) var sim_dst: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> sim_params: SimParams;
@group(0) @binding(3) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> tiles: array<vec4<f32>>;

fn sample_state(pos: vec2<i32>) -> f32 {
  let limit = vec2<i32>(sim_params.size) - vec2<i32>(1);
  return textureLoad(sim_src, clamp(pos, vec2<i32>(0), limit), 0).r;
}

@compute @workgroup_size(8, 8)
fn sim_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tile = tiles[gid.z];
  if (gid.x >= u32(tile.z) || gid.y >= u32(tile.w)) { return; }
  let p = vec2<i32>(vec2<f32>(gid.xy) + tile.xy);
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
}

@group(3) @binding(0) var classify_src: texture_2d<f32>;
@group(3) @binding(1) var<storage, read> classify_tiles: array<vec4<f32>>;
@group(3) @binding(2) var<storage, read_write> tile_status: array<vec4<f32>>;
@group(3) @binding(3) var<uniform> classify_params: SimParams;

@compute @workgroup_size(64)
fn classify_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u32(classify_params.tile_count)) { return; }
  let tile = classify_tiles[gid.x];
  var min_value = 1.0;
  for (var y = 0u; y < 4u; y = y + 1u) {
    for (var x = 0u; x < 4u; x = x + 1u) {
      let uv = (vec2<f32>(f32(x) + 0.5, f32(y) + 0.5) / vec2<f32>(4.0, 4.0)) * tile.zw;
      let p = vec2<i32>(tile.xy + uv);
      min_value = min(min_value, textureLoad(classify_src, p, 0).r);
    }
  }
  tile_status[gid.x] = vec4<f32>(select(0.0, 1.0, min_value > 0.985), min_value, 0.0, 0.0);
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
    const transformPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'transform_main' } });
    const classifyPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'classify_main' } });
    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex_main' },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    return {
      device,
      context,
      format,
      simPipeline,
      renderPipeline,
      transformPipeline,
      classifyPipeline,
      sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
      simParams: device.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
      renderParams: device.createBuffer({ size: 80, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
      particleBuffer: device.createBuffer({ size: MAX_PARTICLE_BYTES, usage: BUFFER.STORAGE | BUFFER.COPY_DST }),
      tileBuffer: device.createBuffer({ size: MAX_TILE_BYTES, usage: BUFFER.STORAGE | BUFFER.COPY_DST }),
      tileStatusBuffer: device.createBuffer({ size: MAX_TILE_STATUS_BYTES, usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST }),
      tileStatusReadback: device.createBuffer({ size: MAX_TILE_STATUS_BYTES, usage: BUFFER.COPY_DST | BUFFER.MAP_READ }) as MappableBuffer,
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

const activeRegion = (transition: ThemeShaderTransition, doc: { w: number; h: number }, cell: number) => {
  const fullW = Math.max(2, Math.ceil(doc.w / cell));
  const fullH = Math.max(2, Math.ceil(doc.h / cell));
  const originX = (transition.origin.x / doc.w) * fullW;
  const originY = ((doc.h - transition.origin.y) / doc.h) * fullH;
  const viewX0 = (window.scrollX / doc.w) * fullW;
  const viewX1 = ((window.scrollX + window.innerWidth) / doc.w) * fullW;
  const viewY0 = ((doc.h - (window.scrollY + window.innerHeight)) / doc.h) * fullH;
  const viewY1 = ((doc.h - window.scrollY) / doc.h) * fullH;
  const margin = Math.ceil(Math.max(window.innerWidth, window.innerHeight) / cell * 1.2) + 48;
  const ox = Math.max(0, Math.floor(Math.min(originX, viewX0) - margin));
  const oy = Math.max(0, Math.floor(Math.min(originY, viewY0) - margin));
  const x1 = Math.min(fullW, Math.ceil(Math.max(originX, viewX1) + margin));
  const y1 = Math.min(fullH, Math.ceil(Math.max(originY, viewY1) + margin));

  return { ox, oy, fullW, fullH, w: Math.max(2, x1 - ox), h: Math.max(2, y1 - oy) };
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
          { binding: 4, resource: { buffer: runtime.tileBuffer } },
        ],
      }),
      runtime.device.createBindGroup({
        layout: runtime.simPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: views[1] },
          { binding: 1, resource: views[0] },
          { binding: 2, resource: { buffer: runtime.simParams } },
          { binding: 3, resource: { buffer: runtime.particleBuffer } },
          { binding: 4, resource: { buffer: runtime.tileBuffer } },
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
    classifyBindGroups: [
      runtime.device.createBindGroup({
        layout: runtime.classifyPipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: views[0] },
          { binding: 1, resource: { buffer: runtime.tileBuffer } },
          { binding: 2, resource: { buffer: runtime.tileStatusBuffer } },
          { binding: 3, resource: { buffer: runtime.simParams } },
        ],
      }),
      runtime.device.createBindGroup({
        layout: runtime.classifyPipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: views[1] },
          { binding: 1, resource: { buffer: runtime.tileBuffer } },
          { binding: 2, resource: { buffer: runtime.tileStatusBuffer } },
          { binding: 3, resource: { buffer: runtime.simParams } },
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
      const particleValues = new Float32Array(PARTICLES * 4);
      const tileValues = new Float32Array(MAX_TILES * 4);
      const renderValues = new Float32Array(20);
      const simValues = new Float32Array(8);
      const fullTiles = new Set<string>();
      const activeTileKeys: string[] = [];
      let particles: Particle[] = [];
      let prepared = false;
      let last = performance.now();
      const started = last;
      let nextSmokeSample = 0;
      let nextTileClassify = 0;
      let classifyPending = false;
      let lastSmokeVisible: boolean | null = null;

      const ensureSurface = () => {
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const cell = viewportW < 640 ? 12 : CELL_SIZE;
        const region = activeRegion(transition, doc, cell);

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
          fullTiles.clear();
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
            fullTiles.clear();
          }

          particles = makeParticles(transition, doc.w, doc.h, surface, Math.max(window.innerWidth, window.innerHeight) / cell);
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

      const classifyTiles = (surface: WebGpuSurface, tileCount: number, now: number) => {
        if (classifyPending || tileCount === 0 || now < nextTileClassify || !BUFFER || !MAP_MODE) return;

        nextTileClassify = now + 260;
        classifyPending = true;
        const classifiedKeys = activeTileKeys.slice(0, tileCount);
        const encoder = runtime.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(runtime.classifyPipeline);
        pass.setBindGroup(3, surface.classifyBindGroups[surface.read]);
        pass.dispatchWorkgroups(Math.ceil(tileCount / 64), 1);
        pass.end();
        encoder.copyBufferToBuffer(runtime.tileStatusBuffer, 0, runtime.tileStatusReadback, 0, MAX_TILE_STATUS_BYTES);
        runtime.device.queue.submit([encoder.finish()]);

        runtime.tileStatusReadback.mapAsync(MAP_MODE.READ).then(() => {
          const result = new Float32Array(runtime.tileStatusReadback.getMappedRange());
          for (let i = 0; i < tileCount; i += 1) {
            if (result[i * 4] > 0.5 && classifiedKeys[i]) fullTiles.add(classifiedKeys[i]);
          }
          runtime.tileStatusReadback.unmap();
        }).catch(() => {
          // Ignore pending classification failures during teardown/device loss.
        }).finally(() => {
          classifyPending = false;
        });
      };

      const render = (now: number) => {
        if (cancelled) return;
        const surface = ensureSurface();
        if (!surface) return;

        const dt = Math.min(2.2, Math.max(0.2, (now - last) / 16.67));
        const elapsed = now - started;
        const progress = Math.min(1, elapsed / transition.duration);
        const diffusion = getDiffusionRate(progress, dt);
        const count = writeParticles(particles, elapsed, particleValues, surface.w, surface.h);
        const tileCount = writeActiveTiles(surface, doc, particleValues, count, tileValues, fullTiles, activeTileKeys);
        const write = surface.read === 0 ? 1 : 0;
        last = now;

        simValues.set([surface.w, surface.h, diffusion, count, tileCount, 0, 0, 0]);
        runtime.device.queue.writeBuffer(runtime.simParams, 0, simValues);
        runtime.device.queue.writeBuffer(runtime.particleBuffer, 0, particleValues);
        if (tileCount > 0) runtime.device.queue.writeBuffer(runtime.tileBuffer, 0, tileValues);

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
        if (tileCount > 0) {
          const simPass = encoder.beginComputePass();
          simPass.setPipeline(runtime.simPipeline);
          simPass.setBindGroup(0, surface.simBindGroups[surface.read]);
          simPass.dispatchWorkgroups(Math.ceil(TILE_SIZE / 8), Math.ceil(TILE_SIZE / 8), tileCount);
          simPass.end();
          surface.read = write as 0 | 1;
        }

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
        classifyTiles(surface, tileCount, now);
        if (progress < 1) frame = requestAnimationFrame(render);
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
