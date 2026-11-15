import { ReportShell } from "@/components/report/ReportShell";
import { ReportProvider } from "@/report/ReportContext";
import type { ReactNode } from "react";

export default function ReportLayout({ children }: { children: ReactNode }) {
  return (
    <ReportProvider>
      <ReportShell>{children}</ReportShell>
    </ReportProvider>
  );
}
