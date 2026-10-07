import { assert, assertEquals, assertMatch } from "@std/assert";
import { must, serviceClient } from "./db.ts";
import { ingestTask, recordCaptureFailure, submitCaptures } from "./ingest.ts";
import {
  cleanup,
  createCapture,
  createSeries,
  createTrackedQuery,
  createUser,
  fixtureResult,
  okTask,
  startStubDfs,
  type TestUser,
  uniqueKeyword,
} from "./capture_testkit.ts";

const db = () => serviceClient();

async function snapshotOf(captureId: string) {
  return must(await db().from("snapshots").select("*").eq("capture_id", captureId).maybeSingle(), "load snapshot") as any;
}

async function captureRow(id: string) {
  return must(await db().from("captures").select("*").eq("id", id).single(), "load capture") as any;
}

Deno.test("ingestTask writes the snapshot once, with sections, citations and the raw payload", async () => {
  const series = await createSeries(uniqueKeyword("ingest"));
  try {
    const capture = await createCapture(series.id);
    const task = okTask(capture.id, fixtureResult("synthetic-form-builders.json"));
    const first = await ingestTask(capture.id, task);
    assertEquals([first.status, first.duplicate], ["present", false]);

    const snap = await snapshotOf(capture.id);
    assertEquals(snap.id, first.snapshot_id);
    assertEquals(snap.status, "present");
    assertEquals(new Date(snap.captured_at).toISOString(), "2026-10-07T12:00:00.000Z");
    assertEquals([snap.extraction, snap.same_as], ["pending", null]);
    assertEquals(snap.raw_path, `${series.id}/${capture.id}.json`);
    assertMatch(snap.content_hash, /^[0-9a-f]{64}$/);
    assertEquals(snap.sentences.length, 10);
    assertEquals(snap.organic.length, 4);
    assertEquals(snap.formats.list_items, 4);

    const sections = must(await db().from("sections").select("position, kind, citation_idx").eq("snapshot_id", snap.id).order("position"), "sections") as any[];
    assertEquals(sections.map((s) => s.kind), ["element", "element", "element"]);
    const citations = must(await db().from("citations").select("idx, url_key, passage, passages").eq("snapshot_id", snap.id).order("idx"), "citations") as any[];
    assertEquals(citations.length, 6);
    assertEquals(citations[0].url_key, "zapier.com/blog/best-online-form-builder-software");
    // Zapier is cited twice with different passages: both are stored, `passage` is the first.
    assertEquals(citations[0].passages.length, 2);
    assertEquals(citations[0].passage, citations[0].passages[0]);
    assert(citations[0].passages[1].startsWith("Google Forms is free and simple"));
    assertEquals(citations[1].passages, [citations[1].passage]);

    const raw = await db().storage.from("raw").download(snap.raw_path);
    assertEquals(JSON.parse(await raw.data!.text()).data.tag, capture.id);
    const cap = await captureRow(capture.id);
    assertEquals([cap.status, cap.last_error], ["received", null]);
    assert(cap.received_at);

    const again = await ingestTask(capture.id, task);
    assertEquals([again.snapshot_id, again.duplicate, again.status], [first.snapshot_id, true, "present"]);
    const count = await db().from("snapshots").select("id", { count: "exact", head: true }).eq("capture_id", capture.id);
    assertEquals(count.count, 1);
  } finally {
    await cleanup([], [series.id]);
  }
});

Deno.test("identical content reuses the earlier snapshot; absent renders need no extraction", async () => {
  const series = await createSeries(uniqueKeyword("same-as"));
  try {
    const base = fixtureResult("synthetic-form-builders.json");
    const a = await createCapture(series.id, { scheduled_at: "2026-10-07T09:00:00Z" });
    const first = await ingestTask(a.id, okTask(a.id, base));

    // Same content: references reordered, a new image, another capture time.
    const same = structuredClone(base);
    same.datetime = "2026-10-07 15:00:00 +00:00";
    const ov = same.items.find((i: any) => i.type === "ai_overview");
    ov.references.reverse();
    ov.markdown = ov.markdown.replace(/base64,[A-Za-z0-9+/=]+/, "base64,R0lGODlhAQABAAAAACw=");
    const b = await createCapture(series.id, { scheduled_at: "2026-10-07T12:00:00Z" });
    await ingestTask(b.id, okTask(b.id, same));
    const snapB = await snapshotOf(b.id);
    assertEquals([snapB.same_as, snapB.extraction], [first.snapshot_id, "reused"]);

    // A third copy still points at the original, not at the reused copy.
    const c = await createCapture(series.id, { scheduled_at: "2026-10-07T15:00:00Z" });
    await ingestTask(c.id, okTask(c.id, structuredClone(same)));
    assertEquals((await snapshotOf(c.id)).same_as, first.snapshot_id);

    const d = await createCapture(series.id, { scheduled_at: "2026-10-07T18:00:00Z" });
    const absent = await ingestTask(d.id, okTask(d.id, fixtureResult("synthetic-absent.json")));
    assertEquals(absent.status, "absent");
    const snapD = await snapshotOf(d.id);
    assertEquals([snapD.extraction, snapD.same_as, snapD.content_hash, snapD.sentences], ["none", null, null, []]);
    assertEquals(snapD.organic.length, 4);
  } finally {
    await cleanup([], [series.id]);
  }
});

Deno.test("identical content never reuses an original whose extraction failed", async () => {
  const series = await createSeries(uniqueKeyword("failed-original"));
  try {
    const base = fixtureResult("synthetic-form-builders.json");
    const at = (h: number) => ({ ...structuredClone(base), datetime: `2026-10-07 ${String(h).padStart(2, "0")}:00:00 +00:00` });
    const ingest = async (h: number, result: any) => {
      const c = await createCapture(series.id, { scheduled_at: `2026-10-07T${String(h).padStart(2, "0")}:00:00Z` });
      return (await ingestTask(c.id, okTask(c.id, result))).snapshot_id!;
    };
    const setExtraction = async (id: string, extraction: string) =>
      must(await db().from("snapshots").update({ extraction }).eq("id", id), "set extraction");
    const link = async (id: string) => {
      const s = must(await db().from("snapshots").select("same_as, extraction").eq("id", id).single(), "snapshot") as any;
      return [s.same_as, s.extraction];
    };

    // The original failed for good before any copy arrived: the next identical render is the new original.
    const s1 = await ingest(0, at(0));
    await setExtraction(s1, "failed");
    const s2 = await ingest(3, at(3));
    assertEquals(await link(s2), [null, "pending"]);
    const s3 = await ingest(6, at(6));
    assertEquals(await link(s3), [s2, "reused"]);

    // Another content: the original fails after a copy pointed at it. fail_extraction resets the copy
    // to pending with same_as kept; later identical renders reuse that copy, not the failed original.
    const other = fixtureResult("synthetic-sections.json");
    const otherAt = (h: number) => ({ ...structuredClone(other), datetime: `2026-10-07 ${String(h).padStart(2, "0")}:00:00 +00:00` });
    const o1 = await ingest(9, otherAt(9));
    const o2 = await ingest(12, otherAt(12));
    assertEquals(await link(o2), [o1, "reused"]);
    await setExtraction(o1, "failed");
    await setExtraction(o2, "pending");
    const o3 = await ingest(15, otherAt(15));
    assertEquals(await link(o3), [o2, "reused"]);
    // A copy still waiting to be reset is reused too (the chain resolves once it is extracted).
    await setExtraction(o2, "reused");
    const o4 = await ingest(18, otherAt(18));
    assertEquals(await link(o4), [o2, "reused"]);
  } finally {
    await cleanup([], [series.id]);
  }
});

Deno.test("an overview flips watching tracked queries to tracking", async () => {
  const series = await createSeries(uniqueKeyword("watching"));
  const users: TestUser[] = [];
  try {
    const user = await createUser("ingest");
    users.push(user);
    const tq = await createTrackedQuery(user.id, series.id, { status: "watching" });
    const a = await createCapture(series.id, { scheduled_at: "2026-10-07T09:00:00Z" });
    await ingestTask(a.id, okTask(a.id, fixtureResult("synthetic-absent.json")));
    const status = async () => (must(await db().from("tracked_queries").select("status").eq("id", tq.id).single(), "tq") as any).status;
    assertEquals(await status(), "watching");
    const b = await createCapture(series.id, { scheduled_at: "2026-10-07T12:00:00Z" });
    await ingestTask(b.id, okTask(b.id, fixtureResult("synthetic-sections.json")));
    assertEquals(await status(), "tracking");
  } finally {
    await cleanup(users, [series.id]);
  }
});

Deno.test("failed tasks retry, then become error renders; a late result replaces the error", async () => {
  const series = await createSeries(uniqueKeyword("failures"));
  try {
    const failedTask = (id: string) => ({ id: "t", status_code: 40501, status_message: "Invalid Field.", data: { tag: id }, result: null });

    const a = await createCapture(series.id, { scheduled_at: "2026-10-07T09:00:00Z", attempts: 1 });
    const r1 = await ingestTask(a.id, failedTask(a.id));
    assertEquals([r1.status, r1.snapshot_id], ["retry", null]);
    const capA = await captureRow(a.id);
    assertEquals([capA.status, capA.last_error], ["pending", "40501 Invalid Field."]);

    const b = await createCapture(series.id, { scheduled_at: "2026-10-07T12:00:00Z", attempts: 3 });
    const r2 = await ingestTask(b.id, failedTask(b.id));
    assertEquals(r2.status, "error");
    const errSnap = await snapshotOf(b.id);
    assertEquals([errSnap.status, errSnap.extraction, new Date(errSnap.captured_at).toISOString()], ["error", "none", "2026-10-07T12:00:00.000Z"]);
    assertEquals((await captureRow(b.id)).status, "error");
    assertEquals(await recordCaptureFailure(b.id, "again"), errSnap.id, "recording a failure twice keeps one snapshot");

    const late = await ingestTask(b.id, okTask(b.id, fixtureResult("synthetic-form-builders.json")));
    assertEquals([late.status, late.duplicate], ["present", false]);
    assertEquals((await snapshotOf(b.id)).status, "present");
    assertEquals((await captureRow(b.id)).status, "received");

    const empty = await createCapture(series.id, { scheduled_at: "2026-10-07T15:00:00Z", attempts: 1 });
    assertEquals((await ingestTask(empty.id, { ...okTask(empty.id, null), result: [] })).status, "retry");
  } finally {
    await cleanup([], [series.id]);
  }
});

Deno.test("unknown capture ids are reported, not written", async () => {
  const task = okTask("x", fixtureResult("synthetic-form-builders.json"));
  assertEquals((await ingestTask("not-a-uuid", task)).status, "unknown");
  assertEquals((await ingestTask(crypto.randomUUID(), task)).status, "unknown");
});

Deno.test("submitCaptures stores task ids, and leaves rejected captures pending", async () => {
  const keyword = uniqueKeyword("submit");
  const series = await createSeries(keyword);
  const stub = startStubDfs();
  try {
    const a = await createCapture(series.id, { status: "pending", attempts: 0, submitted_at: null, scheduled_at: "2026-10-07T09:00:00Z" });
    const b = await createCapture(series.id, { status: "pending", attempts: 1, submitted_at: null, scheduled_at: "2026-10-07T12:00:00Z" });
    const rows = [a, b].map((c) => ({ capture_id: c.id, keyword, location_code: 2840, language_code: "en", device: "desktop" as const }));
    assertEquals(await submitCaptures(rows), { submitted: 2, failed: 0 });
    const posted = stub.calls.find((c) => c.path === "/v3/serp/google/organic/task_post")!.body;
    assertEquals(posted.map((t: any) => t.tag), [a.id, b.id]);
    assert(posted[0].postback_url.includes("/dataforseo-postback?secret="));
    assertEquals(posted[0].postback_data, "advanced");
    const capA = await captureRow(a.id);
    assertEquals([capA.status, capA.attempts], ["submitted", 1]);
    assert(stub.posted.has(capA.task_id));
    assertEquals((await captureRow(b.id)).attempts, 2);

    await stub.close();
    Deno.env.set("DATAFORSEO_BASE_URL", "http://127.0.0.1:9");
    const c = await createCapture(series.id, { status: "pending", attempts: 0, submitted_at: null, scheduled_at: "2026-10-07T15:00:00Z" });
    assertEquals(await submitCaptures([{ ...rows[0], capture_id: c.id }]), { submitted: 0, failed: 1 });
    const capC = await captureRow(c.id);
    assertEquals([capC.status, capC.attempts, capC.task_id], ["pending", 1, null]);
    assert(capC.last_error);
  } finally {
    await stub.close().catch(() => {});
    await cleanup([], [series.id]);
  }
});
