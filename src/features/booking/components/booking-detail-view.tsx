"use client";

import { ArrowLeftIcon, CircleCheckIcon, CircleXIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import LoadingState from "@/components/shared/loading-state";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePersona } from "@/hooks/use-persona";
import { trpc, type TRouterInputs, type TRouterOutputs } from "@/lib/trpc/client";
import { formatClassTime, formatDateTime, formatMoney } from "@/lib/utils/format";
import { CURRENCY, TRIAL_FEE_CENTS } from "../server/booking.schema";

type TBooking = TRouterOutputs["booking"]["byId"]["data"];
type TCardOutcome = NonNullable<TRouterInputs["booking"]["pay"]["cardOutcome"]>;

const CARD_OUTCOMES: { value: TCardOutcome; label: string; description: string }[] = [
  { value: "approve", label: "Card approved", description: "The payment goes through." },
  { value: "card_declined", label: "Card declined", description: "The bank refuses the card." },
  { value: "insufficient_funds", label: "Insufficient funds", description: "Declined for lack of funds." },
];

const SLOW_GATEWAY_MS = 3000;

export default function BookingDetailView({ bookingId }: { bookingId: string }) {
  const persona = usePersona();
  const booking = trpc.booking.byId.useQuery({ bookingId }, { enabled: !!persona && persona !== "staff", retry: false });

  if (!persona) return <LoadingState />;
  if (persona === "staff") {
    return (
      <Alert>
        <InfoIcon />
        <AlertTitle>Bookings are visible to the child&apos;s parent</AlertTitle>
        <AlertDescription>Switch to a parent in the top bar.</AlertDescription>
      </Alert>
    );
  }
  if (booking.error) {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Couldn&apos;t open this booking</AlertTitle>
        <AlertDescription>{booking.error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!booking.data) return <LoadingState />;

  const b = booking.data.data;
  return (
    <div className="max-w-3xl space-y-10">
      <Button asChild variant="link" size="sm">
        <Link href="/">
          <ArrowLeftIcon />
          All classes
        </Link>
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-heading-sm font-bold sm:text-heading">{b.trialClass.title}</h1>
          <BookingStatusBadge status={b.status} />
        </div>
        <p className="text-body text-muted-foreground">
          {b.student.name} · {b.trialClass.subject} · {formatClassTime(b.trialClass.startsAt)} ·{" "}
          {formatMoney(TRIAL_FEE_CENTS, CURRENCY)}
        </p>
        <p className="text-caption text-muted-foreground">Booking {b.id}</p>
      </header>

      <StatusExplanation booking={b} />

      {b.status === "pending_payment" && <PaymentForm booking={b} />}

      <PaymentHistory payments={b.payments} />
    </div>
  );
}

function StatusExplanation({ booking: b }: { booking: TBooking }) {
  const router = useRouter();
  const retry = trpc.booking.start.useMutation({ onSuccess: ({ data }) => router.push(`/bookings/${data.bookingId}`) });
  const firstName = b.student.name.split(" ")[0];

  switch (b.status) {
    case "pending_payment":
      return b.trialClass.seatsLeft === 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>This class has just filled up</AlertTitle>
          <AlertDescription>If you pay now, your booking will be cancelled and your card will not be charged.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <InfoIcon />
          <AlertTitle>Your seat is not held yet</AlertTitle>
          <AlertDescription>
            It is yours once payment succeeds, and if another parent pays for the last seat first, your card is not
            charged. {b.trialClass.seatsLeft} of {b.trialClass.capacity} seats left.
          </AlertDescription>
        </Alert>
      );
    case "confirmed":
      return (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{firstName} is on the class roster</AlertTitle>
          <AlertDescription>Confirmed {b.confirmedAt ? formatDateTime(b.confirmedAt) : ""}.</AlertDescription>
        </Alert>
      );
    case "payment_failed":
      return (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Payment failed: {b.statusReason}</AlertTitle>
          <AlertDescription>
            <p>{firstName} was not added to the class.</p>
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate({ trialClassId: b.trialClassId, studentId: b.studentId })}
            >
              {retry.isPending && <Spinner />}
              Try again
            </Button>
            {retry.error && <p className="mt-3">{retry.error.message}</p>}
          </AlertDescription>
        </Alert>
      );
    case "cancelled":
      return (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Booking cancelled</AlertTitle>
          <AlertDescription>
            {b.statusReason}. {firstName} was not added to the class and your card was not charged
            {b.payments.some((p) => p.status === "voided") && " (the card authorization was released)"}.{" "}
            <Link href="/">Pick another class</Link>
          </AlertDescription>
        </Alert>
      );
  }
}

// Design system "Feature Card": the page's main block, 24px radius and 32px padding.
function PaymentForm({ booking: b }: { booking: TBooking }) {
  const utils = trpc.useUtils();
  const [cardOutcome, setCardOutcome] = useState<TCardOutcome>("approve");
  const [slowGateway, setSlowGateway] = useState(false);
  const pay = trpc.booking.pay.useMutation({
    onSuccess: (updated) => {
      utils.booking.byId.setData({ bookingId: b.id }, updated);
      utils.booking.classes.invalidate();
      utils.booking.myBookings.invalidate();
    },
  });

  return (
    <Card size="lg">
      <CardHeader>
        <CardTitle>Payment</CardTitle>
        <CardDescription>A mock card: choose how it should respond.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">What should the card do?</FieldLegend>
            <RadioGroup value={cardOutcome} onValueChange={(value) => setCardOutcome(value as TCardOutcome)}>
              {CARD_OUTCOMES.map((o) => (
                <FieldLabel key={o.value} htmlFor={`outcome-${o.value}`}>
                  <Field orientation="horizontal">
                    <RadioGroupItem value={o.value} id={`outcome-${o.value}`} />
                    <FieldContent>
                      <FieldTitle>{o.label}</FieldTitle>
                      <FieldDescription>{o.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>
          <Field orientation="horizontal">
            <Checkbox id="slow-gateway" checked={slowGateway} onCheckedChange={(checked) => setSlowGateway(checked === true)} />
            <FieldContent>
              <FieldLabel htmlFor="slow-gateway">Slow payment gateway ({SLOW_GATEWAY_MS / 1000}s)</FieldLabel>
              <FieldDescription>Time to press Pay in two tabs at once.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-4 sm:items-start">
        <Button
          onClick={() => pay.mutate({ bookingId: b.id, cardOutcome, gatewayDelayMs: slowGateway ? SLOW_GATEWAY_MS : 0 })}
          disabled={pay.isPending}
        >
          {pay.isPending && <Spinner />}
          {pay.isPending ? "Processing payment…" : `Pay ${formatMoney(TRIAL_FEE_CENTS, CURRENCY)}`}
        </Button>
        {pay.error && (
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Payment was not processed</AlertTitle>
            <AlertDescription>{pay.error.message}</AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
}

function PaymentHistory({ payments }: { payments: TBooking["payments"] }) {
  if (payments.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Payment history</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reference / reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{formatDateTime(p.createdAt)}</TableCell>
                <TableCell>
                  <PaymentStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="tabular-nums">{formatMoney(p.amountCents, p.currency)}</TableCell>
                <TableCell className="text-muted-foreground">{p.declineReason ?? p.providerRef}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
