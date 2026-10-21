"use strict";
/* resume-upload.cjs — how each ATS takes the resume, and how a board finds the resume's own upload again
   (docs/apply/RESUME-UPLOAD.md).

   The board's file fill (portal-browser-helper.cjs cmdFill) had no per-ATS description of the resume upload. It
   treated "a file input holding the file" as the only proof of an attach, and when the bound input was no longer
   there it re-found "the first input[type=file] on the page". Live, Greenhouse takes the input out of the form once
   a file is attached (it uploads the file at once and shows its name), so a resume the employer had already taken
   read as file_input_not_mounted (BUG-237: 18 of 24 boards), or was attached again into the next upload left on the
   page (a cover letter, another question). On Ashby the first file input is always "Autofill from resume".

   What each family does when a file is attached, as recorded live (evals/apply/results/live-fill.json, WO-042 live
   run, every write aborted, VERIFIED-LIVE): every one of them sends the file to the employer BEFORE Submit. */
const RESUME_UPLOADS = {
  greenhouse: {
    // 5 of 5 forms: a POST to Greenhouse's S3 bucket the moment the file is attached; the input is then gone (5 of 5).
    uploadsBeforeSubmit: { method: "POST", host: "grnhse-prod-jben-us-west-2.s3.us-west-2.amazonaws.com", path: "/", observed: "5/5" },
    afterAttach: "the file input leaves its upload group, which shows the file's name",
  },
  lever: {
    // 6 of 6 forms: a POST to the employer's own /parseResume; the page fills its hidden resumeStorageId.
    uploadsBeforeSubmit: { method: "POST", host: "jobs.lever.co", path: "/parseResume", observed: "6/6" },
    afterAttach: "the input keeps the file; hidden resumeStorageId is set from the answer",
  },
  ashby: {
    // 6 of 6 forms: the GraphQL mutation ApiCreateFileUploadHandle on the employer's own origin (the file's storage
    // upload that follows it was never reached: the mutation itself was aborted).
    uploadsBeforeSubmit: { method: "POST", host: "jobs.ashbyhq.com", path: "/api/non-user-graphql", operation: "ApiCreateFileUploadHandle", observed: "6/6" },
    afterAttach: "the input keeps the file",
  },
};
// File inputs that are never the resume question, whatever their label says: Ashby's "Autofill from resume" parser
// (the first file input on every captured Ashby form; it reads the file and writes answers into the form).
const NEVER_THE_RESUME = [".ashby-application-form-autofill-input-root"];

/* In-page (serialized by Playwright; self-contained). The resume input's place on the form, read while the bound input
   is still there: its upload group (Greenhouse: role=group aria-labelledby="upload-label-resume"), id, name and the
   text of its own label. */
function fnFileSlot(arg) {
  const el = document.querySelector(arg.selector);
  if (!el || el.type !== "file") return null;
  if (arg.never.some((s) => el.closest(s))) return null;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  let group = el.closest('[role="group"][aria-labelledby]');
  if (group && group.querySelectorAll('input[type="file"]').length !== 1) group = null; // an upload group is one upload's
  const label = clean(el.labels && el.labels[0] ? el.labels[0].textContent : "");
  return { group: group ? group.getAttribute("aria-labelledby") : null, id: el.id || null, name: el.getAttribute("name") || null,
    label: /^(attach|upload|browse|choose( a)? file|select( a)? file|add file)?$/i.test(label) ? null : label };
}
/* In-page. The one file input now in the resume's place, marked and returned as a selector; null when there is none
   or more than one. Never Ashby's autofill parser, never another question's upload. With no place known (a binding
   read before this module), only a page with exactly one such input answers. */
function fnFindSlotInput(arg) {
  const slot = arg.slot;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const all = Array.from(document.querySelectorAll('input[type="file"]')).filter((el) => !arg.never.some((s) => el.closest(s)));
  const inGroup = (el) => { const g = el.closest('[role="group"][aria-labelledby]'); return g ? g.getAttribute("aria-labelledby") : null; };
  const labelOf = (el) => clean(el.labels && el.labels[0] ? el.labels[0].textContent : "");
  const hits = !slot ? all : all.filter((el) => slot.group ? inGroup(el) === slot.group
    : (slot.id && el.id === slot.id) || (slot.name && el.getAttribute("name") === slot.name) || (slot.label && labelOf(el) === slot.label));
  if (hits.length !== 1) return null;
  const el = hits[0];
  if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id);
  document.querySelectorAll("[data-upmore-file]").forEach((x) => x.removeAttribute("data-upmore-file"));
  el.setAttribute("data-upmore-file", "1");
  return '[data-upmore-file="1"]';
}
/* In-page. The employer took the file: the resume's upload group holds no file input any more and shows this file's
   name (Greenhouse, live). Only for a slot with a group; a form without one never reads as taken. */
function fnSlotTookFile(arg) {
  const slot = arg.slot;
  if (!slot || !slot.group) return false;
  const g = document.querySelector('[role="group"][aria-labelledby="' + CSS.escape(slot.group) + '"]');
  if (!g || g.querySelector('input[type="file"]')) return false;
  return String(g.textContent || "").includes(arg.filename);
}
/* In-page. The attach control inside the resume's own upload group (Greenhouse's "Attach"), marked; else none. */
function fnMarkSlotAttach(arg) {
  const slot = arg.slot;
  if (!slot || !slot.group) return false;
  const g = document.querySelector('[role="group"][aria-labelledby="' + CSS.escape(slot.group) + '"]');
  if (!g) return false;
  const b = Array.from(g.querySelectorAll('button, label, [role="button"]'))
    .find((el) => /attach|upload|browse|choose file/i.test((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")));
  if (!b) return false;
  b.setAttribute("data-upmore-attach", "1");
  return true;
}

module.exports = { RESUME_UPLOADS, NEVER_THE_RESUME, fnFileSlot, fnFindSlotInput, fnSlotTookFile, fnMarkSlotAttach };
