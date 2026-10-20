// Prints the WO-031 test persona as JSON: the complete synthetic TEST persona of evals/apply/fill-coverage.ts (one
// source, not a copy), minus eeo (this persona gave no voluntary self-identification) and resume (the extension attaches
// the file itself). Read by tests/career-extension-browser.test.cjs.
import { PERSONA } from "../../../evals/apply/fill-coverage.ts";

const out: Record<string, string> = {};
for (const [k, v] of Object.entries(PERSONA)) if (k !== "eeo" && k !== "resume") out[k] = v.value;
console.log(JSON.stringify(out));
