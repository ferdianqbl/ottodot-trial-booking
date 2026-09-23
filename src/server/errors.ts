import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";

/**
 * A request the business rules refuse. Nothing was changed.
 * (Outcomes of a payment — declined, class filled up — are NOT errors: they are booking states.)
 */
export type TDomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "DUPLICATE_BOOKING"
  | "CLASS_FULL"
  | "CLASS_STARTED"
  | "NOT_PAYABLE";

export class DomainError extends Error {
  constructor(
    readonly code: TDomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** How each rule violation surfaces over tRPC (and therefore HTTP). */
export const DOMAIN_TO_TRPC: Record<TDomainErrorCode, TRPC_ERROR_CODE_KEY> = {
  NOT_FOUND: "NOT_FOUND", // 404
  FORBIDDEN: "FORBIDDEN", // 403
  DUPLICATE_BOOKING: "CONFLICT", // 409
  CLASS_FULL: "CONFLICT", // 409
  CLASS_STARTED: "PRECONDITION_FAILED", // 412
  NOT_PAYABLE: "CONFLICT", // 409
};
