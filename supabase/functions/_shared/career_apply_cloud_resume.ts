// Resume → cloud attach (FEATURE 17 follow-up, the #202 gap): the hosted path attaches the person's resume FILE
// from career_apply_cloud_resumes, and career_apply_cloud_resume_put_for's own header names its callers — "the
// hosted preparation, or a channel's confirmed file upload", put by the service for the person. Until this module,
// no production code called it: a resume confirmed in chat (or sent as a channel file) was never kept for the
// cloud, so a hosted preparation could only say the card's resume was missing. This is the service-side keep the
// confirm seam calls with the confirmed file: the exact bytes, stored by their own sha256, and verified on
// read-back before anything may say the file is kept. A paste-only confirm has no file: nothing is put, and the
// line says so plainly. A store that disagrees about the hash is a typed stop (CloudResumeMismatch), never a
// claimed keep. This module holds no approve, claim or send call.

export interface CloudResumeStore {
  // career_apply_cloud_resume_put_for, as the service: stores the file by its hash, returns the sha256.
  put(userId: string, filename: string, b64: string): Promise<string>;
  // career_apply_cloud_resume_kept_for, as the service: the currently kept resume for the account, or null.
  kept(userId: string): Promise<{ filename?: unknown; sha256?: unknown } | null>;
}

export class CloudResumeMismatch extends Error {
  constructor(message: string) { super(message); this.name = "CloudResumeMismatch"; }
}

export const NO_FILE_KEPT_LINE =
  "No resume file is kept for the cloud: a pasted resume has no file to attach to a hosted application. Send the file itself and confirm it here, and it is kept exactly as sent.";

export type CloudResumeAttach =
  | { kept: true; sha256: string; filename: string; line: string }
  | { kept: false; line: string };

const b64Of = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const h = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// The confirm seam's keep: file is the confirmed upload (its name and its exact bytes), or null when the person
// confirmed pasted text only. Throws CloudResumeMismatch when what the store kept is not the file confirmed.
export async function keepConfirmedResumeForCloud(
  store: CloudResumeStore,
  o: { userId: string; file: { filename: string; bytes: Uint8Array } | null },
): Promise<CloudResumeAttach> {
  if (!o.file || o.file.bytes.length === 0) return { kept: false, line: NO_FILE_KEPT_LINE };
  const sha = await sha256Hex(o.file.bytes);
  const returned = await store.put(o.userId, o.file.filename, b64Of(o.file.bytes));
  if (returned !== sha) {
    throw new CloudResumeMismatch(`the cloud kept a different resume than the file confirmed (store returned ${String(returned)}, the file hashes to ${sha})`);
  }
  const kept = await store.kept(o.userId);
  if (!kept || kept.sha256 !== sha) {
    throw new CloudResumeMismatch("the kept resume could not be read back by the confirmed file's hash; nothing is claimed kept");
  }
  return { kept: true, sha256: sha, filename: o.file.filename, line: "Your resume file is kept for the cloud, exactly as you sent it." };
}

// The store over the service (admin) client: the two cloud-resume functions only.
// deno-lint-ignore no-explicit-any
export function supabaseCloudResumeStore(admin: any): CloudResumeStore {
  // deno-lint-ignore no-explicit-any
  const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data as T;
  };
  return {
    async put(userId, filename, b64) {
      return must<string>(await admin.rpc("career_apply_cloud_resume_put_for", { p_user: userId, p_filename: filename, p_b64: b64 }), "keep the resume for the cloud");
    },
    async kept(userId) {
      return must<{ filename?: unknown; sha256?: unknown } | null>(await admin.rpc("career_apply_cloud_resume_kept_for", { p_user: userId }), "read the kept resume") ?? null;
    },
  };
}
