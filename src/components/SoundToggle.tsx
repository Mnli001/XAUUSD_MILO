"use client";
import { useState, useSyncExternalStore } from "react";
import { playCue, setSoundEnabled, soundEnabled, unlockSound, type Cue } from "@/lib/sound";
import { useT } from "./PrefsProvider";

const subscribe = () => () => {};

/** On/off for the alert sounds in this browser, with a way to hear each cue. */
export function SoundToggle() {
  const t = useT();
  const stored = useSyncExternalStore(subscribe, soundEnabled, () => true);
  const [on, setOn] = useState<boolean | null>(null);
  const enabled = on ?? stored;
  const flip = () => { const next = !enabled; setSoundEnabled(next); setOn(next); if (next) { unlockSound(); playCue("signal"); } };
  const cues: [Cue, string][] = [["signal", t("Setup идэвхжсэн", "Setup active")], ["news", t("Мэдээ ойртсон", "Release near")], ["trade", t("Роботын арилжаа", "Robot trade")]];
  return (
    <section className="card space-y-4" aria-labelledby="sound-h">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="sound-h" className="text-[15px] font-semibold text-zinc-100">{t("Дохионы дуу", "Alert sounds")}</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-400">{t("Setup идэвхжих, чухал мэдээ гарахаас 5 минутын өмнө болон гарах үед, робот арилжаа нээх, хаахад site нээлттэй байвал дуу гарна. Энэ хөтөч дээр л хадгалагдана.", "While the site is open, a sound plays when a setup turns active, 5 minutes before and when a key release comes out, and when the robot opens or closes a trade. Saved in this browser only.")}</p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-labelledby="sound-h" onClick={flip}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${enabled ? "border-amber-400 bg-amber-400" : "border-zinc-700 bg-zinc-800"}`}>
          <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full shadow transition-[left] duration-200 ease-out ${enabled ? "left-[22px] bg-zinc-950" : "left-0.5 bg-zinc-400"}`} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {cues.map(([cue, label]) => (
          <button key={cue} type="button" disabled={!enabled} onClick={() => { unlockSound(); playCue(cue); }} className="btn-ghost min-h-9 text-[13px]">
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor" /><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
