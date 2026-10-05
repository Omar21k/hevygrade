export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(barbell|dumbbell|dumbells|cable|machine|ez|bar|smith|plate|loaded|band|kettlebell)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(name: string): Set<string> {
  return new Set(normalizeExerciseName(name).split(" ").filter((t) => t.length > 1));
}

export function nameSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}
