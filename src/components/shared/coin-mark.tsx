import { cn } from "@/lib/utils";

/**
 * Design system "Pink Coin Mascot": a flat pink ellipse with a 1px ink outline and the brand initial,
 * tilted 45°. Purely decorative; it floats beside content and is never clickable.
 */
export default function CoinMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
      className={cn("pointer-events-none size-24 rotate-45 select-none", className)}
    >
      <ellipse cx="50" cy="50" rx="46" ry="38" fill="var(--color-coin-pink)" stroke="var(--color-ink-black)" strokeWidth="1" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-abc-favorit)"
        fontWeight="700"
        fontSize="44"
        fill="var(--color-ink-black)"
      >
        O
      </text>
    </svg>
  );
}
