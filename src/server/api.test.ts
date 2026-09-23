import { beforeEach, describe, expect, it } from "vitest";
import superjson from "superjson";
import { GET, POST } from "@/app/api/v1/[trpc]/route";
import { callerAs, resetDemoData } from "@/test/helpers";

/** A raw HTTP call, the way the browser (or curl) reaches the API. */
async function http(path: string, who: string | null, input?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (who) headers["x-demo-user"] = who;
  const url = `http://localhost/api/v1/${path}`;
  const res =
    input === undefined
      ? await GET(new Request(url, { headers }))
      : await POST(new Request(url, { method: "POST", headers, body: JSON.stringify(superjson.serialize(input)) }));
  return { status: res.status, body: await res.json() };
}

describe("tRPC API", () => {
  beforeEach(resetDemoData);

  it("booking requires acting as a known parent", async () => {
    await expect(callerAs(null).booking.myChildren()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerAs("par_nobody").booking.myChildren()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await callerAs("par_nadia").booking.myChildren()).data).toHaveLength(2);
  });

  it("rosters are staff-only", async () => {
    await expect(callerAs("par_nadia").roster.all()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rosters = await callerAs("staff").roster.all();
    expect(rosters.success).toBe(true);
    expect(rosters.data.find((r) => r.id === "cls_last_seat")?.roster).toHaveLength(3);
  });

  it("full flow: start → pay → status", async () => {
    const api = callerAs("par_tom");
    const started = await api.booking.start({ trialClassId: "cls_open", studentId: "stu_zara" });
    expect(started.code).toBe(201);
    const { bookingId } = started.data;
    const paid = await api.booking.pay({ bookingId, cardOutcome: "approve" });
    expect(paid.data.status).toBe("confirmed");
    expect((await api.booking.byId({ bookingId })).data.payments[0].status).toBe("captured");
    expect((await api.booking.myBookings()).data.map((b) => b.id)).toContain(bookingId);
  });

  it("maps rule violations to HTTP status codes and a machine-readable domainCode", async () => {
    const duplicate = await http("booking.start", "par_priya", { trialClassId: "cls_last_seat", studentId: "stu_arjun" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.json.data.domainCode).toBe("DUPLICATE_BOOKING");
    expect(duplicate.body.error.json.success).toBe(false);
    expect(duplicate.body.error.json.code).toBe(409);

    const full = await http("booking.start", "par_nadia", { trialClassId: "cls_full", studentId: "stu_omar" });
    expect(full.status).toBe(409);
    expect(full.body.error.json.data.domainCode).toBe("CLASS_FULL");

    const foreignChild = await http("booking.start", "par_ben", { trialClassId: "cls_open", studentId: "stu_omar" });
    expect(foreignChild.status).toBe(403);

    const unknownClass = await http("booking.start", "par_nadia", { trialClassId: "cls_nope", studentId: "stu_omar" });
    expect(unknownClass.status).toBe(404);

    expect((await http("booking.start", null, { trialClassId: "cls_open", studentId: "stu_omar" })).status).toBe(401);
    expect((await http("booking.start", "par_nadia", { trialClassId: "" })).status).toBe(400);
  });

  it("a declined payment is a successful request whose booking ends as payment_failed", async () => {
    const started = await http("booking.start", "par_nadia", { trialClassId: "cls_open", studentId: "stu_omar" });
    const bookingId = started.body.result.data.json.data.bookingId;
    const paid = await http("booking.pay", "par_nadia", { bookingId, cardOutcome: "insufficient_funds" });
    expect(paid.status).toBe(200);
    expect(paid.body.result.data.json.data.status).toBe("payment_failed");
  });

  it("the roster is readable over HTTP by staff", async () => {
    const res = await http(`roster.byClass?input=${encodeURIComponent(JSON.stringify({ json: { classId: "cls_last_seat" } }))}`, "staff");
    expect(res.status).toBe(200);
    expect(res.body.result.data.json.data.roster.map((r: { studentName: string }) => r.studentName)).toEqual([
      "Arjun Shah",
      "Zara Okafor",
      "Noah Fischer",
    ]);
  });
});
