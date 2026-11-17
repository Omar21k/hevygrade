import type { Evidence } from "@/report/view";

/** The numbers behind a move, one labeled line each. */
export function EvidenceList({ items, compact = false }: { items: Evidence[]; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <dl className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[84px_1fr] gap-3 text-[14px] leading-[22px]">
          <dt className="font-medium text-ink-3">{item.label}</dt>
          <dd className={item.label === "Check" ? "text-ink" : "text-ink-2"}>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}
