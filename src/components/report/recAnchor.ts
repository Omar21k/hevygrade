export function recAnchor(id: string): string {
  return `rec-${id.replace(/[^a-z0-9_-]/gi, "-")}`;
}
