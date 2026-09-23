"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, LockIcon } from "lucide-react";
import LoadingState from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-content";
import SeatMeter from "@/components/shared/seat-meter";
import { BookingStatusBadge, StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setPersona, usePersona } from "@/hooks/use-persona";
import { trpc, type TRouterOutputs } from "@/lib/trpc/client";
import { formatClassTime, formatDateTime } from "@/lib/utils/format";

type TClassRoster = TRouterOutputs["roster"]["all"]["data"][number];

export default function RosterView() {
  const persona = usePersona();
  const queryClient = useQueryClient();
  const rosters = trpc.roster.all.useQuery(undefined, { enabled: persona === "staff" });

  if (!persona) return <LoadingState />;
  if (persona !== "staff") {
    return (
      <Alert>
        <LockIcon />
        <AlertTitle>Rosters are staff-only</AlertTitle>
        <AlertDescription>
          <p>They list children and their parents&apos; contact details.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPersona("staff");
              queryClient.resetQueries();
            }}
          >
            Act as staff
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title="Class rosters"
        swatch="yellow"
        description="A roster lists confirmed bookings only. Checkouts in progress, declined payments and seats lost to another parent are shown underneath, so it's clear why a child is not on it."
      />
      {rosters.data ? (
        <div className="space-y-8">
          {rosters.data.data.map((c) => (
            <ClassRosterCard key={c.id} roster={c} />
          ))}
        </div>
      ) : (
        <LoadingState />
      )}
    </div>
  );
}

function ClassRosterCard({ roster: c }: { roster: TClassRoster }) {
  const counterMatches = c.seatCounter === c.roster.length;
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge>{c.subject}</Badge>
          <CardTitle>
            <h2>{c.title}</h2>
          </CardTitle>
          <CardDescription>{formatClassTime(c.startsAt)}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            <SeatMeter taken={c.roster.length} capacity={c.capacity} />
            {c.roster.length} / {c.capacity} confirmed
          </Badge>
          <span title="The seat counter used by the booking engine">
            {counterMatches ? (
              <Badge variant="outline">Seat counter matches</Badge>
            ) : (
              <StatusBadge swatch="vermillion" label={`Seat counter ${c.seatCounter} ≠ roster`} />
            )}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {c.roster.length === 0 ? (
          <p className="px-6 text-caption text-muted-foreground">No confirmed students yet.</p>
        ) : (
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Confirmed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.roster.map((r, i) => (
                <TableRow key={r.bookingId}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <span className="font-medium">{r.studentName}</span>
                    <span className="text-muted-foreground"> · {r.studentAge}</span>
                  </TableCell>
                  <TableCell>
                    {r.parentName} <span className="text-muted-foreground">{r.parentEmail}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.confirmedAt ? formatDateTime(r.confirmedAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {c.notOnRoster.length > 0 && (
        <CardFooter className="border-t">
          <Collapsible className="w-full">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-4 [&[data-state=open]>svg]:rotate-180">
                Not on the roster ({c.notOnRoster.length})
                <ChevronDownIcon className="transition-transform" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-3">
                {c.notOnRoster.map((b) => (
                  <li key={b.bookingId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                    <span className="font-medium">{b.studentName}</span>
                    <BookingStatusBadge status={b.status} />
                    {b.statusReason && <span className="text-muted-foreground">{b.statusReason}</span>}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </CardFooter>
      )}
    </Card>
  );
}
