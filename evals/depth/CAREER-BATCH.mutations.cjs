// Planted defects for the batch-apply loop (module 155; LOOP ACCEPTANCE build; depth protocol step 2). A patch must match exactly once.
module.exports = [
 {
  "id": "D01",
  "sub": "S01",
  "title": "Digit-count parse",
  "test": "apply to 15 investment banking intern roles",
  "defect": "the family text is read from the unit group",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "const familyText = m[2].trim();",
    "replace": "const familyText = m[3].trim();"
   }
  ]
 },
 {
  "id": "D02",
  "sub": "S02",
  "title": "Spelled counts",
  "test": "fifteen resolves to 15",
  "defect": "fifteen resolves to 14",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "fifteen: 15",
    "replace": "fifteen: 14"
   }
  ]
 },
 {
  "id": "D03",
  "sub": "S03",
  "title": "Unclaimed asks stay unclaimed",
  "test": "count-less asks return null",
  "defect": "a non-matching ask fabricates a batch",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (!m) return null;",
    "replace": "if (!m) return { count: 1, familyText: \"roles\", unit: \"roles\" };"
   }
  ]
 },
 {
  "id": "D04",
  "sub": "S04",
  "title": "New run state",
  "test": "a new run starts in the new state",
  "defect": "a new run starts already approved",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "status: \"new\", // new",
    "replace": "status: \"approved\", // new"
   }
  ]
 },
 {
  "id": "D05",
  "sub": "S05",
  "title": "Duplicates counted",
  "test": "a cross-board duplicate counts as removed",
  "defect": "duplicates are removed but never counted",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "run.duplicatesRemoved = raw.length - deduped.length;",
    "replace": "run.duplicatesRemoved = 0;"
   }
  ]
 },
 {
  "id": "D06",
  "sub": "S06",
  "title": "Closed screens out",
  "test": "a closed posting is JOB_CLOSED",
  "defect": "closed postings stay eligible",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (posting.status && posting.status !== \"open\") { out(\"JOB_CLOSED\"",
    "replace": "if (posting.status && posting.status !== \"open\" && posting.title === \"__never__\") { out(\"JOB_CLOSED\""
   }
  ]
 },
 {
  "id": "D07",
  "sub": "S07",
  "title": "Knockouts screen out",
  "test": "an unmet license knockout is KNOCKOUT_UNMET",
  "defect": "knockout results are discarded",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "const unmet = (ko && ko.unmet) || [];",
    "replace": "const unmet = [];"
   }
  ]
 },
 {
  "id": "D08",
  "sub": "S08",
  "title": "Current employer screens out",
  "test": "the user's own employer is CURRENT_EMPLOYER",
  "defect": "the current-employer block never fires",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (emp && emp.blocked) { out(\"CURRENT_EMPLOYER\"",
    "replace": "if (false) { out(\"CURRENT_EMPLOYER\""
   }
  ]
 },
 {
  "id": "D09",
  "sub": "S09",
  "title": "Count deferral",
  "test": "eligible beyond the count are COUNT_DEFERRED",
  "defect": "every eligible posting is selected regardless of count",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "const chosen = eligiblePool.slice(0, run.requested);",
    "replace": "const chosen = eligiblePool.slice(0, run.requested + 99);"
   }
  ]
 },
 {
  "id": "D10",
  "sub": "S10",
  "title": "The approval card",
  "test": "doorstep applications get a batch_approval card",
  "defect": "the batch card is never built",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (Apply && Apply.batchCard && doorstepApps.length) {",
    "replace": "if (Apply && Apply.batchCard && doorstepApps.length && false) {"
   }
  ]
 },
 {
  "id": "D11",
  "sub": "S11",
  "title": "ApprovalRef binding",
  "test": "the ref includes the card set hash",
  "defect": "the approvalRef is not bound to the card set hash",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "run.approvalRef = `batch:${run.id}:${nowSha}`;",
    "replace": "run.approvalRef = `batch:${run.id}`;"
   }
  ]
 },
 {
  "id": "D12",
  "sub": "S12",
  "title": "Changed set refused",
  "test": "a tampered payload refuses approval",
  "defect": "the card set hash is never re-checked at approval",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (!nowSha || nowSha !== run.cardSha256) {",
    "replace": "if (false) {"
   }
  ]
 },
 {
  "id": "D13",
  "sub": "S13",
  "title": "The yes is required",
  "test": "approvedByUser false mints nothing",
  "defect": "an approval without the user's yes still mints",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (!approval || approval.approvedByUser !== true) {",
    "replace": "if (!approval) {"
   }
  ]
 },
 {
  "id": "D14",
  "sub": "S14",
  "title": "Execution needs approval",
  "test": "an unapproved run submits nothing",
  "defect": "execution runs without an approval",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (run.status !== \"approved\") {",
    "replace": "if (false) {"
   }
  ]
 },
 {
  "id": "D15",
  "sub": "S15",
  "title": "Submissions land",
  "test": "an approved clean batch submits 3 with confirmations",
  "defect": "a completed submit is recorded as still at the doorstep",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "app.stage = \"submitted\";",
    "replace": "app.stage = \"doorstep\";"
   }
  ]
 },
 {
  "id": "D16",
  "sub": "S16",
  "title": "Uncovered question named",
  "test": "an uncovered required field stops as UNCOVERED_QUESTION",
  "defect": "the uncovered-question stop is renamed",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "stopApp(run, app, \"UNCOVERED_QUESTION\", \"a required question has no confirmed fact",
    "replace": "stopApp(run, app, \"COVERED_QUESTION\", \"a required question has no confirmed fact"
   }
  ]
 },
 {
  "id": "D17",
  "sub": "S17",
  "title": "Captcha is a handoff",
  "test": "a captcha at open stops as CAPTCHA_HANDOFF",
  "defect": "the captcha stop is recorded as solved",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "{ code: \"CAPTCHA_HANDOFF\", reason: res.reason || \"a captcha appeared — Upmore never solves it\"",
    "replace": "{ code: \"CAPTCHA_SOLVED\", reason: res.reason || \"a captcha appeared — Upmore never solves it\""
   }
  ]
 },
 {
  "id": "D18",
  "sub": "S18",
  "title": "Cap deferral at click",
  "test": "cap overflow defers as CAP_REACHED with a resume day",
  "defect": "click-time cap deferrals are recorded under another code",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "code: \"CAP_REACHED\", reason: out.reason || \"the daily application cap was reached at click time\"",
    "replace": "code: \"CAP_IGNORED\", reason: out.reason || \"the daily application cap was reached at click time\""
   }
  ]
 },
 {
  "id": "D19",
  "sub": "S19",
  "title": "Drive errors named",
  "test": "a throwing drive stops as EXECUTION_ERROR",
  "defect": "drive errors are recorded as EXECUTION_OK",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "stopApp(run, app, \"EXECUTION_ERROR\",",
    "replace": "stopApp(run, app, \"EXECUTION_OK\","
   }
  ]
 },
 {
  "id": "D20",
  "sub": "S20",
  "title": "Restore round-trips",
  "test": "a serialized run restores and approves",
  "defect": "restore always returns null",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "function restoreRun(json) { return json && json.id ? json : null; }",
    "replace": "function restoreRun(json) { return null; }"
   }
  ]
 },
 {
  "id": "D21",
  "sub": "S21",
  "title": "Report names submissions",
  "test": "the spoken summary names the submitted count",
  "defect": "the spoken summary omits the submissions line",
  "patches": [
   {
    "file": "155-career-batch-apply.js",
    "find": "if (sm.submitted) lines.push(",
    "replace": "if (!sm.submitted) lines.push("
   }
  ]
 }
];
