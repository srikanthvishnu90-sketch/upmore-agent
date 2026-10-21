// Future runs only. No provider call occurs on import, and no private journal field is published.
import { journalProgress } from "./progress.ts";
import { type Append, type Approval, type ArmResult, type Identity,
  BudgetJournal, COMPARISON_RUBRIC, JUDGES, MODELS, armSummary, canonical, modelPreflight, runArm, sha256, validateApproval, validateCorpus, verifyFirstArm } from "./run-comparison.ts";
import { PRICES } from "../../supabase/functions/_shared/model_gateway.ts";

const VERSION = "brain-eval-live-meter-v1";
const fail = () => new Error("LIVE_METER_UNAVAILABLE: further provider dispatch is blocked");
const require = (ok: unknown) => { if (!ok) throw fail(); };
const micros = (n: number) => { const v = Math.round(n * 1e6); require(Number.isFinite(n) && n >= 0 && Number.isSafeInteger(v) && Math.abs(n * 1e6 - v) < .000001); return v; };
export interface MeterBinding {
  repository: string; run_id: string; source_commit: string; corpus_sha256: string;
  model: "gpt-5-mini" | "gpt-5"; cap_usd: number; comparison_spent_usd: number;
}
const bindingKeys = ["repository", "run_id", "source_commit", "corpus_sha256", "model", "cap_usd", "comparison_spent_usd"] as const;
function bindingCopy(b: MeterBinding): MeterBinding {
  require(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(b.repository) && /^[1-9][0-9]*$/.test(b.run_id));
  require(/^[a-f0-9]{40}$/.test(b.source_commit) && /^[a-f0-9]{64}$/.test(b.corpus_sha256));
  const cap = micros(b.cap_usd), prior = micros(b.comparison_spent_usd);
  require(cap > 0 && cap + prior <= 20e6 && (b.model === "gpt-5-mini" ? cap <= 5e6 && prior === 0 : b.model === "gpt-5" && cap <= 8e6));
  return Object.fromEntries(bindingKeys.map(k => [k, b[k]])) as unknown as MeterBinding;
}
type Progress = ReturnType<typeof journalProgress>;
export interface PublicMeter extends MeterBinding {
  schema: string; sequence: number; observed_at: string; alert_threshold_usd: 6;
  threshold_crossed_at: string | null; alert_delivery: "ARTIFACT_ONLY";
  status: Progress["status"]; settled_calls: number; completed_cases: number; processed_cases: number;
  known_cost_usd: number; held_reservations_usd: number; unknown_charges: number; unsettled_calls: number;
  total_cost_final: boolean; combined_known_cost_usd: number; combined_exposure_usd: number;
}
const publicKeys = [...bindingKeys, "schema", "sequence", "observed_at", "alert_threshold_usd", "threshold_crossed_at", "alert_delivery",
  "status", "settled_calls", "completed_cases", "processed_cases", "known_cost_usd", "held_reservations_usd", "unknown_charges", "unsettled_calls",
  "total_cost_final", "combined_known_cost_usd", "combined_exposure_usd"].sort();
const sameBinding = (a: MeterBinding, b: MeterBinding) => bindingKeys.every(k => a[k] === b[k]);
export function validatePublicMeter(p: PublicMeter) {
  bindingCopy(p);
  require(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(publicKeys) && p.schema === VERSION && p.alert_delivery === "ARTIFACT_ONLY");
  require(Number.isSafeInteger(p.sequence) && p.sequence > 0 && Number.isFinite(Date.parse(p.observed_at)) && p.alert_threshold_usd === 6);
  require([p.settled_calls, p.completed_cases, p.processed_cases, p.unknown_charges, p.unsettled_calls].every(n => Number.isSafeInteger(n) && n >= 0));
  require(p.completed_cases <= p.processed_cases && p.processed_cases <= 320 && p.unknown_charges <= p.unsettled_calls);
  require(["WAITING", "RUNNING", "HALTED", "COMPLETE"].includes(p.status) && typeof p.total_cost_final === "boolean");
  const known = micros(p.known_cost_usd), held = micros(p.held_reservations_usd), prior = micros(p.comparison_spent_usd);
  require(known + held <= micros(p.cap_usd) && micros(p.combined_known_cost_usd) === prior + known && micros(p.combined_exposure_usd) === prior + known + held);
  require(p.threshold_crossed_at === null ? known < 6e6 : Number.isFinite(Date.parse(p.threshold_crossed_at)) && known >= 6e6);
  require(p.threshold_crossed_at === null || Date.parse(p.threshold_crossed_at) <= Date.parse(p.observed_at));
  if (p.total_cost_final) require(["COMPLETE", "HALTED"].includes(p.status) && !p.unknown_charges && !p.unsettled_calls && !held);
  if (p.status === "COMPLETE") require(p.total_cost_final && p.completed_cases === 320 && p.processed_cases === 320 && p.settled_calls >= 640);
  if (p.status === "WAITING") require(!known && !held && !p.settled_calls && !p.processed_cases && !p.unknown_charges && !p.unsettled_calls && !p.total_cost_final);
}
export interface PublishReceipt { commit_sha: string; content_sha: string; url: string }
export type Publisher = (snapshot: PublicMeter) => Promise<PublishReceipt>;

// A supported, readable branch artifact. The token never enters the snapshot, URL, log or error.
// A failed/contended publication is not retried; the caller must stop further provider dispatch.
export function githubMeterPublisher(binding: MeterBinding, token: string, request: typeof fetch = fetch): Publisher {
  const b = bindingCopy(binding); require(typeof token === "string" && token.length >= 20);
  const branch = `wo/brain-eval-meter-${b.run_id}`, path = `evals/brain-reliability/runtime/${b.run_id}.json`;
  const base = `https://api.github.com/repos/${b.repository}`;
  let branchReady = false;
  const api = async (url: string, method = "GET", data?: unknown) => {
    try {
      return await request(url, { method, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28", "content-type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(15000) });
    } catch { throw fail(); }
  };
  const decode = async (r: Response) => { try { return await r.json(); } catch { throw fail(); } };
  return async snapshot => {
    try {
      validatePublicMeter(snapshot); require(sameBinding(snapshot, b));
      if (!branchReady) {
        const ref = await api(`${base}/git/ref/heads/${encodeURIComponent(branch)}`);
        if (ref.status === 404) {
          const made = await api(`${base}/git/refs`, "POST", { ref: `refs/heads/${branch}`, sha: b.source_commit });
          require(made.status === 201); const result = await decode(made);
          require(result.ref === `refs/heads/${branch}` && result.object?.sha === b.source_commit);
        } else { require(ref.ok); const result = await decode(ref); require(result.ref === `refs/heads/${branch}`); }
        branchReady = true;
      }
      const old = await api(`${base}/contents/${path}?ref=${encodeURIComponent(branch)}`);
      let contentSha: string | undefined;
      if (old.status !== 404) {
        require(old.ok); const file = await decode(old); contentSha = file.sha;
        require(typeof contentSha === "string" && /^[a-f0-9]{40}$/.test(contentSha) && file.encoding === "base64");
        const raw = Uint8Array.from(atob(String(file.content).replace(/\s/g, "")), c => c.charCodeAt(0));
        const previous = JSON.parse(new TextDecoder().decode(raw)) as PublicMeter;
        validatePublicMeter(previous); require(sameBinding(previous, b) && previous.sequence < snapshot.sequence);
        require(previous.known_cost_usd <= snapshot.known_cost_usd && previous.settled_calls <= snapshot.settled_calls &&
          previous.processed_cases <= snapshot.processed_cases && previous.completed_cases <= snapshot.completed_cases &&
          Date.parse(previous.observed_at) <= Date.parse(snapshot.observed_at) && (!previous.threshold_crossed_at || previous.threshold_crossed_at === snapshot.threshold_crossed_at));
        if (previous.total_cost_final) require(snapshot.total_cost_final && previous.status === snapshot.status && previous.known_cost_usd === snapshot.known_cost_usd &&
          previous.settled_calls === snapshot.settled_calls && previous.processed_cases === snapshot.processed_cases && previous.completed_cases === snapshot.completed_cases);
      } else require(snapshot.sequence === 1);
      const raw = new TextEncoder().encode(JSON.stringify(snapshot) + "\n");
      const content = btoa(String.fromCharCode(...raw));
      const written = await api(`${base}/contents/${path}`, "PUT", { message: `eval meter: run ${b.run_id} snapshot ${snapshot.sequence}`, branch, content, ...(contentSha ? { sha: contentSha } : {}) });
      require(written.status === 200 || written.status === 201); const receipt = await decode(written);
      require(/^[a-f0-9]{40}$/.test(receipt.commit?.sha) && /^[a-f0-9]{40}$/.test(receipt.content?.sha) && receipt.content?.path === path);
      return { commit_sha: receipt.commit.sha, content_sha: receipt.content.sha,
        url: `https://github.com/${b.repository}/blob/${receipt.commit.sha}/${path}` };
    } catch { throw fail(); }
  };
}

export class LiveCostMeter {
  private raw = ""; private progress = journalProgress(""); private sequence = 0; private publishedSequence = 0;
  private lastQueuedAt = -Infinity; private queue: Promise<void> = Promise.resolve(); private failed = false;
  private thresholdAt: string | null = null; private header = false; private receipt: PublishReceipt | null = null;
  readonly binding: MeterBinding;
  constructor(binding: MeterBinding, private publish: Publisher, private now: () => number = Date.now, readonly intervalMs = 15000) {
    this.binding = Object.freeze(bindingCopy(binding)); require(Number.isSafeInteger(intervalMs) && intervalMs >= 1000 && intervalMs <= 15000);
  }
  private snapshot(): PublicMeter {
    const p = this.progress;
    require(p.known_cost_usd !== null && p.held_reservations_usd !== null && p.settled_calls !== null && p.completed_cases !== null &&
      p.processed_cases !== null && p.unknown_charges !== null && p.unsettled_calls !== null);
    const value: PublicMeter = { ...this.binding, schema: VERSION, sequence: ++this.sequence, observed_at: new Date(this.now()).toISOString(),
      alert_threshold_usd: 6, threshold_crossed_at: this.thresholdAt, alert_delivery: "ARTIFACT_ONLY", status: p.status,
      settled_calls: p.settled_calls!, completed_cases: p.completed_cases!, processed_cases: p.processed_cases!, known_cost_usd: p.known_cost_usd!,
      held_reservations_usd: p.held_reservations_usd!, unknown_charges: p.unknown_charges!, unsettled_calls: p.unsettled_calls!, total_cost_final: p.total_cost_final,
      combined_known_cost_usd: (micros(this.binding.comparison_spent_usd) + micros(p.known_cost_usd!)) / 1e6,
      combined_exposure_usd: (micros(this.binding.comparison_spent_usd) + micros(p.known_cost_usd!) + micros(p.held_reservations_usd!)) / 1e6 };
    validatePublicMeter(value); return value;
  }
  private enqueue() {
    if (this.failed) return;
    const snapshot = this.snapshot(); this.lastQueuedAt = this.now();
    this.queue = this.queue.then(async () => {
      require(!this.failed); const receipt = await this.publish(snapshot);
      require(/^[a-f0-9]{40}$/.test(receipt.commit_sha) && /^[a-f0-9]{40}$/.test(receipt.content_sha));
      this.receipt = receipt; this.publishedSequence = snapshot.sequence;
    }).catch(() => { this.failed = true; });
  }
  // Call this only after the same event has been durably appended/fsynced. Raw bytes remain in this process.
  observe(event: Record<string, unknown>) {
    try {
      require(!this.failed);
      if (!this.header) {
        require(event.type === "arm"); const e = event as any;
        require(e.model === this.binding.model && e.identity?.source_commit === this.binding.source_commit && e.identity?.corpus_sha256 === this.binding.corpus_sha256 &&
          e.approval?.cap_usd === this.binding.cap_usd && e.approval?.comparison_spent_usd === this.binding.comparison_spent_usd); this.header = true;
      }
      this.raw += JSON.stringify(event) + "\n"; this.progress = journalProgress(this.raw);
      require(!["INVALID_SNAPSHOT", "RETRY_SNAPSHOT"].includes(this.progress.status));
      if (event.type === "settlement" && !this.thresholdAt && this.progress.known_cost_usd !== null && micros(this.progress.known_cost_usd) >= 6e6) {
        this.thresholdAt = new Date(this.now()).toISOString(); this.enqueue();
      }
    } catch { this.failed = true; throw fail(); }
  }
  async flush(force = false) {
    require(this.header && !this.failed);
    if (force || this.now() - this.lastQueuedAt >= this.intervalMs) this.enqueue();
    // A concurrent settlement can enqueue a threshold snapshot while this await is pending.
    // Drain through the latest barrier, rather than accepting acknowledgement of an older snapshot.
    for (;;) { const barrier = this.queue; await barrier; require(!this.failed); if (barrier === this.queue) break; }
    return this.receipt;
  }
  async beforeDispatch() {
    await this.flush(); require(!this.failed && this.progress.status === "RUNNING" && this.progress.unknown_charges === 0);
  }
  wrapRequest(request: typeof fetch = fetch): typeof fetch {
    return (async (...args: Parameters<typeof fetch>) => {
      for (;;) {
        await this.beforeDispatch();
        // Check and dispatch in the same continuation: another settlement may have run between
        // beforeDispatch resolving and this request resuming. Never pass an unacknowledged crossing.
        const p = this.progress;
        require(!this.failed && p.status === "RUNNING" && p.unknown_charges === 0 && p.unsettled_calls !== null && p.unsettled_calls > 0 &&
          p.known_cost_usd !== null && p.held_reservations_usd !== null && micros(p.known_cost_usd) + micros(p.held_reservations_usd) <= micros(this.binding.cap_usd));
        if (this.publishedSequence === this.sequence) return await request(...args);
      }
    }) as typeof fetch;
  }
}

// New orchestration entry point for a FUTURE, separately approved run. Existing paid workflows do not import it.
// Callers still persist the full result privately; only PublicMeter is passed to the publisher.
export async function runLiveMeteredArm(args: { corpusRaw: string; manifestRaw: string; approvalFile: string; binding: MeterBinding;
  append: Append; publisher: Publisher; apiKey: string; firstArmRaw?: string; request?: typeof fetch; now?: () => number }): Promise<ArmResult> {
  const { corpusRaw, manifestRaw, approvalFile, binding, append, publisher, apiKey, firstArmRaw } = args;
  const approval = JSON.parse(await Deno.readTextFile(approvalFile)) as Approval & { live_meter_approval_ref: string };
  const approvedRef = (value: unknown) => typeof value === "string" && value.trim() !== "" && value.trim() !== "NOT_APPROVED";
  require(approvedRef(approval.live_meter_approval_ref) && approvedRef(approval.owner_approval_ref));
  const manifest = JSON.parse(manifestRaw), corpus = await validateCorpus(corpusRaw, manifest);
  const root = new URL("../../", import.meta.url);
  const git = async (...command: string[]) => {
    const result = await new Deno.Command("git", { cwd: root, args: command, stdout: "piped", stderr: "piped" }).output();
    require(result.success); return new TextDecoder().decode(result.stdout).trim();
  };
  const source = await git("rev-parse", "HEAD"); require(/^[a-f0-9]{40}$/.test(source) && !await git("status", "--porcelain"));
  const identity: Identity = { source_commit: source, corpus_sha256: manifest.sha256, rubric_sha256: await sha256(COMPARISON_RUBRIC),
    clock_utc: corpus.clock_utc, seed: corpus.seed, concurrency: 4,
    params: { judges: [...JUDGES], reasoning_effort: "minimal", brain_max_tokens: 1200, judge_max_tokens: 700, provider_retry_count: 0,
      turn_advance_ms: 60000, fixture_version: "deterministic-local-stores-v1", manifest_sha256: await sha256(manifestRaw),
      harness_sha256: await sha256(await Deno.readTextFile(new URL("./run-comparison.ts", import.meta.url))),
      prices_sha256: await sha256(canonical(Object.fromEntries([...MODELS, ...JUDGES].map(m => [m, PRICES[m]])))),
      live_meter_sha256: await sha256(await Deno.readTextFile(new URL(import.meta.url))),
      progress_reader_sha256: await sha256(await Deno.readTextFile(new URL("./progress.ts", import.meta.url))),
      publication_interval_ms: 15000, settled_alert_threshold_usd: 6 } };
  validateApproval(approval, binding.model, source, manifest.sha256);
  require(sameBinding(bindingCopy(binding), { ...binding, source_commit: source, corpus_sha256: manifest.sha256,
    model: approval.model as MeterBinding["model"], cap_usd: approval.cap_usd, comparison_spent_usd: approval.comparison_spent_usd }));
  if (binding.model === "gpt-5") { require(typeof firstArmRaw === "string"); await verifyFirstArm(approval, identity, firstArmRaw!); }
  // Same local once-only guard as the existing CLI. The shared owner ledger is still authoritative across machines.
  const consumed = Deno.openSync(approvalFile + ".consumed", { write: true, createNew: true, mode: 0o600 });
  try { const raw = new TextEncoder().encode(canonical({ approval, run_id: binding.run_id, consumed_at: new Date().toISOString() }));
    let at = 0; while (at < raw.length) at += consumed.writeSync(raw.subarray(at)); consumed.syncSync();
  } finally { consumed.close(); }
  const meter = new LiveCostMeter(binding, publisher, args.now);
  const durableObserved: Append = event => { append(event); meter.observe(event); };
  durableObserved({ type: "arm", model: binding.model, identity, approval });
  await meter.flush(true); // Publication is required before availability probes or a paid reservation.
  await modelPreflight(apiKey, [...new Set([binding.model, "gpt-5-mini", "gpt-4.1-mini"])], args.request);
  durableObserved({ type: "preflight", status: "available" });
  const journal = new BudgetJournal(micros(binding.cap_usd), durableObserved);
  const tick = setInterval(() => { void meter.flush().catch(() => { /* failure is sticky; request gate refuses */ }); }, meter.intervalMs);
  try {
    const arm = await runArm(corpus, identity, binding.model, journal, durableObserved, apiKey, meter.wrapRequest(args.request));
    durableObserved({ type: "complete", summary: armSummary(arm) }); await meter.flush(true); return arm;
  } finally { clearInterval(tick); }
}
