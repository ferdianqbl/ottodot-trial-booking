import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";

const handler = (req: Request) =>
  fetchRequestHandler({ endpoint: "/api/v1", req, router: appRouter, createContext: () => createContext({ req }) });

export { handler as GET, handler as POST };
