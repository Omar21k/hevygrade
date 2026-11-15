import { MAX_IMPORTED_WORKOUTS } from "@/report/view";

export function KeyHandlingCopy() {
  return (
    <p className="text-[14px] leading-[22px] text-ink-2">
      Your key is sent once to this app&apos;s server, which uses it to read your routines and your most recent{" "}
      {MAX_IMPORTED_WORKOUTS} workouts from Hevy. The key is not saved in your browser or on the server. The imported
      data is kept in this browser tab&apos;s session storage and is cleared when you close the tab.
    </p>
  );
}

export function PhotoHandlingCopy() {
  return (
    <p className="text-[14px] leading-[22px] text-ink-2">
      Photos stay on this device until you choose <strong className="font-medium text-ink">Continue with photos</strong>.
      They are then sent to this app&apos;s server, which forwards them to Anthropic&apos;s Claude API for a visual
      estimate of muscle development, and returns the result. Hevygrade doesn&apos;t save the photos. Only the estimate
      is kept, in this browser tab&apos;s session storage, until you close the tab. Anthropic handles the images under its
      API data policies.
    </p>
  );
}

export function HowItWorksContent() {
  return (
    <div className="flex flex-col gap-5 text-[15px] leading-[24px] text-ink-2">
      <p>
        Hevygrade reads your Hevy routines and recent workouts and explains three things. Optional photos add context
        about which muscles to prioritize.
      </p>
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="font-medium text-ink">Coverage</dt>
          <dd>How well the sets in your routines cover the muscles you want to prioritize.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Growth</dt>
          <dd>
            Whether your training shows signals that support progression: enough weekly work, frequency, direct
            exercises, and strength trends in logged sets. It is not proof of physical growth.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Recovery</dt>
          <dd>
            An estimate of training-load balance from your schedule and set counts. It is not a medical or readiness
            measurement.
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-ink">Your API key</h3>
        <KeyHandlingCopy />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-ink">Photos</h3>
        <PhotoHandlingCopy />
      </div>
    </div>
  );
}
