"use client";
import { useState, type ReactNode } from "react";

/**
 * The three setups as a list on the left (a sideways row on phones) and the chosen one's panel beside it. The panels are
 * rendered on the server; this only decides which one shows, so one chart is on screen instead of three.
 */
export function SetupTabs({ ids, tabs, panels, label, aside }: { ids: string[]; tabs: ReactNode[]; panels: ReactNode[]; label: string; aside?: ReactNode }) {
  const [sel, setSel] = useState(0);
  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-5">
      <div className="min-w-0 space-y-3">
        <div role="tablist" aria-label={label} aria-orientation="vertical" className="relative -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {tabs.map((tab, i) => (
            <button
              key={ids[i]}
              type="button"
              role="tab"
              id={`setup-tab-${ids[i]}`}
              aria-selected={sel === i}
              aria-controls={`setup-panel-${ids[i]}`}
              onClick={() => setSel(i)}
              className={`glass-tile w-[16.5rem] shrink-0 p-4 text-left lg:w-full ${sel === i ? "glass-tile-on" : ""}`}
            >
              {tab}
            </button>
          ))}
        </div>
        {aside}
      </div>
      <div className="min-w-0">
        {panels.map((panel, i) => (
          <div key={ids[i]} role="tabpanel" id={`setup-panel-${ids[i]}`} aria-labelledby={`setup-tab-${ids[i]}`} hidden={sel !== i}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
