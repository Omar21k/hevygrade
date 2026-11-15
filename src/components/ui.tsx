"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-hover disabled:bg-accent/40 disabled:text-bg/70",
  secondary: "border border-line bg-surface text-ink hover:bg-raised disabled:text-ink-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface disabled:text-ink-3",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function TextLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-accent hover:text-accent-hover ${className}`}
      {...props}
    />
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center text-[13px] font-semibold tracking-[0.28em] text-brand">
      HEVYGRADE
    </Link>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[12px] font-medium leading-[18px] text-warn">
      Demo report
    </span>
  );
}

export type StatusTone = "good" | "warn" | "muted" | "bad";

const TONE_TEXT: Record<StatusTone, string> = {
  good: "text-good",
  warn: "text-warn",
  muted: "text-ink-3",
  bad: "text-bad",
};

const TONE_DOT: Record<StatusTone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  muted: "bg-ink-3",
  bad: "bg-bad",
};

export function StatusLabel({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[14px] font-medium leading-[22px] ${TONE_TEXT[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}

export function toneText(tone: StatusTone): string {
  return TONE_TEXT[tone];
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`hg-spin inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

/**
 * Native modal dialog: the browser traps focus and handles Escape. Focus goes
 * back to whatever opened it when it closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-32px))] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <h2 id="dialog-title" className="hg-h2">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
        >
          <span aria-hidden className="text-xl leading-none">
            ×
          </span>
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
