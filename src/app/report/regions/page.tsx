import { RegionsView } from "@/components/report/RegionsView";
import { Suspense } from "react";

export default function RegionsPage() {
  return (
    <Suspense fallback={<p className="text-ink-2">Loading regions…</p>}>
      <RegionsView />
    </Suspense>
  );
}
