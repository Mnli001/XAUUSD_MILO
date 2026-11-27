"use client";
import { useState } from "react";
import type { PublicRecord } from "@/lib/publicRecord";
import { LiveRecordView } from "./LiveRecordView";
import { useViewer } from "./PrefsProvider";
import { usePoll } from "./usePoll";

const REFRESH_MS = 60_000; // the server works the figures out at most once a minute

/** The live record as the server rendered it, then fetched again every minute while the tab is open. */
export function LiveRecord({ initial }: { initial: PublicRecord | null }) {
  const v = useViewer();
  const [record, setRecord] = useState(initial);
  usePoll(async () => {
    const res = await fetch("/api/public-record", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { record: PublicRecord | null };
    setRecord(body.record);
  }, REFRESH_MS, true, false);
  return <LiveRecordView record={record} v={v} />;
}
