/** Prints the FRED release name behind every configured id: npm run check-fred */
import { EVENT_TYPES } from "../src/lib/data/calendarProvider";

async function main() {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY тохируулаагүй байна");
  for (const t of EVENT_TYPES) {
    if (t.fredReleaseId === null) continue;
    const res = await fetch(`https://api.stlouisfed.org/fred/release?release_id=${t.fredReleaseId}&file_type=json&api_key=${key}`);
    const body = (await res.json()) as { releases?: { name: string }[] };
    console.log(`${t.type.padEnd(7)} id=${String(t.fredReleaseId).padEnd(4)} → ${body.releases?.[0]?.name ?? `АЛДАА (HTTP ${res.status})`}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
