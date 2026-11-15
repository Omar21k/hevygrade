import type { RegionStatus } from "@/report/view";

/**
 * Neutral track, shaded target band, marker at the recorded value. Shares one
 * axis (0 → axisMax) across rows. Decorative: the numbers are always shown as text.
 */
export function VolumeRangeBar({
  value,
  min,
  max,
  axisMax,
  status,
}: {
  value: number;
  min: number;
  max: number;
  axisMax: number;
  status: RegionStatus;
}) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / axisMax) * 100))}%`;
  const marker = status === "on-track" ? "bg-good" : status === "insufficient-data" ? "bg-ink-3" : "bg-warn";
  return (
    <div aria-hidden className="relative h-2 w-full rounded-full bg-raised">
      <div className="absolute inset-y-0 rounded-full bg-ink-3/30" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
      <div
        className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg ${marker}`}
        style={{ left: pct(value) }}
      />
    </div>
  );
}
