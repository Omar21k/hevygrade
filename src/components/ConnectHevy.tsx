"use client";

import { saveHevySession } from "@/hevy/session";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ConnectHevy() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hevy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not read that Hevy key.");
      saveHevySession(payload);
      router.push("/report");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that Hevy key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#07080a] text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6">
        <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">
          HEVYGRADE
        </Link>
        <form onSubmit={connect} className="mt-12 flex w-full flex-col gap-5">
          <input
            type="password"
            autoFocus
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Hevy Pro API key"
            className="w-full rounded-none border-0 border-b border-zinc-700 bg-transparent px-0 py-3 text-center text-lg text-white outline-none placeholder:text-zinc-600 focus:border-[#267FE8]"
          />
          <a
            href="https://hevy.com/settings?developer"
            target="_blank"
            rel="noreferrer"
            className="text-center text-sm text-[#267FE8] hover:underline"
          >
            Log in to Hevy and copy your key
          </a>
          <button
            type="submit"
            disabled={busy || apiKey.trim().length < 8}
            className="mt-2 rounded-full bg-[#267FE8] px-8 py-3 text-sm font-semibold text-white disabled:opacity-30"
          >
            {busy ? "Connecting…" : "Continue"}
          </button>
          {error ? <p className="text-center text-sm text-rose-300">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
