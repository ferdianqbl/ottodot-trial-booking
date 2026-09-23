"use client";

import type { ReactNode } from "react";
import TRPCProvider from "./trpc";

/** Every client-side provider the app needs. The design system is light-only, so there is no theme provider. */
export default function Providers({ children }: { children: ReactNode }) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
