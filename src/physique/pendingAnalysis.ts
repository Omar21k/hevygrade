import type { PhysiqueView } from "./types";

export type PendingPhotos = Partial<Record<PhysiqueView, File>>;

let pending: PendingPhotos | null = null;
let inflight: Promise<Response> | null = null;

/** Held in memory only for the jump from the photos page to the preparing page. */
export function stashPendingPhotos(photos: PendingPhotos) {
  pending = photos;
  inflight = null;
}

export function hasPendingPhotos(): boolean {
  return pending !== null && Object.keys(pending).length > 0;
}

export function peekPendingPhotos(): PendingPhotos | null {
  return pending;
}

export function pendingPhotoViews(): PhysiqueView[] {
  return pending ? (Object.keys(pending) as PhysiqueView[]) : [];
}

/**
 * Posts the stashed photos once. A second call while the request is running
 * shares that request, so React's remount doesn't send the photos twice.
 */
export function postPendingPhotos(): Promise<Response> {
  if (!pending) return Promise.reject(new Error("no-photos"));
  if (!inflight) {
    const form = new FormData();
    for (const [view, file] of Object.entries(pending)) {
      if (file) form.append(view, file);
    }
    inflight = fetch("/api/physique", { method: "POST", body: form }).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function clearPendingPhotos() {
  pending = null;
  inflight = null;
}
