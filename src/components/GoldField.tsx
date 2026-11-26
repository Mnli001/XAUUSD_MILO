"use client";
import { useEffect, useRef } from "react";

/*
 * A slow field of poured gold. Built to stay smooth on a laptop with integrated graphics:
 *   - the flow is evaluated once per pixel and reused; the surface normal costs two cheap samples
 *     of the last layer instead of two more full evaluations (7 noise layers a pixel, not 15);
 *   - it is drawn into a small buffer (at most ~230k pixels) and stretched, which suits a soft field;
 *   - frames are capped at 30 a second, and the buffer shrinks further if frames still run long;
 *   - nothing is drawn while the canvas is off screen or the tab is hidden;
 *   - with reduced motion it draws one still frame and stops; on small or low-power devices
 *     (narrow screens, little memory, data saver) it does not start WebGL at all.
 */
const FRAG = `
precision highp float;
uniform vec2 r; uniform float t; uniform vec2 m;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1.0,0.0)), f.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*n(p); p = p*2.03 + vec2(3.1,1.7); a *= 0.5; } return s; }
// The flow that bends the surface: computed once per pixel and reused for the two slope samples.
vec2 warp(vec2 p, float tt){
  vec2 q = vec2(fbm(p + tt), fbm(p + vec2(5.2,1.3) - tt));
  return vec2(fbm(p + 2.6*q + vec2(1.7,9.2) + tt*0.7), fbm(p + 2.6*q + vec2(8.3,2.8) - tt*0.5));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*r) / r.y;
  vec2 p = uv*1.35 + vec2(t*0.035, 0.2 - t*0.02);
  vec2 w = 3.2 * warp(p, t*0.17);
  float f = fbm(p + w);
  // Slope of the height field: two more samples of the last layer only, with the flow held still.
  float e = 0.012;
  vec2 g = vec2(fbm(p + w + vec2(e, 0.0)) - f, fbm(p + w + vec2(0.0, e)) - f);
  vec3 nrm = normalize(vec3(-g * 85.0, 1.0));
  vec3 l = normalize(vec3(0.45 + m.x*0.9, 0.6 + m.y*0.9, 0.75));
  float diff = max(dot(nrm, l), 0.0);
  float spec = pow(max(dot(reflect(-l, nrm), vec3(0.0,0.0,1.0)), 0.0), 26.0);
  vec3 deep = vec3(0.16, 0.10, 0.03);
  vec3 gold = vec3(0.85, 0.69, 0.36);
  vec3 hi = vec3(1.0, 0.94, 0.78);
  vec3 c = mix(deep, gold, smoothstep(0.42, 0.98, diff)) * (0.25 + 1.05*f*f*1.6);
  c += hi * spec * 0.75;
  float v = smoothstep(1.45, 0.25, length((uv - vec2(0.42, 0.05)) * vec2(0.85, 1.15)));
  gl_FragColor = vec4(mix(vec3(0.043, 0.039, 0.035), c, v), 1.0);
}`;
const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";

const MAX_PIXELS = 230_000; // the buffer's budget at full quality
const MIN_PIXELS = 60_000;
const FRAME_MS = 1000 / 30;

/** Phones, low-memory devices and data saver get the still gradient: the field is decoration, not worth the battery. */
function lowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return window.innerWidth < 640 || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || nav.connection?.saveData === true;
}

/** Decorative; one still frame under reduced motion; a still gradient when WebGL is unavailable or the device is small. */
export function GoldField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || lowPower()) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return;
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
    const ur = gl.getUniformLocation(prog, "r"), ut = gl.getUniformLocation(prog, "t"), um = gl.getUniformLocation(prog, "m");

    let budget = MAX_PIXELS;
    const size = () => {
      const w = canvas.clientWidth || 1, hgt = canvas.clientHeight || 1;
      const k = Math.min(1, Math.sqrt(budget / (w * hgt)));
      canvas.width = Math.max(2, Math.round(w * k));
      canvas.height = Math.max(2, Math.round(hgt * k));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    size();

    // The light leans toward the pointer, eased so it glides.
    const aim = { x: 0, y: 0 }, at = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { aim.x = e.clientX / window.innerWidth - 0.5; aim.y = 0.5 - e.clientY / window.innerHeight; };
    window.addEventListener("pointermove", onMove, { passive: true });

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, onScreen = true, last = 0, clock = 40, slow = 0, measured = 0;
    const draw = () => { gl.uniform2f(ur, canvas.width, canvas.height); gl.uniform1f(ut, clock); gl.uniform2f(um, at.x, at.y); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    if (still) {
      // Reduced motion: one frame, redrawn only when the size changes. No pointer light, no loop.
      window.removeEventListener("pointermove", onMove);
      const redraw = () => { size(); draw(); };
      draw();
      window.addEventListener("resize", redraw);
      return () => window.removeEventListener("resize", redraw);
    }
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (!onScreen || document.hidden) { last = 0; return; }
      if (last && ms - last < FRAME_MS - 2) return; // 30 frames a second is plenty for a slow field
      const dt = last ? Math.min(100, ms - last) : FRAME_MS;
      last = ms;
      clock += dt / 1000;
      at.x += (aim.x - at.x) * 0.08; at.y += (aim.y - at.y) * 0.08;
      draw();
      // Long gaps between frames mean a weak GPU: halve the buffer until it keeps up (no gl.finish, which stalls the page).
      if (measured < 90) {
        measured++;
        if (dt > 60) slow++;
        if (measured % 30 === 0) { if (slow > 10 && budget > MIN_PIXELS) { budget = Math.max(MIN_PIXELS, budget / 2); size(); } slow = 0; }
      }
    };
    raf = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(canvas);
    window.addEventListener("resize", size);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", size); window.removeEventListener("pointermove", onMove); };
  }, []);
  // The canvas sits on a still gold gradient, which is what shows when WebGL cannot run.
  return <canvas ref={ref} aria-hidden className={className} style={{ background: "radial-gradient(90% 80% at 68% 45%, #6b5122 0%, #2a2010 45%, #0b0a09 80%)" }} />;
}
