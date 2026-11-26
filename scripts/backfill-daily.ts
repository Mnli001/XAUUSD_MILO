/** Loads up to 5000 daily candles (about 19 years), which the weekly trend needs:  npx tsx --env-file=.env scripts/backfill-daily.ts */
import { ingestPrices } from "../src/lib/ingest/prices";
import { TwelveData } from "../src/lib/data/twelveData";
import { closeDb } from "../src/lib/db";
ingestPrices(new TwelveData(process.env.TWELVEDATA_API_KEY!), { tfs: ["1day"], now: new Date(), outputsize: 5000 }).then((r) => { console.log(JSON.stringify(r)); return closeDb(); });
