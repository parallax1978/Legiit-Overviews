import { assert, assertEquals } from "@std/assert";
import { must, serviceClient } from "../_shared/db.ts";
import {
  cleanup,
  createSeries,
  createTrackedQuery,
  createUser,
  cronRequest,
  startStubDfs,
  TASK_POST_PATH,
  type TestUser,
  uniqueKeyword,
} from "../_shared/capture_testkit.ts";
import { handle } from "./handler.ts";

const HOUR = 3_600_000;

Deno.test("schedule-captures submits due, tracked series once and steps next_capture_at by 3 hours", async () => {
  const stub = startStubDfs();
  const users: TestUser[] = [];
  const seriesIds: string[] = [];
  try {
    const user = await createUser("schedule");
    users.push(user);
    const now = Date.now();
    const dueAt = new Date(now - 7 * HOUR - 17 * 60_000); // two whole steps late, plus a 17-minute offset
    const due = await createSeries(uniqueKeyword("due"), { next_capture_at: dueAt.toISOString() });
    const paused = await createSeries(uniqueKeyword("paused"), { next_capture_at: dueAt.toISOString() });
    const later = await createSeries(uniqueKeyword("later"), { next_capture_at: new Date(now + HOUR).toISOString(), device: "mobile" });
    seriesIds.push(due.id, paused.id, later.id);
    await createTrackedQuery(user.id, due.id);
    await createTrackedQuery(user.id, paused.id, { status: "paused" });
    await createTrackedQuery(user.id, later.id);
    const scope = { series_ids: seriesIds };

    assertEquals((await handle(new Request("http://localhost/schedule-captures", { method: "POST" }))).status, 401);
    const res = await handle(cronRequest("schedule-captures", scope));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { captures: 1, submitted: 1, failed: 0 });

    const captures = must(await serviceClient().from("captures").select("*").in("series_id", seriesIds), "captures") as any[];
    assertEquals(captures.length, 1);
    const c = captures[0];
    assertEquals([c.series_id, c.source, c.status, c.attempts], [due.id, "scheduled", "submitted", 1]);
    assertEquals(new Date(c.scheduled_at).getTime(), dueAt.getTime() + 2 * 3 * HOUR, "the latest slot that has passed");
    assert(stub.posted.has(c.task_id));
    const posted = stub.calls.find((x) => x.path === TASK_POST_PATH)!.body;
    assertEquals(posted.map((t: any) => [t.tag, t.device, t.priority, t.postback_data]), [[c.id, "desktop", 1, "advanced"]]);
    assert(posted[0].postback_url.startsWith(`${Deno.env.get("FUNCTIONS_PUBLIC_URL")}/dataforseo-postback?secret=`));

    const next = must(await serviceClient().from("series").select("id, next_capture_at").in("id", seriesIds), "series") as any[];
    const nextDue = Date.parse(next.find((s) => s.id === due.id).next_capture_at);
    assertEquals(nextDue - dueAt.getTime(), 3 * 3 * HOUR, "whole steps keep the series' offset");
    assert(nextDue > now && nextDue <= now + 3 * HOUR);
    assertEquals(Date.parse(next.find((s) => s.id === paused.id).next_capture_at), dueAt.getTime(), "paused-only series wait");

    // Nothing is due any more; and an overlapping run for the same slot inserts nothing.
    assertEquals(await (await handle(cronRequest("schedule-captures", scope))).json(), { captures: 0, submitted: 0, failed: 0 });
    must(await serviceClient().from("series").update({ next_capture_at: c.scheduled_at }).eq("id", due.id), "rewind");
    assertEquals(await (await handle(cronRequest("schedule-captures", scope))).json(), { captures: 0, submitted: 0, failed: 0 });
    assertEquals(stub.count(TASK_POST_PATH), 1);
    assertEquals((await serviceClient().from("captures").select("id").in("series_id", seriesIds)).data?.length, 1);
    assertEquals((await handle(cronRequest("schedule-captures", { series_ids: ["nope"] }))).status, 400);
  } finally {
    await stub.close();
    await cleanup(users, seriesIds);
  }
});
