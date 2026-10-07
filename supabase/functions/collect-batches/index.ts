// collect-batches: implemented in the build phase. See PLAN.md section 9.
Deno.serve(() => new Response(JSON.stringify({ error: "not implemented" }), { status: 501, headers: { "content-type": "application/json" } }));
