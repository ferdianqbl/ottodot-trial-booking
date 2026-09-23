import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholder while the tab's persona and first query load. */
export default function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-12 w-2/3 max-w-md" />
      <Skeleton className="h-6 w-full max-w-xl" />
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-8">
        <Skeleton className="h-44 rounded-cards" />
        <Skeleton className="h-44 rounded-cards" />
      </div>
    </div>
  );
}
