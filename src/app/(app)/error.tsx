"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";
import { useT } from "@/components/PrefsProvider";

/** Something broke inside the signed-in app: the menu stays, this card takes the page's place. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <ErrorScreen
      full={false}
      code="500"
      title={t("Энэ хуудсыг ачаалж чадсангүй", "This page could not load")}
      body={t(`Түр зуурын алдаа байж магадгүй. Дахин оролдоно уу; давтагдвал админд хэлээрэй${digest ? ` (код ${digest})` : ""}.`, `It may be a passing fault. Try again; if it keeps happening, tell the admin${digest ? ` (code ${digest})` : ""}.`)}
      actions={<><button type="button" className="btn" onClick={() => retry()}>{t("Дахин оролдох", "Try again")}</button><Link href="/today" className="btn-ghost">{t("Өнөөдөр хуудас руу", "Go to Today")}</Link></>}
    />
  );
}
