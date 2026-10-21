"use strict";
/* resume-store.cjs — resolve the person's stored resume FILE by its sha256
   (WO-094, loop input).

   The board service vends module-150 browser boards, which upload a LOCAL
   resume file; its resolveResumePath seam defaulted to () => null, so every
   resume upload on the worker stopped. This is the resolver the operator
   wires into the board-service config.

   Where the bytes live: the person's resume record (the stored 122 master's
   `resume: {filename, sha256}`, which the batch executor already reads) names
   the file by its sha256, and the worker host keeps the files in the same
   layout as the private `career-resumes` bucket —
   <resumeDir>/<userId>/<sha256>.pdf (supabase/functions/_shared/
   career_tailor.ts resumePath). The resolver is SYNCHRONOUS because the
   board service and the drive stack under it are.

   Every failure is a NAMED stop, never a null path:
     RESUME_RECORD_MISSING  no sha256 on the request, or a userId/sha256 that
                            is not a valid path segment (no traversal);
     RESUME_FILE_MISSING    no stored file for that user and sha256;
     RESUME_SHA_MISMATCH    the stored file's bytes do not hash to the sha256
                            the record names — an altered file never uploads. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const coded = (code, message) => Object.assign(new Error(message || code), { code });
const USER_RE = /^[A-Za-z0-9-]{1,64}$/;
const SHA_RE = /^[a-f0-9]{64}$/;

function createStoredResumeResolver(opts) {
  const o = opts || {};
  if (typeof o.resumeDir !== "string" || !path.isAbsolute(o.resumeDir)) {
    throw coded("RESUME_STORE_NOT_WIRED", "createStoredResumeResolver: an absolute resumeDir (the worker's copy of the private resume store) is required");
  }
  const dir = o.resumeDir;
  return function resolveResumePath(userId, request) {
    const sha256 = request && typeof request.resumeSha256 === "string" ? request.resumeSha256 : null;
    if (typeof userId !== "string" || !USER_RE.test(userId) || !sha256 || !SHA_RE.test(sha256)) {
      throw coded("RESUME_RECORD_MISSING", "no stored resume record (sha256) for this user — a board that uploads a resume is not opened without one");
    }
    const file = path.join(dir, userId, `${sha256}.pdf`);
    let bytes;
    try { bytes = fs.readFileSync(file); } catch (e) {
      if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) throw coded("RESUME_FILE_MISSING", "the stored resume file for this record is not on the worker — the application stops here rather than uploading nothing");
      throw e;
    }
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw coded("RESUME_SHA_MISMATCH", "the stored resume file does not match its record's sha256 — an altered file is never uploaded");
    }
    return file;
  };
}

module.exports = { createStoredResumeResolver };
