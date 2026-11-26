import type { T } from "./i18n";

/** "2 цаг 15 минутын дараа" / "in 2 h 15 min", "45 минутын өмнө" / "45 min ago". Under a minute reads as "now". */
export function relativeText(ms: number, t: T): string {
  const ahead = ms >= 0;
  const mins = Math.round(Math.abs(ms) / 6e4);
  if (mins < 1) return t("одоо", "now");
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  // Mongolian puts only the last unit in the genitive: "2 цаг 15 минутын", "3 хоногийн".
  const parts: [number, string, string, string][] = [[d, "хоног", "хоногийн", "d"], [h, "цаг", "цагийн", "h"], [d ? 0 : m, "минут", "минутын", "min"]]; // i18n-ok: Mongolian unit words, English units beside them
  const used = parts.filter(([n]) => n > 0);
  const mn = used.map(([n, word, gen], i) => `${n} ${i === used.length - 1 ? gen : word}`).join(" ");
  const en = used.map(([n, , , unit]) => `${n} ${unit}`).join(" ");
  return ahead ? t(`${mn} дараа`, `in ${en}`) : t(`${mn} өмнө`, `${en} ago`);
}
