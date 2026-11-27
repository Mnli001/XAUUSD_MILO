"use client";
import { useRouter } from "next/navigation";
import { DemoOpenForm } from "./DemoOpenForm";

/** The first visit: open the first demo account, then the terminal loads. */
export function DemoOpenScreen() {
  const router = useRouter();
  return <DemoOpenForm count={0} onOpened={(id) => { router.push(`/demo?a=${id}`); router.refresh(); }} />;
}
