// Probes for the source guard (PR #277 review): spelled-out numbers, lowercase names, numbers matched to the wrong subject.
//   deno test -A --no-check tests/architect/career-research-guard.test.ts
import assertNode from "node:assert/strict";
import { acceptFacts, unsourcedIn, unsupported } from "../../supabase/functions/_shared/agent/research/guard.ts";
import { lintChat } from "../../supabase/functions/_shared/agent/research/chat.ts";

const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const URL_ = "https://a.example/x";
const accepts = (text: string, quote: string) => acceptFacts([{ id: "", kind: "pay", text, quote, url: URL_, label: "a.example" }], [URL_]).kept.length === 1;
const flagged = (line: string, support: string[] = [], person: string[] = [], message = "") =>
  unsourcedIn(line, { facts: support.map((s) => ({ id: "", kind: "pay" as const, text: s, quote: s, url: URL_, label: "a.example" })), person, message });

// [text, quote, accepted?]
const FACTS: [string, string, boolean][] = [
  ["Median pay is seventy thousand dollars.", "Nurses work long shifts and many enjoy the work.", false],
  ["Median pay is seventy thousand dollars.", "The median annual pay for nurses is $70,000 in the most recent year.", true],
  ["Median pay is $70k.", "The median annual pay is seventy thousand dollars.", true],
  ["Ninety percent of graduates are hired within a year of finishing.", "Placement data: 90% of graduates are hired within a year of finishing.", true],
  ["Employment of nurses will grow 9 percent over the decade.", "Employment of nurses is projected to grow nine percent over the decade.", true],
  ["Employment of nurses will grow 6 percent over the decade.", "Pay was $86,070, and 6 percent of nurses work night shifts only.", false],
  ["Pay ranges from 50 to 60 thousand dollars.", "Typical pay ranges from $50,000 to $60,000 a year.", true],
  ["Half of hires come through referrals.", "About half of hires come through employee referrals.", true],
  ["Half of hires come through referrals.", "Hires come through postings and referrals.", false],
  ["amazon hires many new graduates every year.", "Large employers hire new graduates every year.", false],
  ["Amazon hires many new graduates every year.", "Large employers hire new graduates every year.", false],
  ["Candidates go through a fourth round of interviews.", "Candidates go through three rounds of interviews.", false],
  ["The field has 1.2 million jobs.", "The field has 1,200,000 jobs across the country.", true],
  ["Twenty-five percent of apprentices finish early.", "25 percent of apprentices finish early, the report says.", true],
  ["Twenty-five percent of apprentices finish early.", "52 percent of apprentices finish early, the report says.", false],
  ["Nearly one in three applicants receive an offer.", "Applicants receive offers at a rate of one in four.", false],
  ["Wages grew by $3 an hour.", "Wages grew by $3 an hour in the last survey.", true],
  ["Programs last two years and cost forty thousand dollars.", "Programs last two years.", false],
];
for (const [i, [text, quote, want]] of FACTS.entries()) Deno.test(`fact probe ${i + 1}: ${want ? "accepts" : "rejects"} "${text.slice(0, 48)}"`, () => { ok(accepts(text, quote) === want); });

// [line, support passages, person facts, message, flagged?]
const LINES: [string, string[], string[], string, boolean][] = [
  ["Ninety percent of applicants are rejected by amazon.", [], [], "", true],
  ["Only seven percent of graduates get offers.", [], [], "", true],
  ["About half of interns convert to full-time.", [], [], "", true],
  ["Interns at goldman earn more than interns elsewhere.", [], [], "", true],
  ["You could join palantir after two years.", [], [], "", true],
  ["Plan to spend five years in the role before you move up.", [], [], "", true],
  ["Hundreds of applicants compete for each seat.", [], [], "", true],
  ["Pay is 6 percent higher in cities.", ["Employment of nurses is projected to grow 6 percent over the decade."], [], "", true],
  ["Ask for one conversation and a second name if it went well.", [], [], "", false],
  ["Build two or three samples and keep them short.", [], [], "", false],
  ["The median annual wage for nurses was $86,070.", ["The median annual wage for nurses was $86,070 in the most recent year."], [], "", false],
  ["You said it has been three months since the bootcamp.", [], [], "I finished a bootcamp three months ago", false],
  ["Your time at palantir is the strongest thing you have.", [], ["Intern at palantir last summer"], "", false],
  ["Employment is projected to grow nine percent over the decade.", ["Employment of financial analysts is projected to grow 9 percent over the decade."], [], "", false],
  ["Amazon is the first firm on your list.", [], [], "", true],
];
for (const [i, [line, support, person, message, want]] of LINES.entries()) Deno.test(`line probe ${i + 1}: ${want ? "flags" : "passes"} "${line.slice(0, 48)}"`, () => { ok((flagged(line, support, person, message).length > 0) === want, JSON.stringify(flagged(line, support, person, message))); });

Deno.test("chat probes: the reviewer's example paragraph and friends fail the lint; a clean one passes", () => {
  const o = { link: "https://f.example/x", facts: [], person: [], message: "how do I get hired as an investment banker" };
  const para = (s: string) => `${s} https://f.example/x`;
  const bad = [
    "Right now ninety percent of freshmen are turned away by amazon, so build a base. Later, small firms are realistic.",
    "Right now the odds are one in ten, so build a base this year. Later, boutique firms are realistic.",
    "Right now goldman will not take a freshman, so build a base this year. Later, boutique firms are realistic.",
    "Right now plan on about seventy thousand dollars at a boutique, so build a base. Later, bigger firms follow.",
  ];
  for (const b of bad) ok(lintChat(para(b), o).some((x) => /no source/.test(x)), b);
  ok(lintChat(para("Right now a summer analyst seat at the largest banks is unlikely, so build a base this year with coursework and a finance club. Later, boutique and middle-market banks are the realistic first rungs, and a first internship there opens larger doors."), o).length === 0);
  ok(unsupported("Pay is eighty thousand dollars.", ["Pay is $80,000."]).length === 0);
});
