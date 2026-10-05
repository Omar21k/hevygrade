import type { PhysiqueView } from "@/physique/types";

const CROP: Record<PhysiqueView, string> = {
  front: "6% 48%",
  side: "50% 48%",
  back: "94% 48%",
};

export function BodyFigure({ view }: { view: PhysiqueView }) {
  return (
    <div className="flex h-40 w-24 items-center justify-center rounded-md bg-white p-3">
      <div
        className="h-full w-full"
        style={{
          backgroundImage: "url(/physique/anatomy.jpg)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "300% auto",
          backgroundPosition: CROP[view],
        }}
        aria-hidden
      />
    </div>
  );
}
