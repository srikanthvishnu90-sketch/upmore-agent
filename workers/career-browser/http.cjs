"use strict";
const { fail } = require("./store.cjs");

// Uses the existing user JWT through a host-provided verifier. Never trust
// userId in a body, accept a service-role bridge token, or mint credentials.
function createHttpHandler({ worker, authenticate }) {
  if (typeof authenticate !== "function") throw fail("AUTH_VERIFIER_REQUIRED");
  return async function handle(req) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    try {
      const user = await authenticate(req.headers.get("Authorization") || "");
      if (!user?.id || user.serviceRole) return json({ error: "unauthorized" }, 401);
      const url = new URL(req.url);
      const match = url.pathname.match(/^\/tasks(?:\/([a-f0-9]{32})(?:\/(prepare|approve|reconcile|research))?)?$/);
      if (!match) return json({ error: "not_found" }, 404);
      if (req.method === "GET" && match[1] && !match[2]) return json({ task: worker.get(user.id, match[1]) });
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const text = await req.text();
      if (text.length > 32000) return json({ error: "body_too_large" }, 413);
      const body = JSON.parse(text || "{}");
      if (body.userId && body.userId !== user.id) return json({ error: "user_mismatch" }, 403);
      if (!match[1]) return json({ task: worker.receive(user.id, body) }, 202);
      const action = match[2];
      if (action === "research") return json({ task: worker.research(user.id, match[1]) });
      if (action === "prepare") return json({ task: worker.prepare(user.id, match[1]) });
      if (action === "approve") return json({ task: worker.approve(user.id, match[1], body) });
      if (action === "reconcile") return json({ task: worker.reconcile(user.id, match[1], body) });
      return json({ error: "not_found" }, 404);
    } catch (e) { return json({ error: e.code || "worker_error" }, e.code === "TASK_NOT_FOUND" ? 404 : 409); }
  };
}
module.exports = { createHttpHandler };
