// set-own-page: implemented in the build phase.
Deno.serve(() => new Response(JSON.stringify({ error: "not implemented" }), { status: 501, headers: { "content-type": "application/json" } }));
