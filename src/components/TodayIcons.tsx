/** The line icons used on Today, drawn like the menu's: 24px grid, 1.8 stroke, round ends, coloured by the text. */
const PATHS = {
  wallet: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  bot: "M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2ZM12 7v4M12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM8 16h.01M16 16h.01",
  chart: "M3 3v18h18M18 17V9M13 17V5M8 17v-3",
  crosshair: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM21 12h-4M7 12H3M12 7V3M12 21v-4",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 7v5l3 2",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  layers: "m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5",
} as const;

export function Icon({ name, className = "" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
