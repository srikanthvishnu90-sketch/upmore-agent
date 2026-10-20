// Planted defects for career writing (module 154; MI-097 / BUG-236 / FR-394; depth protocol step 2). A patch must match exactly once.
module.exports = [
 {
  "id": "D01",
  "sub": "S01",
  "title": "MATS is owner-write-only",
  "test": "MATS refused, assistance offered",
  "defect": "the MATS registry entry allows AI drafting",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "      policy: \"OWNER_WRITE_ONLY\",",
    "replace": "      policy: \"AI_OK\","
   }
  ]
 },
 {
  "id": "D02",
  "sub": "S02",
  "title": "Context ban wins",
  "test": "a context-recorded ban refuses outreach",
  "defect": "the explicit context ban is not read",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (c.aiPolicy === \"ban\" || c.aiPolicy === \"OWNER_WRITE_ONLY\" || c.bansAiWrittenText) {",
    "replace": "if (c.aiPolicy === \"OWNER_WRITE_ONLY\" || c.bansAiWrittenText) {"
   }
  ]
 },
 {
  "id": "D03",
  "sub": "S03",
  "title": "UNKNOWN defaults closed",
  "test": "an unchecked statement kind is UNKNOWN",
  "defect": "personal statements default to AI_OK",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "    personal_statement: \"UNKNOWN\",",
    "replace": "    personal_statement: \"AI_OK\","
   }
  ]
 },
 {
  "id": "D04",
  "sub": "S04",
  "title": "Disclosure flag carried",
  "test": "a disclose-policy verdict carries disclosureRequired",
  "defect": "the disclosure flag is dropped from the verdict",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "disclosureRequired: r.policy === \"AI_ASSIST_WITH_DISCLOSURE\",",
    "replace": "disclosureRequired: false,"
   }
  ]
 },
 {
  "id": "D05",
  "sub": "S05",
  "title": "Cold start is null",
  "test": "no samples means no profile",
  "defect": "an empty sample list synthesizes a profile",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "    if (!list.length) return null;",
    "replace": "    if (!list.length) return { kind: \"voice_profile\", version: 1 };"
   }
  ]
 },
 {
  "id": "D06",
  "sub": "S06",
  "title": "Too thin is null",
  "test": "two sentences are too thin for a profile",
  "defect": "a single sentence is enough for a profile",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (stats.sentenceCount < 3) return null;",
    "replace": "if (stats.sentenceCount < 1) return null;"
   }
  ]
 },
 {
  "id": "D07",
  "sub": "S07",
  "title": "Short share measured",
  "test": "bursty samples show a short-sentence share",
  "defect": "sentences of six words or fewer are never counted short",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "(n) => n <= 6",
    "replace": "(n) => n <= 0"
   }
  ]
 },
 {
  "id": "D08",
  "sub": "S08",
  "title": "Per-audience profiles",
  "test": "two audiences produce two sub-profiles",
  "defect": "per-audience sub-profiles are never built",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (audKeys.length >= 2) {",
    "replace": "if (audKeys.length >= 99) {"
   }
  ]
 },
 {
  "id": "D09",
  "sub": "S09",
  "title": "Assigned opening honored",
  "test": "an assigned opening mode is the seed's mode",
  "defect": "the assigned opening mode is ignored",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (o.openingMode && OPENING_CONSTRUCTIONS.includes(o.openingMode)) openingMode = o.openingMode;",
    "replace": "if (false && OPENING_CONSTRUCTIONS.includes(o.openingMode)) openingMode = o.openingMode;"
   }
  ]
 },
 {
  "id": "D10",
  "sub": "S10",
  "title": "Prompt carries the voice",
  "test": "the rendered prompt contains the voice targets",
  "defect": "the voice block is rendered empty",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": ".replace(\"{{voice_numbers}}\", voiceTargetsText(profile))",
    "replace": ".replace(\"{{voice_numbers}}\", \"\")"
   }
  ]
 },
 {
  "id": "D11",
  "sub": "S11",
  "title": "Numbers trace",
  "test": "a faithful draft's numbers all trace",
  "defect": "the fact corpus's numbers are never collected",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "corpusNums.add(m[0].replace(/,/g, \"\"))",
    "replace": "corpusNums.add(\"never-in-text\")"
   }
  ]
 },
 {
  "id": "D12",
  "sub": "S12",
  "title": "Fact-lock hard-fails invention",
  "test": "an invented $40 million is named untraced",
  "defect": "the tracer reports every span traced",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "return { pass: untraced.length === 0, traced, total: checkables.length, untraced };",
    "replace": "return { pass: true, traced, total: checkables.length, untraced: [] };"
   }
  ]
 },
 {
  "id": "D13",
  "sub": "S13",
  "title": "Substance floor",
  "test": "a 3-word text is below the draft minimum",
  "defect": "the substance floor is two words",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "pass: n >= 25, detail: n >= 25",
    "replace": "pass: n >= 2, detail: n >= 25"
   }
  ]
 },
 {
  "id": "D14",
  "sub": "S14",
  "title": "Hard-banned opener",
  "test": "'i hope this email finds you well' is a hard hit",
  "defect": "the finds-you-well opener is not on the hard list",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "\"i hope this email finds you well\", \"hope this email finds you well\",",
    "replace": "\"zzz phrase that never appears zzz\", \"hope this email finds you well\","
   }
  ]
 },
 {
  "id": "D15",
  "sub": "S15",
  "title": "Two markers fail",
  "test": "delve + tapestry together fail the metric",
  "defect": "any number of marker words passes the metric",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "const pass = b.hard.length === 0 && b.markers.length < 2;",
    "replace": "const pass = b.hard.length === 0 && b.markers.length < 99;"
   }
  ]
 },
 {
  "id": "D16",
  "sub": "S16",
  "title": "Uniform run fails",
  "test": "six same-length sentences show a run of 6",
  "defect": "a uniform run of any length passes",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "const runPass = maxRun < 5;",
    "replace": "const runPass = maxRun < 99;"
   }
  ]
 },
 {
  "id": "D17",
  "sub": "S17",
  "title": "Profile-relative CV bar",
  "test": "a flat draft fails against a CV-1.0 profile",
  "defect": "the CV bar is a tenth of the profile's own CV",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "const cvPass = !cvApplies || cv >= target * 0.6;",
    "replace": "const cvPass = !cvApplies || cv >= target * 0.06;"
   }
  ]
 },
 {
  "id": "D18",
  "sub": "S18",
  "title": "Tricolons are tells",
  "test": "two tricolon sentences fail tells",
  "defect": "tricolons are never counted as tells",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (tricolons >= 2) tells.push(",
    "replace": "if (tricolons >= 99) tells.push("
   }
  ]
 },
 {
  "id": "D19",
  "sub": "S19",
  "title": "Anchor density",
  "test": "an unanchored long paragraph is named",
  "defect": "unanchored paragraphs are never collected",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (anchorSpans(p, factPack, o) === 0) thin.push(i + 1);",
    "replace": "if (false) thin.push(i + 1);"
   }
  ]
 },
 {
  "id": "D20",
  "sub": "S20",
  "title": "Still-failing is flagged",
  "test": "an unfixable draft returns flagged with metrics",
  "defect": "a still-failing draft returns unflagged",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "return { text, scorecard: card, attempts, flagged: true, pass: false,",
    "replace": "return { text, scorecard: card, attempts, flagged: false, pass: false,"
   }
  ]
 },
 {
  "id": "D21",
  "sub": "S21",
  "title": "Instruction from scorecard",
  "test": "the second generation receives the scorecard's instruction",
  "defect": "the rewrite loop passes an empty instruction",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "instruction = rewriteInstruction(card);",
    "replace": "instruction = \"\";"
   }
  ]
 },
 {
  "id": "D22",
  "sub": "S22",
  "title": "HS-1 verbatim reuse",
  "test": "a sentence in 4 of 4 drafts fails reuse",
  "defect": "verbatim reuse is tolerated at any share",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "filter(([, c]) => pctOf(c / Math.max(1, n), 0.25)).map(([s, c])",
    "replace": "filter(([, c]) => pctOf(c / Math.max(1, n), 1.5)).map(([s, c])"
   }
  ]
 },
 {
  "id": "D23",
  "sub": "S23",
  "title": "HS-3 same-firm subject dup",
  "test": "an identical subject at one firm is flagged",
  "defect": "same-firm subject duplicates are never detected",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (seenFirmSubject.has(key)) dupFirm = true;",
    "replace": "if (false) dupFirm = true;"
   }
  ]
 },
 {
  "id": "D24",
  "sub": "S24",
  "title": "HS-4 length spread",
  "test": "eight equal-length drafts fail at ratio 1",
  "defect": "a length ratio of 1 passes the spread check",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "const pass = !applies || ratio >= 1.5;",
    "replace": "const pass = !applies || ratio >= 0.5;"
   }
  ]
 },
 {
  "id": "D25",
  "sub": "S25",
  "title": "HS-6 logistics repetition",
  "test": "one logistics string in 4 of 4 drafts fails",
  "defect": "logistics repetition is tolerated at any share",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "const pass = !pctOf(share, 0.5);\n      metrics.logistics_repetition",
    "replace": "const pass = !pctOf(share, 1.5);\n      metrics.logistics_repetition"
   }
  ]
 },
 {
  "id": "D26",
  "sub": "S26",
  "title": "Edit capture counts",
  "test": "one captured edit makes basis.edits 1",
  "defect": "captured edits are never counted",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "edits: ((profile.basis && profile.basis.edits) || 0) + 1",
    "replace": "edits: ((profile.basis && profile.basis.edits) || 0) + 0"
   }
  ]
 },
 {
  "id": "D27",
  "sub": "S27",
  "title": "Generator ships the ask",
  "test": "a composed draft contains the logistics ask",
  "defect": "the composed draft never appends its ask",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "    body.push(ask);",
    "replace": "    // body.push(ask);"
   }
  ]
 },
 {
  "id": "D28",
  "sub": "S28",
  "title": "Opener classes",
  "test": "a question opener classifies as question",
  "defect": "question openers are never classified as questions",
  "patches": [
   {
    "file": "154-career-writing.js",
    "find": "if (/\\?$/.test(s)) return \"question\";",
    "replace": "if (false) return \"question\";"
   }
  ]
 }
];
