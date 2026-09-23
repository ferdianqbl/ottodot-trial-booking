import { cn } from "@/lib/utils";

/** One square per seat, filled for a confirmed booking. Decorative: the caller also states the count in text. */
export default function SeatMeter({
  taken,
  capacity,
  className,
}: {
  taken: number;
  capacity: number;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("inline-flex gap-1", className)}>
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} className={cn("size-2.5 border border-foreground", i < taken ? "bg-foreground" : "bg-card")} />
      ))}
    </span>
  );
}
