export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function weightedMean(
  items: { value: number; weight: number }[],
): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  const total = items.reduce((sum, item) => sum + item.value * item.weight, 0);
  return total / totalWeight;
}
