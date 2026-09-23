"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, type ReactNode } from "react";
import superjson from "superjson";
import { getPersona } from "@/hooks/use-persona";
import { trpc } from "@/lib/trpc/client";
import { DEMO_USER_HEADER } from "@/lib/constants";

export default function TRPCProvider({ children }: { children: ReactNode }) {
  // React Query defaults: data is always considered stale and refetched on window focus,
  // so seat counts are fresh when you switch between two tabs.
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/v1",
          transformer: superjson,
          headers: () => {
            const persona = getPersona();
            return persona ? { [DEMO_USER_HEADER]: persona } : {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
