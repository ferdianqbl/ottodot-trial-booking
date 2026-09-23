import type { ReactNode } from "react";
import CoinMark from "@/components/shared/coin-mark";
import MarkerSwatch, { type TSwatchColor } from "@/components/shared/marker-swatch";
import { cn } from "@/lib/utils";

/** The page container: the design system's 1200px page width and its horizontal rhythm. */
export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto w-full max-w-page px-4 py-10 sm:px-8 sm:py-12 lg:px-14", className)}>{children}</main>
  );
}

/** Page title in the display voice, with a marker swatch as its full stop and an optional floating coin. */
export function PageHeader({
  title,
  description,
  swatch = "pink",
  coin = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  swatch?: TSwatchColor;
  coin?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("relative space-y-3 sm:pr-32", className)}>
      <h1 className="text-heading-sm font-bold sm:text-heading-lg">
        {title}
        <MarkerSwatch color={swatch} shape="square" className="ml-1 size-2.5 sm:size-3" />
      </h1>
      {description && <p className="max-w-2xl text-body text-muted-foreground">{description}</p>}
      {coin && <CoinMark className="absolute -top-4 right-0 hidden sm:block" />}
    </header>
  );
}
