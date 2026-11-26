import { redirect } from "next/navigation";

/** The old "waiting for access" page: everyone signed in now uses the site, with paid numbers hidden until a plan. */
export default function LockedPage() {
  redirect("/today");
}
