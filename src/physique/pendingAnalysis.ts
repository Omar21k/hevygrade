import type { Finding, LagMap } from "@/scoring";
import type { PhysiqueAssessment, PhysiqueView } from "./types";

export type PendingPhotos = Partial<Record<PhysiqueView, File>>;

export type PhysiqueUpload = {
  ok: boolean;
  status: number;
  views: PhysiqueView[];
  payload: {
    error?: string;
    assessment?: PhysiqueAssessment;
    lagMap?: LagMap;
    findings?: Finding[];
  };
};

let pending: PendingPhotos | null = null;
let inflight: Promise<PhysiqueUpload> | null = null;

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
 * Posts the stashed photos once and reads the body once. React runs the
 * preparing effect twice in development, and a Response body can only be
 * read once, so both callers share this already-parsed result.
 */
export function postPendingPhotos(): Promise<PhysiqueUpload> {
  if (!pending) return Promise.reject(new Error("no-photos"));
  if (!inflight) {
    const views = pendingPhotoViews();
    const form = new FormData();
    for (const [view, file] of Object.entries(pending)) {
      if (file) form.append(view, file);
    }
    inflight = fetch("/api/physique", { method: "POST", body: form })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PhysiqueUpload["payload"];
        return { ok: response.ok, status: response.status, views, payload };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function clearPendingPhotos() {
  pending = null;
  inflight = null;
}
