import type { PhysiqueView } from "@/physique/types";
import Image from "next/image";

const FIGURES: Record<PhysiqueView, { src: string; width: number; height: number }> = {
  front: { src: "/physique/front.png", width: 254, height: 633 },
  side: { src: "/physique/side.png", width: 126, height: 634 },
  back: { src: "/physique/back.png", width: 250, height: 627 },
};

/** Reference pose for each angle, cut out of public/physique/anatomy.jpg. */
export function PoseFigure({ view }: { view: PhysiqueView }) {
  const figure = FIGURES[view];
  return (
    <Image
      src={figure.src}
      width={figure.width}
      height={figure.height}
      alt=""
      aria-hidden
      className="h-full w-auto opacity-80"
    />
  );
}
