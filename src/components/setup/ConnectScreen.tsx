"use client";

import { HowItWorksContent, KeyHandlingCopy } from "@/components/HowItWorks";
import { Button, Dialog, Spinner } from "@/components/ui";
import { loadHevySession, saveHevySession, type HevyPayload } from "@/hevy/session";
import { subscribeSession } from "@/lib/sessionStore";
import { useSessionReady } from "@/report/ReportContext";
import {
  clearPhysique,
  loadPhysique,
  resetReportProgress,
  saveLagOverrides,
  savePhysique,
} from "@/report/state";
import { fixtures } from "@/scoring";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { SetupProgress, SetupShell } from "./SetupShell";

type ImportFailure = {
  code?: "missing_key" | "invalid_key" | "no_access" | "rate_limited" | "upstream";
  error?: string;
  retryAfter?: number;
};

type Phase =
  | { kind: "idle" }
  | { kind: "importing" }
  | { kind: "error"; message: string; field: boolean }
  | { kind: "connected"; workouts: number; routines: number };

const serverNull = () => null;

function failureMessage(status: number, body: ImportFailure): { message: string; field: boolean } {
  switch (body.code) {
    case "missing_key":
    case "invalid_key":
      return { message: body.error ?? "Hevy didn't accept that API key.", field: true };
    case "no_access":
      return { message: body.error ?? "Hevy didn't allow access with that key.", field: true };
    case "rate_limited":
      return {
        message: body.retryAfter
          ? `Hevy is limiting requests. Try again in about ${Math.ceil(body.retryAfter / 60)} minute${body.retryAfter > 60 ? "s" : ""}.`
          : "Hevy is limiting requests right now. Try again shortly.",
        field: false,
      };
    default:
      return { message: body.error ?? `Import failed (${status}). Try again in a moment.`, field: false };
  }
}

function demoPayload(): HevyPayload {
  const split = fixtures.laggingUpperChest;
  return {
    demo: true,
    user: { name: "Demo athlete" },
    split,
    exercises: [],
    history: [],
    unmatched: [],
    days: split.days.map((day) => ({ id: day.id, title: day.title, movements: day.exercises.length })),
    workoutCount: 0,
    importedAt: new Date().toISOString(),
  };
}

export function ConnectScreen({ redirectReturning = false }: { redirectReturning?: boolean }) {
  const router = useRouter();
  const ready = useSessionReady();
  const existing = useSyncExternalStore(subscribeSession, loadHevySession, serverNull);
  const existingPhysique = useSyncExternalStore(subscribeSession, loadPhysique, serverNull);
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [howOpen, setHowOpen] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  /** Set once the user acts here, so writing a new session doesn't trigger the returning-user redirect. */
  const acted = useRef(false);
  const inputId = useId();
  const errorId = useId();
  const helpId = useId();

  useEffect(() => {
    if (redirectReturning && !acted.current && ready && existing && existingPhysique) router.replace("/report");
  }, [redirectReturning, ready, existing, existingPhysique, router]);

  useEffect(() => {
    if (phase.kind === "connected") continueRef.current?.focus();
  }, [phase.kind]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (phase.kind === "importing") return;
    acted.current = true;
    setPhase({ kind: "importing" });
    let response: Response;
    try {
      response = await fetch("/api/hevy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
    } catch {
      setPhase({ kind: "error", message: "Couldn't reach Hevygrade. Check your connection and try again.", field: false });
      return;
    }
    const body = (await response.json().catch(() => ({}))) as HevyPayload & ImportFailure;
    if (!response.ok) {
      setPhase({ kind: "error", ...failureMessage(response.status, body) });
      return;
    }
    if (!body.split || body.split.days.length === 0) {
      setPhase({
        kind: "error",
        message:
          "Connected, but your Hevy account has no saved routines. Hevygrade grades your routines, so create one in Hevy and connect again.",
        field: false,
      });
      return;
    }
    saveHevySession({ ...body, importedAt: new Date().toISOString() });
    clearPhysique();
    resetReportProgress();
    setApiKey("");
    setPhase({ kind: "connected", workouts: body.workoutCount, routines: body.days.length });
  }

  function openDemo() {
    acted.current = true;
    saveHevySession(demoPayload());
    savePhysique({ status: "skipped", lagMap: {}, findings: [], views: [] });
    saveLagOverrides({ chest_upper: "lagging", lats: "lagging" });
    resetReportProgress();
    router.push("/reveal");
  }

  const busy = phase.kind === "importing";
  const fieldError = phase.kind === "error" && phase.field ? phase.message : null;

  return (
    <SetupShell
      aside={
        <button
          type="button"
          onClick={() => setHowOpen(true)}
          className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink"
        >
          How it works
        </button>
      }
    >
      <SetupProgress current={1} />

      <h1 className="hg-h1 mt-10">
        Understand your training.
        <br />
        Know what to change next.
      </h1>
      <p className="mt-4 max-w-[560px] text-ink-2">
        Connect your Hevy history for a clearer look at coverage, progression, and training-load balance.
      </p>

      {phase.kind === "connected" ? (
        <section className="hg-rise mt-8 rounded-card border border-line bg-surface p-5 md:p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-medium text-good">
            <span aria-hidden>✓</span> Connected · {phase.workouts} workout{phase.workouts === 1 ? "" : "s"} imported
          </p>
          <p className="mt-1 text-[14px] leading-[22px] text-ink-2">
            {phase.routines} routine{phase.routines === 1 ? "" : "s"} found.
            {phase.workouts === 0
              ? " No logged workouts yet, so growth will be projected from your routines."
              : ""}
          </p>
          <Button ref={continueRef} className="mt-5 w-full sm:w-auto" onClick={() => router.push("/photos")}>
            Continue to photos <span aria-hidden>→</span>
          </Button>
        </section>
      ) : (
        <form onSubmit={connect} className="mt-8 rounded-card border border-line bg-surface p-5 md:p-6" noValidate>
          <h2 className="text-[18px] font-semibold leading-[26px]">Connect your Hevy account</h2>
          <p className="mt-1 text-[14px] leading-[22px] text-ink-2">
            Hevy only issues API keys to Hevy Pro accounts.
          </p>

          <label htmlFor={inputId} className="mt-5 block text-[14px] font-medium leading-[22px] text-ink">
            Hevy API key
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={inputId}
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              value={apiKey}
              disabled={busy}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (phase.kind === "error") setPhase({ kind: "idle" });
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={`${helpId}${fieldError ? ` ${errorId}` : ""}`}
              className={`min-h-11 w-full min-w-0 rounded-control border bg-bg px-3 font-mono text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-accent ${
                fieldError ? "border-bad" : "border-line"
              }`}
              placeholder="Paste your key"
            />
            <Button variant="secondary" onClick={() => setReveal((value) => !value)} aria-pressed={reveal} className="shrink-0">
              {reveal ? "Hide" : "Show"}
            </Button>
          </div>
          {fieldError ? (
            <p id={errorId} className="mt-2 text-[14px] leading-[22px] text-bad">
              {fieldError}
            </p>
          ) : null}

          <details id={helpId} className="mt-3 text-[14px] leading-[22px]">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-accent hover:text-accent-hover">
              Where do I find my API key?
            </summary>
            <p className="text-ink-2">
              Sign in to Hevy on the web and open{" "}
              <a
                href="https://hevy.com/settings?developer"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                hevy.com/settings?developer
              </a>{" "}
              to create a key, then paste it here.
            </p>
          </details>

          <Button type="submit" disabled={busy || apiKey.trim().length < 8} className="mt-5 w-full">
            {busy ? (
              <>
                <Spinner /> Importing your workouts…
              </>
            ) : (
              <>
                Connect Hevy <span aria-hidden>→</span>
              </>
            )}
          </Button>
          <p className="sr-only" aria-live="polite">
            {busy ? "Importing your workouts" : ""}
          </p>
          {phase.kind === "error" && !phase.field ? (
            <p role="alert" className="mt-3 text-[14px] leading-[22px] text-bad">
              {phase.message}
            </p>
          ) : null}
        </form>
      )}

      <div className="mt-6 flex flex-col gap-1">
        <details className="text-[14px] leading-[22px]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink-2 hover:text-ink">
            Your API key is sensitive. See how it is handled.
          </summary>
          <KeyHandlingCopy />
        </details>
        <button
          type="button"
          onClick={openDemo}
          className="inline-flex min-h-11 items-center self-start text-[15px] font-medium text-accent hover:text-accent-hover"
        >
          Preview an example report
        </button>
      </div>

      <Dialog open={howOpen} onClose={() => setHowOpen(false)} title="How Hevygrade works">
        <HowItWorksContent />
      </Dialog>
    </SetupShell>
  );
}
