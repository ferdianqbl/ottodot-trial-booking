"use client";

import EmptyState from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState title="Something went wrong" description={error.message}>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </EmptyState>
  );
}
