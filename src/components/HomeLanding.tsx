"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINE = "Are you leaving gains on the table?";

export function HomeLanding() {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    let index = 0;
    const tick = window.setInterval(() => {
      index += 1;
      setShown(LINE.slice(0, index));
      if (index >= LINE.length) {
        window.clearInterval(tick);
        setDone(true);
      }
    }, 42);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!done) return;
    const wait = window.setTimeout(() => setShowButton(true), 1000);
    return () => window.clearTimeout(wait);
  }, [done]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#07080a] text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">HEVYGRADE</p>
        <h1 className="mt-10 min-h-[1.3em] text-4xl font-semibold leading-[1.15] tracking-tight sm:text-6xl">
          <span>{shown}</span>
          <span
            aria-hidden
            className={`ml-0.5 inline-block h-[0.92em] w-[3px] translate-y-[0.08em] bg-[#267FE8] ${
              done ? "animate-pulse" : ""
            }`}
          />
        </h1>
        {showButton ? (
          <Link
            href="/connect"
            className="mt-12 rounded-full bg-[#267FE8] px-10 py-3 text-base font-semibold text-white transition hover:bg-[#1f6fd0]"
          >
            Find out
          </Link>
        ) : (
          <div className="mt-12 h-12" aria-hidden />
        )}
      </div>
    </div>
  );
}
