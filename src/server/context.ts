import { DEMO_USER_HEADER } from "@/lib/constants";
import prisma from "@/lib/db/prisma";

/**
 * Demo identity. Real auth is out of scope, so the client sends who it is acting as in the
 * `x-demo-user` header: a parent id (e.g. "par_nadia") or "staff". The header is per browser tab,
 * which lets two tabs act as two different parents for the last-seat race demo.
 */
export type TSessionUser = { role: "parent"; parentId: string } | { role: "staff" } | null;

export function parseDemoUser(value: string | null | undefined): TSessionUser {
  if (!value) return null;
  if (value === "staff") return { role: "staff" };
  return { role: "parent", parentId: value };
}

export function createContext({ req }: { req: Request }): TContext {
  return { user: parseDemoUser(req.headers.get(DEMO_USER_HEADER)), prisma };
}

export type TContext = { user: TSessionUser; prisma: typeof prisma };
