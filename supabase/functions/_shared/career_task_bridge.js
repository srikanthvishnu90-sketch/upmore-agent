// Edge-safe protocol only. The Node worker and task store never enter the
// deployed function's import graph. CareerHost remains the conversation owner.
async function routeCareerBrowserTask({ taskRequest, message, userId, userToken, ctx, endpoint, fetchImpl = fetch }) {
  if (!taskRequest) return null;
  const reply = (text, resultStatus = "blocked", task = null, code = null) => ({
    reply: text, intent: "career_browser_task", resultStatus, contained: false,
    task, blocker: code, result: { task, sends: 0 },
    capabilities: { portal_browser: { status: task ? "CONTROLLED_LOCAL_ONLY" : "NOT_WIRED" }, job_alert_delivery: { status: "NOT_WIRED" } },
  });
  if (!endpoint || !userToken) return reply("The owned browser worker is not wired for this chat session; no browser task was started.", "blocked", null, "WORKER_NOT_WIRED");
  const action = taskRequest.action;
  if (!["prepare", "status", "approve", "reconcile"].includes(action)) return reply("That browser task action is unavailable.", "blocked", null, "TASK_ACTION_INVALID");
  const id = taskRequest.taskId;
  if (action !== "prepare" && !/^[a-f0-9]{32}$/.test(id || "")) return reply("Name the browser task to continue.", "awaiting_user", null, "TASK_ID_REQUIRED");
  const base = new URL(endpoint);
  if (base.username || base.password || base.search || base.hash || !["https:", "http:"].includes(base.protocol)) return reply("The owned browser worker configuration is unavailable.", "blocked", null, "WORKER_CONFIGURATION_INVALID");
  if (base.protocol === "http:" && !["localhost", "127.0.0.1"].includes(base.hostname)) return reply("The owned browser worker requires a protected connection.", "blocked", null, "WORKER_CONFIGURATION_INVALID");
  let method = "POST", target, body;
  if (action === "prepare") {
    if (!ctx?.posting || !taskRequest.artifactId || !taskRequest.resumeSha256 || !taskRequest.eventId) return reply("I need the chosen posting and an existing resume artifact with its exact hash before queuing browser preparation.", "awaiting_user", null, "TASK_INPUT_REQUIRED");
    // Only the current host's chosen posting is used. Caller-supplied profile,
    // local file paths, destinations or user identity are never forwarded.
    target = "/tasks";
    body = { eventId: taskRequest.eventId, posting: ctx.posting, artifactId: taskRequest.artifactId, resumeSha256: taskRequest.resumeSha256 };
  } else if (action === "status") { target = "/tasks/" + id; method = "GET"; }
  else {
    target = "/tasks/" + id + "/" + action;
    if (action === "approve" && !/^\s*approve browser task [a-f0-9]{32}\s*[.!]?\s*$/i.test(message || "")) return reply("Review the exact task payload first, then approve that browser task explicitly.", "awaiting_user", null, "EXPLICIT_APPROVAL_REQUIRED");
    if (action === "approve" && !(message || "").toLowerCase().includes(id)) return reply("The approval names a different browser task.", "blocked", null, "APPROVAL_TASK_MISMATCH");
    body = action === "approve" ? { approvedByUser: true, approvalRef: taskRequest.eventId,
      payloadSha256: taskRequest.payloadSha256, resumeSha256: taskRequest.resumeSha256, destination: taskRequest.destination } : {};
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(new URL(target, base), { method, redirect: "error", signal: controller.signal,
      headers: { Authorization: "Bearer " + userToken, "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok || !data.task) return reply("The browser task did not confirm that operation; check its status before retrying.", "blocked", null, data.error || "WORKER_OPERATION_UNCONFIRMED");
    const task = data.task;
    if (task.userId !== userId) return reply("The worker returned a task for another owner; no result is accepted.", "blocked", null, "TASK_OWNER_MISMATCH");
    if (task.id !== id && action !== "prepare") return reply("The worker returned a different task; no result is accepted.", "blocked", null, "TASK_RESULT_MISMATCH");
    const text = task.status === "review_ready" ? "The application is prepared for review; nothing has been submitted. Review the exact payload and resume hash before approving this task."
      : task.status === "completed" ? "The controlled local portal confirmed this task; its checked result is attached."
      : task.status === "unknown_outcome" ? "The submission outcome is unknown. I will reconcile the destination before any further action; I have not retried it."
      : task.status === "queued" ? "Browser preparation is queued. No form has been opened or submitted yet; check this task for its review artifact."
      : "The browser task is " + task.status + "; no completed submission is claimed. Its current details are attached.";
    return reply(text, task.status, task);
  } catch (_) { return reply("The browser worker did not confirm the operation. Its outcome is uncertain; check the task before retrying.", "unknown_outcome", null, "WORKER_OPERATION_UNCERTAIN"); }
  finally { clearTimeout(timer); }
}
export { routeCareerBrowserTask };
