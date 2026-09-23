import { cn } from "@/lib/utils";

const FILL = {
  pink: "bg-coin-pink",
  yellow: "bg-highlight-yellow",
  lime: "bg-highlight-lime",
  vermillion: "bg-highlight-vermillion",
  none: "bg-transparent",
} as const;

export type TSwatchColor = keyof typeof FILL;

/**
 * Design system "Color Marker Swatch": a tiny flat chip used as playful punctuation or a bullet.
 * It is decorative and never carries information on its own, so the text next to it must say the
 * same thing. The 1px ink outline keeps the pale highlights visible on white.
 */
export default function MarkerSwatch({
  color,
  shape = "circle",
  className,
}: {
  color: TSwatchColor;
  shape?: "circle" | "square";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 border border-foreground",
        shape === "circle" ? "rounded-full" : "rounded-none",
        FILL[color],
        className
      )}
    />
  );
}
