import { redirect } from "next/navigation";

/** Practice became Demo trade; its bar replay lives there as a tab. */
export default function PracticePage() {
  redirect("/demo?tab=replay");
}
