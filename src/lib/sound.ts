"use client";
/**
 * Alert sounds, synthesised with the Web Audio API so no audio files ship. Each cue is a short,
 * soft metallic chime: partials of a struck bar with an exponential decay.
 *   signal  a setup turned active: three rising strikes
 *   news    a key release is near or out: two even strikes
 *   trade   the robot opened or closed a trade: one bright strike
 * The on/off choice is a per-browser convenience kept in localStorage; it defaults to on.
 */
export type Cue = "signal" | "news" | "trade";

const KEY = "xau_sound";
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: stays default */ }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Browsers only allow sound after a user gesture; call this once from any click or key press. */
export function unlockSound() {
  audio();
}

function strike(ac: AudioContext, at: number, freq: number, gain: number) {
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  out.connect(ac.destination);
  // A struck metal bar: the fundamental plus two inharmonic partials that die away faster.
  for (const [mult, level, decay] of [[1, 1, 1.4], [2.76, 0.35, 0.6], [5.4, 0.12, 0.3]] as const) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
}

export function playCue(cue: Cue) {
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime + 0.02;
  if (cue === "signal") { strike(ac, t, 660, 0.16); strike(ac, t + 0.14, 880, 0.15); strike(ac, t + 0.28, 1175, 0.14); }
  else if (cue === "news") { strike(ac, t, 784, 0.15); strike(ac, t + 0.32, 784, 0.12); }
  else strike(ac, t, 1046, 0.15);
}
