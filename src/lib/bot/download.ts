import { readFile } from "node:fs/promises";
import path from "node:path";

const FILES = {
  ex5: { filename: "XauBot.ex5", contentType: "application/octet-stream" },
  mq5: { filename: "XauBot.mq5", contentType: "text/plain; charset=utf-8" },
} as const;

/** The MT5 robot, compiled or as source. Only these two files can be asked for. */
export async function botFile(kind: string) {
  if (!Object.hasOwn(FILES, kind)) return null;
  const f = FILES[kind as keyof typeof FILES];
  return { ...f, body: await readFile(path.join(process.cwd(), "mt5", f.filename)) };
}
