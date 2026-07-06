import { useLayoutEffect, useRef, useState } from 'react';

type ShaderTheme = 'light' | 'dark';

export type ThemeShaderTransition = {
  id: number;
  from: ShaderTheme;
  to: ShaderTheme;
  origin: {
    x: number;
    y: number;
  };
  radius: number;
  feather: number;
  duration: number;
};

const themeColors: Record<ShaderTheme, [number, number, number]> = {
  light: [251 / 255, 251 / 255, 250 / 255],
  dark: [5 / 255, 5 / 255, 5 / 255],
};

const vertexShaderSource = `#version 300 es
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_origin;
uniform vec3 u_fromColor;
uniform vec3 u_toColor;
uniform float u_radius;
uniform float u_feather;

out vec4 outColor;

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float dist = distance(pixel, u_origin);
  float time = clamp(u_time, 0.0, 1.0);
  float wave = u_radius * time;
  float reveal = 1.0 - smoothstep(wave, wave + u_feather, dist);
  vec3 color = mix(u_fromColor, u_toColor, reveal);
  outColor = vec4(color, 1.0);
}
`;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

const createProgram = (gl: WebGL2RenderingContext) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

export const ThemeShaderCanvas = ({ transition }: { transition: ThemeShaderTransition | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vertexArrayRef = useRef<WebGLVertexArrayObject | null>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    if (!transition) {
      setActive(false);
      return;
    }

    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });

    if (!canvas || !gl) {
      return;
    }

    if (!programRef.current) {
      programRef.current = createProgram(gl);
      vertexArrayRef.current = gl.createVertexArray();
    }

    const program = programRef.current;
    const vertexArray = vertexArrayRef.current;

    if (!program || !vertexArray) {
      return;
    }

    const uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      origin: gl.getUniformLocation(program, 'u_origin'),
      fromColor: gl.getUniformLocation(program, 'u_fromColor'),
      toColor: gl.getUniformLocation(program, 'u_toColor'),
      radius: gl.getUniformLocation(program, 'u_radius'),
      feather: gl.getUniformLocation(program, 'u_feather'),
    };

    let animationFrame = 0;
    let startedAt = 0;
    const fromColor = themeColors[transition.from];
    const toColor = themeColors[transition.to];

    const draw = (progress: number) => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, progress);
      gl.uniform2f(uniforms.origin, transition.origin.x, transition.origin.y);
      gl.uniform3f(uniforms.fromColor, fromColor[0], fromColor[1], fromColor[2]);
      gl.uniform3f(uniforms.toColor, toColor[0], toColor[1], toColor[2]);
      gl.uniform1f(uniforms.radius, transition.radius);
      gl.uniform1f(uniforms.feather, transition.feather);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const render = (now: number) => {
      if (startedAt === 0) startedAt = now;

      const progress = Math.min(1, Math.max(0, (now - startedAt) / transition.duration));
      draw(progress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    draw(0);
    setActive(true);
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [transition]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`theme-shader-canvas ${active ? 'is-active' : ''}`} />;
};
