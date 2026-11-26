"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";
import { useT } from "@/components/PrefsProvider";

/** Something broke while drawing a page outside the signed-in app (the root layout still stands). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <ErrorScreen
      code="500"
      title={t("Алдаа гарлаа", "Something went wrong")}
      body={t(`Хуудсыг ачаалах үед алдаа гарлаа. Дахин оролдоно уу; давтагдвал админд хэлээрэй${digest ? ` (код ${digest})` : ""}.`, `The page failed to load. Try again; if it keeps happening, tell the admin${digest ? ` (code ${digest})` : ""}.`)}
      actions={<><button type="button" className="btn" onClick={() => retry()}>{t("Дахин оролдох", "Try again")}</button><Link href="/" className="btn-ghost">{t("Нүүр хуудас руу", "Go to the home page")}</Link></>}
    />
  );
}
