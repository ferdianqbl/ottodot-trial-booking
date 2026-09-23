import Link from "next/link";
import CoinMark from "@/components/shared/coin-mark";
import EmptyState from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState title="Page not found" description="That page doesn't exist." media={<CoinMark className="size-20" />}>
      <Button asChild>
        <Link href="/">Back to trial classes</Link>
      </Button>
    </EmptyState>
  );
}
