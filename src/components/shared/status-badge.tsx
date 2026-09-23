import type { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import MarkerSwatch, { type TSwatchColor } from "@/components/shared/marker-swatch";
import { Badge } from "@/components/ui/badge";

// The label carries the status; the swatch only echoes it (lime = done, yellow = waiting,
// vermillion = failed, hollow = nothing happened).
const BOOKING: Record<BookingStatus, { label: string; swatch: TSwatchColor }> = {
  pending_payment: { label: "Awaiting payment", swatch: "yellow" },
  confirmed: { label: "Confirmed", swatch: "lime" },
  payment_failed: { label: "Payment failed", swatch: "vermillion" },
  cancelled: { label: "Cancelled", swatch: "none" },
};

const PAYMENT: Record<PaymentStatus, { label: string; swatch: TSwatchColor }> = {
  authorized: { label: "Authorized", swatch: "yellow" },
  captured: { label: "Charged", swatch: "lime" },
  voided: { label: "Voided (not charged)", swatch: "none" },
  declined: { label: "Declined", swatch: "vermillion" },
};

export function StatusBadge({ label, swatch }: { label: string; swatch: TSwatchColor }) {
  return (
    <Badge>
      <MarkerSwatch color={swatch} />
      {label}
    </Badge>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <StatusBadge {...BOOKING[status]} />;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <StatusBadge {...PAYMENT[status]} />;
}
