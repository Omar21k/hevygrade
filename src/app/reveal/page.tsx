import { RevealFallback, ScoreReveal } from "@/components/report/ScoreReveal";
import { ReportProvider } from "@/report/ReportContext";
import { Suspense } from "react";

export default function RevealPage() {
  return (
    <Suspense fallback={<RevealFallback />}>
      <ReportProvider>
        <ScoreReveal />
      </ReportProvider>
    </Suspense>
  );
}
