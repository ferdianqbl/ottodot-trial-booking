"use client";

import { InfoIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import EmptyState from "@/components/shared/empty-state";
import LoadingState from "@/components/shared/loading-state";
import MarkerSwatch from "@/components/shared/marker-swatch";
import { PageHeader } from "@/components/shared/page-content";
import SeatMeter from "@/components/shared/seat-meter";
import { BookingStatusBadge, StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { usePersona } from "@/hooks/use-persona";
import { trpc, type TRouterOutputs } from "@/lib/trpc/client";
import { formatClassTime, formatMoney } from "@/lib/utils/format";
import { CURRENCY, TRIAL_FEE_CENTS } from "../server/booking.schema";

type TTrialClass = TRouterOutputs["booking"]["classes"]["data"][number];
type TMyBooking = TRouterOutputs["booking"]["myBookings"]["data"][number];

export default function BookingView() {
  const persona = usePersona();
  if (!persona) return <LoadingState />;
  if (persona === "staff") {
    return (
      <Alert>
        <InfoIcon />
        <AlertTitle>You are acting as Ottodot staff</AlertTitle>
        <AlertDescription>
          Choose a parent in the top bar to book a trial, or open the <Link href="/roster">class rosters</Link>.
        </AlertDescription>
      </Alert>
    );
  }
  return <ParentBooking />;
}

function ParentBooking() {
  const router = useRouter();
  const children = trpc.booking.myChildren.useQuery();
  const classes = trpc.booking.classes.useQuery();
  const bookings = trpc.booking.myBookings.useQuery();
  const [selectedChildId, setSelectedChildId] = useState<string>();
  const [error, setError] = useState<{ classId: string; message: string }>();

  const utils = trpc.useUtils();
  const start = trpc.booking.start.useMutation({
    onSuccess: ({ data }) => router.push(`/bookings/${data.bookingId}`),
    onError: (err, input) => {
      setError({ classId: input.trialClassId, message: err.message });
      // The refusal means this page is out of date (someone took the seat, or the child is already in).
      utils.booking.classes.invalidate();
      utils.booking.myBookings.invalidate();
    },
  });

  // Keep the selection valid when the persona (and so the list of children) changes.
  const myChildren = children.data?.data;
  const child = myChildren?.find((c) => c.id === selectedChildId) ?? myChildren?.[0];

  // The child's current booking for a class, if any (confirmed or checkout in progress).
  const activeBooking = (classId: string) =>
    bookings.data?.data.find(
      (b) => b.trialClassId === classId && b.studentId === child?.id && (b.status === "confirmed" || b.status === "pending_payment")
    );

  return (
    <div className="space-y-12">
      <PageHeader
        title="Book a trial class"
        coin
        description={`Live online science and math classes, at most 4 children per class. A trial costs ${formatMoney(TRIAL_FEE_CENTS, CURRENCY)}.`}
      />

      <section aria-labelledby="step-child" className="space-y-4">
        <h2 id="step-child" className="text-subheading font-medium">
          1. Who is the trial for?
        </h2>
        {myChildren ? (
          <RadioGroup
            aria-labelledby="step-child"
            value={child?.id ?? ""}
            onValueChange={setSelectedChildId}
            className="flex flex-wrap gap-3"
          >
            {myChildren.map((c) => (
              <FieldLabel key={c.id} htmlFor={`child-${c.id}`} className="w-auto! min-w-44">
                <Field orientation="horizontal">
                  <RadioGroupItem value={c.id} id={`child-${c.id}`} />
                  <FieldContent>
                    <FieldTitle>{c.name}</FieldTitle>
                    <FieldDescription>Age {c.age}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        ) : (
          <Skeleton className="h-16 w-80 max-w-full" />
        )}
      </section>

      <section aria-labelledby="step-class" className="space-y-4">
        <h2 id="step-class" className="text-subheading font-medium">
          2. Pick a class
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-8">
          {classes.data
            ? classes.data.data.map((c) => (
                <ClassTile
                  key={c.id}
                  trialClass={c}
                  childName={child?.name.split(" ")[0]}
                  activeBooking={activeBooking(c.id)}
                  error={error?.classId === c.id ? error.message : undefined}
                  busy={start.isPending && start.variables?.trialClassId === c.id}
                  onBook={() => {
                    if (!child) return;
                    setError(undefined);
                    start.mutate({ trialClassId: c.id, studentId: child.id });
                  }}
                />
              ))
            : [0, 1].map((i) => <Skeleton key={i} className="h-52 rounded-cards" />)}
        </div>
      </section>

      <section aria-labelledby="your-bookings" className="space-y-4">
        <h2 id="your-bookings" className="text-subheading font-medium">
          Your bookings
        </h2>
        {!bookings.data ? (
          <Skeleton className="h-20 rounded-cards" />
        ) : bookings.data.data.length ? (
          <ItemGroup className="gap-0 overflow-hidden rounded-cards border border-border bg-card">
            {bookings.data.data.map((b, i) => (
              <Fragment key={b.id}>
                {i > 0 && <ItemSeparator className="my-0" />}
                <BookingRow booking={b} />
              </Fragment>
            ))}
          </ItemGroup>
        ) : (
          <EmptyState
            title="No bookings yet"
            description="Pick a class above to book a trial."
            className="border border-border bg-card p-8"
          />
        )}
      </section>
    </div>
  );
}

// Design system "Product Tile Card": white, hairline border, 16px radius, title 18px / 500.
function ClassTile({
  trialClass: c,
  childName,
  activeBooking,
  error,
  busy,
  onBook,
}: {
  trialClass: TTrialClass;
  childName?: string;
  activeBooking?: TMyBooking;
  error?: string;
  busy: boolean;
  onBook: () => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{c.subject}</Badge>
          {c.seatsLeft === 1 && (
            <span className="inline-flex items-center gap-1.5 text-caption font-medium">
              <MarkerSwatch color="yellow" />
              Last seat
            </span>
          )}
        </div>
        <div className="space-y-1">
          <CardTitle>{c.title}</CardTitle>
          <CardDescription>{formatClassTime(c.startsAt)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="flex items-center gap-3 text-caption">
          <SeatMeter taken={c.confirmedCount} capacity={c.capacity} />
          {c.confirmedCount} of {c.capacity} booked
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="mt-auto">
        {activeBooking?.status === "confirmed" ? (
          <StatusBadge swatch="lime" label={`${childName} is booked`} />
        ) : activeBooking ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/bookings/${activeBooking.id}`}>Continue to payment</Link>
          </Button>
        ) : c.seatsLeft === 0 ? (
          <Badge variant="outline">Full</Badge>
        ) : (
          <Button size="sm" onClick={onBook} disabled={busy || !childName}>
            {busy && <Spinner />}
            {busy ? "Starting…" : `Book for ${childName}`}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function BookingRow({ booking: b }: { booking: TMyBooking }) {
  return (
    <Item role="listitem" className="rounded-none">
      <ItemContent>
        <ItemTitle className="text-body-sm">
          {b.student.name} · {b.trialClass.title}
        </ItemTitle>
        <ItemDescription>{formatClassTime(b.trialClass.startsAt)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <BookingStatusBadge status={b.status} />
        <Button asChild variant="link" size="sm">
          <Link href={`/bookings/${b.id}`}>
            View<span className="sr-only"> booking for {b.student.name}</span>
          </Link>
        </Button>
      </ItemActions>
    </Item>
  );
}
