import { PageSkeleton } from "@/components/PageSkeleton";

/** Shown at once on every navigation inside the app, while the server renders the page. */
export default function Loading() {
  return <PageSkeleton />;
}
