// Planted defects for merchant labels (overnight G3; depth protocol step 2). A patch must match exactly once.
const F = "32-merchant-label.js";
module.exports = [
  { id: "D01", sub: "S01", title: "Ordinary descriptors pass", test: "VISITING NURSE SERVICE stays whole", defect: "the instruction words lose their closing word boundary, so 'VISITING' cuts", patches: [{ file: F, find: "|you have been)\\b/i;", replace: "|you have been)/i;" }] },
  { id: "D02", sub: "S02", title: "http links removed", test: "an https link is gone", defect: "only www links are removed", patches: [{ file: F, find: ".replace(/\\bhttps?:\\/\\/\\S+|\\bwww\\.\\S+/gi, \" \")", replace: ".replace(/\\bwww\\.\\S+/gi, \" \")" }] },
  { id: "D03", sub: "S03", title: "www links removed", test: "a bare www link is gone", defect: "only http links are removed", patches: [{ file: F, find: ".replace(/\\bhttps?:\\/\\/\\S+|\\bwww\\.\\S+/gi, \" \")", replace: ".replace(/\\bhttps?:\\/\\/\\S+/gi, \" \")" }] },
  { id: "D04", sub: "S04", title: "Emails removed", test: "an email address is gone", defect: "emails are kept", patches: [{ file: F, find: ".replace(/\\S+@\\S+\\.\\S+/g, \" \")", replace: "" }] },
  { id: "D05", sub: "S05", title: "Handles removed", test: "@eve-money is gone, hyphen included", defect: "a handle stops at the first hyphen (the bug found building this packet)", patches: [{ file: F, find: ".replace(/(^|\\s)@[\\w.-]+/g, \" \")", replace: ".replace(/(^|\\s)@\\w+/g, \" \")" }] },
  { id: "D06", sub: "S06", title: "Markup removed", test: "no angle brackets survive", defect: "tags are kept", patches: [{ file: F, find: ".replace(/<[^>]*>/g, \" \")", replace: "" }] },
  { id: "D07", sub: "S07", title: "Role prefixes cut", test: "SYSTEM: cuts the text", defect: "role prefixes are not instructions", patches: [{ file: F, find: "/\\b(?:system|assistant|user|developer)\\s*:|\\b(?:ignore", replace: "/\\b(?:ignore" }] },
  { id: "D08", sub: "S08", title: "Ignore and disregard cut", test: "IGNORE PREVIOUS INSTRUCTIONS cuts", defect: "ignore and disregard are not listed", patches: [{ file: F, find: "(?:ignore|disregard|reply", replace: "(?:reply" }] },
  { id: "D09", sub: "S09", title: "Reply cuts", test: "reply with ... cuts at reply", defect: "reply is not listed", patches: [{ file: F, find: "|reply|visit", replace: "|visit" }] },
  { id: "D10", sub: "S10", title: "Visit and click cut", test: "click here to claim cuts", defect: "visit and click are not listed", patches: [{ file: F, find: "|visit|click|", replace: "|" }] },
  { id: "D11", sub: "S11", title: "A planted outcome cuts", test: "you have been refunded cuts", defect: "'you have been' is not listed", patches: [{ file: F, find: "|you have been)", replace: ")" }] },
  { id: "D12", sub: "S12", title: "Send $ cuts", test: "send $500 cuts", defect: "'send $' is not listed", patches: [{ file: F, find: "|send \\$|", replace: "|" }] },
  { id: "D13", sub: "S13", title: "Codes and passcodes cut", test: "one-time code and passcode cut", defect: "codes are not listed", patches: [{ file: F, find: "|passcode|ssn|social security|one[- ]time code|", replace: "|ssn|social security|" }] },
  { id: "D14", sub: "S14", title: "The 40-character cap", test: "a long name is capped on a word boundary", defect: "the cap is 400", patches: [{ file: F, find: "if (s.length > 40)", replace: "if (s.length > 400)" }] },
  { id: "D15", sub: "S15", title: "Only an instruction is Unknown merchant", test: "an instruction-only descriptor is 'Unknown merchant'", defect: "the raw text is shown when nothing is left", patches: [{ file: F, find: "return s || \"Unknown merchant\";", replace: "return s || String(raw || \"\") || \"Unknown merchant\";" }] },
];
