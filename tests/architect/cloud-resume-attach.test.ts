// Resume → cloud attach (FEATURE 17 follow-up, PR #202 gap): when a person's resume file is confirmed, the file
// itself must be kept for the cloud (career_apply_cloud_resume_put_for), or the hosted path has nothing to attach.
// Until this module existed, NO production code called put_for — the hosted-apply flow test faked the call as raw
// SQL "setup". These units pin the service-side keep: the exact bytes, by their hash, verified on read-back; a
// paste-only confirm keeps nothing and yields the honest line; a store that disagrees about the hash is a typed
// stop, never a claimed keep. No database, no network.
import assertNode from "node:assert/strict";
import { CloudResumeMismatch, keepConfirmedResumeForCloud, NO_FILE_KEPT_LINE, supabaseCloudResumeStore, type CloudResumeStore } from "../../supabase/functions/_shared/career_apply_cloud_resume.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);

const U = "7b0f8f8e-6a43-4a49-9d2c-0000000002b1";
const FILE = new TextEncoder().encode("%PDF-1.4 TEST resume for the attach test");
const FILE_SHA = await (async () => {
  const h = await crypto.subtle.digest("SHA-256", FILE);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
})();

function fakeStore(over: Partial<CloudResumeStore> = {}): { store: CloudResumeStore; puts: any[] } {
  const puts: any[] = [];
  const rows = new Map<string, { filename: string; sha256: string }>();
  const store: CloudResumeStore = {
    async put(userId, filename, b64) {
      puts.push({ userId, filename, b64 });
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const h = await crypto.subtle.digest("SHA-256", bytes);
      const sha = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
      rows.set(userId, { filename, sha256: sha });
      return sha;
    },
    async kept(userId) { return rows.get(userId) ?? null; },
    ...over,
  };
  return { store, puts };
}

Deno.test("attach: a confirmed file is kept for the cloud by its hash, the exact bytes, verified on read-back", async () => {
  const { store, puts } = fakeStore();
  const r = await keepConfirmedResumeForCloud(store, { userId: U, file: { filename: "resume.pdf", bytes: FILE } });
  eq(r.kept, true);
  eq(r.sha256, FILE_SHA, "the keep is named by the file's own hash");
  eq(puts.length, 1, "exactly one put");
  eq(puts[0].userId, U);
  eq(puts[0].filename, "resume.pdf");
  eq(Uint8Array.from(atob(puts[0].b64), (c) => c.charCodeAt(0)), FILE, "the bytes sent are the file's bytes, as is");
  assert(/kept for the cloud/.test(r.line), "the reply line says the file is kept");
});

Deno.test("attach: no file (a paste-only confirm) keeps nothing and says no file is kept", async () => {
  const { store, puts } = fakeStore();
  const r = await keepConfirmedResumeForCloud(store, { userId: U, file: null });
  eq(r.kept, false);
  eq(puts.length, 0, "nothing is put");
  eq(r.line, NO_FILE_KEPT_LINE);
  assert(/No resume file is kept/.test(r.line), "the honest line names that no file is kept");
  const r2 = await keepConfirmedResumeForCloud(store, { userId: U, file: { filename: "empty.pdf", bytes: new Uint8Array(0) } });
  eq(r2.kept, false, "an empty file is no file");
  eq(puts.length, 0);
});

Deno.test("attach: a store that returns a different hash than the file's is a typed stop, never a claimed keep", async () => {
  const { store } = fakeStore({ async put() { return "0".repeat(64); } });
  let err: unknown = null;
  try { await keepConfirmedResumeForCloud(store, { userId: U, file: { filename: "resume.pdf", bytes: FILE } }); } catch (e) { err = e; }
  assert(err instanceof CloudResumeMismatch, `expected CloudResumeMismatch, got ${String(err)}`);
});

Deno.test("attach: a read-back that does not name the kept hash is a typed stop", async () => {
  const { store } = fakeStore({ async kept() { return { filename: "resume.pdf", sha256: "f".repeat(64) }; } });
  let err: unknown = null;
  try { await keepConfirmedResumeForCloud(store, { userId: U, file: { filename: "resume.pdf", bytes: FILE } }); } catch (e) { err = e; }
  assert(err instanceof CloudResumeMismatch, `expected CloudResumeMismatch, got ${String(err)}`);
});

Deno.test("attach: the supabase store calls the two cloud-resume functions by name, as the person", async () => {
  const calls: any[] = [];
  const admin = { rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: name.endsWith("put_for") ? FILE_SHA : { filename: "resume.pdf", sha256: FILE_SHA }, error: null }; } };
  const store = supabaseCloudResumeStore(admin);
  eq(await store.put(U, "resume.pdf", "QUJD"), FILE_SHA);
  eq(calls[0], { name: "career_apply_cloud_resume_put_for", args: { p_user: U, p_filename: "resume.pdf", p_b64: "QUJD" } });
  eq(await store.kept(U), { filename: "resume.pdf", sha256: FILE_SHA });
  eq(calls[1], { name: "career_apply_cloud_resume_kept_for", args: { p_user: U } });
});
