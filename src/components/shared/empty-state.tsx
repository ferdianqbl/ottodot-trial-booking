import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** Nothing to show yet: a flat white card with the reason and, optionally, the way out. */
export default function EmptyState({
  title,
  description,
  media,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  media?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn(className)}>
      <EmptyHeader>
        {media && <EmptyMedia>{media}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
