'use strict';
// This validates a trusted readReceipt adapter's record. It neither fetches
// a record nor authenticates a client-supplied receipt. Employer readback
// remains NOT_WIRED; a captured success page is never this proof source.
function validControlledReceipt(task, proof) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || !task?.attempt) return false;
  const attempt = task.attempt;
  if (proof.source !== 'controlled_portal_readback' || proof.taskId !== task.id || proof.userId !== task.userId
    || proof.destination !== attempt.destination || proof.payloadSha256 !== attempt.payloadSha256
    || proof.resumeSha256 !== attempt.resumeSha256) return false;
  if (typeof proof.confirmationId !== 'string' || !proof.confirmationId.trim()
    || proof.confirmationId !== proof.confirmationId.trim() || proof.confirmationId.length > 200
    || /[\x00-\x1f\x7f]/.test(proof.confirmationId)) return false;
  // A record ID does not override a negative/pending destination result.
  // Legacy trusted local records omit outcome/status; explicit values must
  // affirm acceptance. New local producers include outcome: accepted.
  if (Object.hasOwn(proof, 'outcome') && proof.outcome !== 'accepted') return false;
  if (Object.hasOwn(proof, 'status') && !['accepted', 'submitted'].includes(proof.status)) return false;
  // Never discard conflicting actual-receipt evidence in favor of the
  // client's expected approval/hash headers. Do not synthesize these fields
  // for an ATS that does not expose them.
  if (Object.hasOwn(proof, 'receivedPayloadSha256') && proof.receivedPayloadSha256 !== attempt.payloadSha256) return false;
  if (Object.hasOwn(proof, 'receivedResumeSha256') && proof.receivedResumeSha256 !== attempt.resumeSha256) return false;
  if (Object.hasOwn(proof, 'receivedFileBytes') && (!Number.isSafeInteger(proof.receivedFileBytes) || proof.receivedFileBytes < 1)) return false;
  return true;
}
module.exports = { validControlledReceipt };
