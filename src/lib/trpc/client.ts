import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

export type TRouterInputs = inferRouterInputs<AppRouter>;
export type TRouterOutputs = inferRouterOutputs<AppRouter>;
