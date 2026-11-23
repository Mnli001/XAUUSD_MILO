"use client";
import { useEffect, useRef } from "react";

const FRAG = `
precision highp float;
uniform vec2 r; uniform float t;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1.0,0.0)), f.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n(p); p = p*2.03 + vec2(3.1,1.7); a *= 0.5; } return s; }
float field(vec2 p, float tt){
  vec2 q = vec2(fbm(p + tt), fbm(p + vec2(5.2,1.3) - tt));
  vec2 w = vec2(fbm(p + 2.6*q + vec2(1.7,9.2) + tt*0.7), fbm(p + 2.6*q + vec2(8.3,2.8) - tt*0.5));
  return fbm(p + 3.2*w);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*r) / r.y;
  vec2 p = uv*1.35 + vec2(0.0, 0.2);
  float tt = t*0.045;
  float f = field(p, tt);
  // The surface normal from the height field: this is what makes it read as poured metal.
  float e = 0.012;
  float fx = field(p + vec2(e,0.0), tt) - f;
  float fy = field(p + vec2(0.0,e), tt) - f;
  vec3 nrm = normalize(vec3(-fx*38.0, -fy*38.0, 1.0));
  vec3 l = normalize(vec3(0.45, 0.6, 0.75));
  float diff = max(dot(nrm, l), 0.0);
  float spec = pow(max(dot(reflect(-l, nrm), vec3(0.0,0.0,1.0)), 0.0), 26.0);
  vec3 deep = vec3(0.16, 0.10, 0.03);
  vec3 gold = vec3(0.85, 0.69, 0.36);
  vec3 hi = vec3(1.0, 0.94, 0.78);
  vec3 c = mix(deep, gold, smoothstep(0.15, 0.95, diff)) * (0.55 + 0.6*f);
  c += hi * spec * 0.9;
  // Fade into the page: darker at the left (where the words are) and at the edges.
  float v = smoothstep(1.45, 0.25, length((uv - vec2(0.42, 0.05)) * vec2(0.85, 1.15)));
  vec3 ground = vec3(0.043, 0.039, 0.035);
  gl_FragColor = vec4(mix(ground, c, v), 1.0);
}`;
const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";

/** A slow field of poured gold, rendered in a fragment shader. Decorative; one still frame under reduced motion. */
export function GoldField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(prog, "r"), ut = gl.getUniformLocation(prog, "t");

    // Rendered at reduced resolution: the field is soft, and this keeps phones cool.
    const size = () => {
      const k = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * k));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * k));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (ms: number) => { gl.uniform2f(ur, canvas.width, canvas.height); gl.uniform1f(ut, ms / 1000 + 40); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    size();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = true;
    const loop = (ms: number) => { if (visible) draw(ms); raf = requestAnimationFrame(loop); };
    if (still) draw(0); else raf = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const onResize = () => { size(); if (still) draw(0); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} aria-hidden className={className} />;
}
