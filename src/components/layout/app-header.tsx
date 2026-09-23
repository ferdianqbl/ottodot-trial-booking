"use client";

import { RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PersonaSwitcher from "@/components/layout/persona-switcher";
import MarkerSwatch from "@/components/shared/marker-swatch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc/client";

const NAV = [
  { href: "/", label: "Book a trial" },
  { href: "/roster", label: "Class rosters" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const reset = trpc.demo.reset.useMutation({ onSuccess: () => utils.invalidate() });

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-8 lg:px-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-baseline gap-0.5 text-subheading font-bold">
            Ottodot
            <MarkerSwatch color="pink" />
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Button key={item.href} asChild size="pill" variant={active ? "default" : "ghost"}>
                  <Link href={item.href} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PersonaSwitcher />
          <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {reset.isPending ? <Spinner /> : <RotateCcwIcon />}
            <span className="max-sm:sr-only">Reset demo data</span>
          </Button>
          {reset.error && (
            <p role="alert" className="text-caption text-destructive">
              {reset.error.message}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
