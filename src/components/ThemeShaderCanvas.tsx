import { useLayoutEffect, useRef, useState } from 'react';
import { ThemeShaderCanvasWebGPU } from './ThemeShaderCanvasWebGPU';

type ShaderTheme = 'light' | 'dark';

export type ThemeShaderTransition = {
  id: number;
  from: ShaderTheme;
  to: ShaderTheme;
  origin: { x: number; y: number };
  duration: number;
};

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

type Surface = {
  w: number;
  h: number;
  tex: [WebGLTexture, WebGLTexture];
  fb: [WebGLFramebuffer, WebGLFramebuffer];
  read: 0 | 1;
};

type TransitionMeta = Pick<ThemeShaderTransition, 'from' | 'to'>;

const colors: Record<ShaderTheme, [number, number, number]> = {
  light: [251 / 255, 251 / 255, 250 / 255],
  dark: [5 / 255, 5 / 255, 5 / 255],
};

const PARTICLES = 18;
const CELL_SIZE = 22;
const vertexShader = `#version 300 es
const vec2 p[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
void main(){gl_Position=vec4(p[gl_VertexID],0,1);}
`;

const simulationShader = `#version 300 es
precision highp float;
#define PARTICLES ${PARTICLES}
uniform sampler2D u_state;
uniform vec2 u_size;
uniform float u_diffuse;
uniform int u_count;
uniform vec4 u_particles[PARTICLES];
out vec4 outColor;

float s(vec2 o){
  return texture(u_state,clamp((gl_FragCoord.xy+o)/u_size,vec2(0),vec2(1))).r;
}

void main(){
  float c=s(vec2(0));
  float m=max(max(s(vec2(-1,0)),s(vec2(1,0))),max(s(vec2(0,-1)),s(vec2(0,1))));
  m=max(m,max(max(s(vec2(-1,-1)),s(vec2(1,-1))),max(s(vec2(-1,1)),s(vec2(1,1)))));
  float v=max(c,mix(c,m,u_diffuse));

  for(int i=0;i<PARTICLES;i++){
    if(i>=u_count) break;
    vec4 p=u_particles[i];
    v=max(v,(1.0-smoothstep(p.z*0.35,p.z,distance(gl_FragCoord.xy,p.xy)))*p.w);
  }

  outColor=vec4(clamp(v,0.0,1.0),0,0,1);
}
`;

const renderShader = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform vec2 u_stateSize;
uniform vec4 u_page;
uniform vec3 u_from;
uniform vec3 u_to;
out vec4 outColor;

float stateAt(vec2 uv){
  return texture(u_state,clamp(uv,vec2(0),vec2(1))).r;
}

void main(){
  vec2 page=vec2(u_page.x+gl_FragCoord.x,u_page.w-(u_page.y+u_resolution.y-gl_FragCoord.y));
  vec2 uv=page/u_page.zw;
  vec2 px=1.0/u_stateSize;
  float state=(
    stateAt(uv)*4.0+
    (stateAt(uv+vec2(px.x,0))+stateAt(uv-vec2(px.x,0))+stateAt(uv+vec2(0,px.y))+stateAt(uv-vec2(0,px.y)))*2.0+
    stateAt(uv+px)+stateAt(uv-px)+stateAt(uv+vec2(px.x,-px.y))+stateAt(uv+vec2(-px.x,px.y))
  )/16.0;
  state=smoothstep(0.01,0.99,state);
  outColor=vec4(mix(u_from,u_to,state),1);
}
`;

const transformShader = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2 u_size;
uniform bool u_invert;
out vec4 outColor;

void main(){
  float state=texture(u_state,gl_FragCoord.xy/u_size).r;
  outColor=vec4(u_invert?1.0-state:state,0,0,1);
}
`;

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
};

const program = (gl: WebGL2RenderingContext, fragment: string) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const linked = vertex && frag && gl.createProgram();
  if (!linked || !vertex || !frag) return null;
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, frag);
  gl.linkProgram(linked);
  gl.deleteShader(vertex);
  gl.deleteShader(frag);
  if (gl.getProgramParameter(linked, gl.LINK_STATUS)) return linked;
  console.warn(gl.getProgramInfoLog(linked));
  gl.deleteProgram(linked);
  return null;
};

const makeSurface = (gl: WebGL2RenderingContext, w: number, h: number): Surface | null => {
  const tex = [gl.createTexture(), gl.createTexture()] as [WebGLTexture | null, WebGLTexture | null];
  const fb = [gl.createFramebuffer(), gl.createFramebuffer()] as [WebGLFramebuffer | null, WebGLFramebuffer | null];
  if (!tex[0] || !tex[1] || !fb[0] || !fb[1]) return null;

  tex.forEach((texture, i) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });

  return { w, h, tex: tex as [WebGLTexture, WebGLTexture], fb: fb as [WebGLFramebuffer, WebGLFramebuffer], read: 0 };
};

const dispose = (gl: WebGL2RenderingContext, surface: Surface | null) => {
  surface?.tex.forEach((texture) => gl.deleteTexture(texture));
  surface?.fb.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
};

const clearSurface = (gl: WebGL2RenderingContext, surface: Surface) => {
  gl.viewport(0, 0, surface.w, surface.h);
  gl.clearColor(0, 0, 0, 1);
  surface.fb.forEach((framebuffer) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  surface.read = 0;
};

const invertSurface = (gl: WebGL2RenderingContext, surface: Surface, transformProgram: WebGLProgram, vao: WebGLVertexArrayObject) => {
  const write = surface.read === 0 ? 1 : 0;

  gl.bindVertexArray(vao);
  gl.useProgram(transformProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, surface.fb[write]);
  gl.viewport(0, 0, surface.w, surface.h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, surface.tex[surface.read]);
  gl.uniform1i(gl.getUniformLocation(transformProgram, 'u_state'), 0);
  gl.uniform2f(gl.getUniformLocation(transformProgram, 'u_size'), surface.w, surface.h);
  gl.uniform1i(gl.getUniformLocation(transformProgram, 'u_invert'), 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  surface.read = write as 0 | 1;
};

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

const makeParticles = (transition: ThemeShaderTransition, docW: number, docH: number, sw: number, sh: number) => {
  const x = (transition.origin.x / docW) * sw;
  const y = ((docH - transition.origin.y) / docH) * sh;
  const speed = Math.max(sw, sh);

  return Array.from({ length: PARTICLES }, (_, i): Particle => {
    const angle = (i / PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.85;
    const v = speed * (0.95 + Math.random() * 0.5);
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
    const radiusScale = progress < 0.86 ? 1 : Math.max(0, (1 - progress) / 0.14);
    const wobble = Math.sin(seconds * 12 + p.phase) * p.wobble * (1 - progress);
    const offset = count * 4;

    values[offset] = reflect(p.x + p.vx * seconds + wobble, w - 1);
    values[offset + 1] = reflect(p.y + p.vy * seconds + Math.cos(seconds * 8 + p.phase) * p.wobble * (1 - progress), h - 1);
    values[offset + 2] = p.radius * radiusScale;
    values[offset + 3] = radiusScale;
    count += 1;
  });

  return count;
};

const ThemeShaderCanvasWebGL = ({
  transition,
  onSmokeVisibilityChange,
}: {
  transition: ThemeShaderTransition | null;
  onSmokeVisibilityChange: (visible: boolean) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programsRef = useRef<{ sim: WebGLProgram | null; draw: WebGLProgram | null; transform: WebGLProgram | null }>({
    sim: null,
    draw: null,
    transform: null,
  });
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const metaRef = useRef<TransitionMeta | null>(null);
  const onSmokeVisibilityChangeRef = useRef(onSmokeVisibilityChange);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    onSmokeVisibilityChangeRef.current = onSmokeVisibilityChange;
  }, [onSmokeVisibilityChange]);

  useLayoutEffect(() => {
    if (!transition) {
      if (glRef.current) {
        dispose(glRef.current, surfaceRef.current);
        surfaceRef.current = null;
      }
      metaRef.current = null;
      setActive(false);
      return;
    }

    const canvas = canvasRef.current;
    const gl =
      glRef.current ??
      canvas?.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!canvas || !gl) return;

    glRef.current = gl;
    programsRef.current.sim ??= program(gl, simulationShader);
    programsRef.current.draw ??= program(gl, renderShader);
    programsRef.current.transform ??= program(gl, transformShader);
    vaoRef.current ??= gl.createVertexArray();

    const sim = programsRef.current.sim;
    const drawProgram = programsRef.current.draw;
    const transformProgram = programsRef.current.transform;
    const vao = vaoRef.current;
    if (!sim || !drawProgram || !transformProgram || !vao) return;

    const simUniforms = {
      state: gl.getUniformLocation(sim, 'u_state'),
      size: gl.getUniformLocation(sim, 'u_size'),
      diffuse: gl.getUniformLocation(sim, 'u_diffuse'),
      count: gl.getUniformLocation(sim, 'u_count'),
      particles: gl.getUniformLocation(sim, 'u_particles[0]'),
    };
    const drawUniforms = {
      state: gl.getUniformLocation(drawProgram, 'u_state'),
      resolution: gl.getUniformLocation(drawProgram, 'u_resolution'),
      stateSize: gl.getUniformLocation(drawProgram, 'u_stateSize'),
      page: gl.getUniformLocation(drawProgram, 'u_page'),
      from: gl.getUniformLocation(drawProgram, 'u_from'),
      to: gl.getUniformLocation(drawProgram, 'u_to'),
    };

    let frame = 0;
    let particles: Particle[] = [];
    let last = performance.now();
    const started = last;
    const particleValues = new Float32Array(PARTICLES * 4);
    const sample = new Uint8Array(9);
    const doc = pageSize();
    const from = colors[transition.from];
    const to = colors[transition.to];
    const previous = metaRef.current;
    let prepared = false;
    let lastSmokeVisible: boolean | null = null;
    let nextSmokeSample = 0;

    const ensureSurface = () => {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const cell = viewportW < 640 ? 16 : CELL_SIZE;
      const sw = Math.max(2, Math.ceil(doc.w / cell));
      const sh = Math.max(2, Math.ceil(doc.h / cell));

      if (canvas.width !== viewportW || canvas.height !== viewportH) {
        canvas.width = viewportW;
        canvas.height = viewportH;
      }
      if (!surfaceRef.current || surfaceRef.current.w !== sw || surfaceRef.current.h !== sh) {
        dispose(gl, surfaceRef.current);
        surfaceRef.current = makeSurface(gl, sw, sh);
        prepared = false;
      }

      const surface = surfaceRef.current;
      if (!surface) return null;

      if (!prepared) {
        if (previous?.from === transition.to && previous.to === transition.from) {
          invertSurface(gl, surface, transformProgram, vao);
        } else if (previous && (previous.from !== transition.from || previous.to !== transition.to)) {
          clearSurface(gl, surface);
        }

        particles = makeParticles(transition, doc.w, doc.h, sw, sh);
        metaRef.current = { from: transition.from, to: transition.to };
        prepared = true;
      }

      return surface;
    };

    const render = (now: number) => {
      const current = ensureSurface();
      if (!current) return;

      const dt = Math.min(2.2, Math.max(0.2, (now - last) / 16.67));
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / transition.duration);
      const diffusion = getDiffusionRate(progress, dt);
      const write = current.read === 0 ? 1 : 0;
      last = now;

      gl.bindVertexArray(vao);
      gl.useProgram(sim);
      gl.bindFramebuffer(gl.FRAMEBUFFER, current.fb[write]);
      gl.viewport(0, 0, current.w, current.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, current.tex[current.read]);
      gl.uniform1i(simUniforms.state, 0);
      gl.uniform2f(simUniforms.size, current.w, current.h);
      gl.uniform1f(simUniforms.diffuse, diffusion);
      gl.uniform1i(simUniforms.count, writeParticles(particles, elapsed, particleValues, current.w, current.h));
      gl.uniform4fv(simUniforms.particles, particleValues);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      current.read = write as 0 | 1;

      const smoke = now >= nextSmokeSample ? document.querySelector<HTMLElement>('[data-smoke-link]') : null;
      const rect = smoke?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        nextSmokeSample = now + 140;
        const x = Math.floor(((window.scrollX + rect.left + rect.width / 2) / doc.w) * current.w);
        const y = Math.floor(((doc.h - (window.scrollY + rect.top + rect.height / 2)) / doc.h) * current.h);
        const sampleW = Math.min(3, current.w);
        const sampleH = Math.min(3, current.h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, current.fb[current.read]);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
        gl.readPixels(
          Math.min(current.w - sampleW, Math.max(0, x - 1)),
          Math.min(current.h - sampleH, Math.max(0, y - 1)),
          sampleW,
          sampleH,
          gl.RED,
          gl.UNSIGNED_BYTE,
          sample,
        );
        let total = 0;
        for (let i = 0; i < sampleW * sampleH; i += 1) total += sample[i];
        const state = total / (sampleW * sampleH);
        const blackness = transition.to === 'dark' ? state : 255 - state;
        const smokeVisible = blackness > 138;
        if (smokeVisible !== lastSmokeVisible) {
          lastSmokeVisible = smokeVisible;
          onSmokeVisibilityChangeRef.current(smokeVisible);
        }
      }

      gl.useProgram(drawProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, current.tex[current.read]);
      gl.uniform1i(drawUniforms.state, 0);
      gl.uniform2f(drawUniforms.resolution, canvas.width, canvas.height);
      gl.uniform2f(drawUniforms.stateSize, current.w, current.h);
      gl.uniform4f(drawUniforms.page, window.scrollX, window.scrollY, doc.w, doc.h);
      gl.uniform3f(drawUniforms.from, from[0], from[1], from[2]);
      gl.uniform3f(drawUniforms.to, to[0], to[1], to[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (progress < 1) frame = requestAnimationFrame(render);
    };

    setActive(true);
    render(started);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [transition]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`theme-shader-canvas ${active ? 'is-active' : ''}`} />;
};

export const ThemeShaderCanvas = (props: {
  transition: ThemeShaderTransition | null;
  onSmokeVisibilityChange: (visible: boolean) => void;
}) => {
  const [backend, setBackend] = useState<'webgpu' | 'webgl'>(() => {
    if (typeof navigator === 'undefined') return 'webgl';
    return 'gpu' in navigator ? 'webgpu' : 'webgl';
  });

  if (backend === 'webgpu') {
    return <ThemeShaderCanvasWebGPU {...props} onUnavailable={() => setBackend('webgl')} />;
  }

  return <ThemeShaderCanvasWebGL {...props} />;
};
