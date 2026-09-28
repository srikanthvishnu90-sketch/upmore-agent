import { tryFastPath } from "./index.ts";
const fresh = new Date().toISOString();
const R = (route_id: string, provider: string, name: string, category: string) => ({
  route_id, provider, name, category, status: "researched", verified_at: fresh,
  steps: [{ text: "step1" }], payout_text: "$X", payout_timing: "soon", catches: ["c1"],
  min_age: 18, geo_notes: "US", provider_url: "https://example.com",
});
const routes = [
  R("R5552", "Five Star Credit Union", "Five Star Credit Union checking bonus", "bank bonus"),
  R("R1001", "Ally", "Ally Savings Bonus", "bank bonus"),
  R("R1002", "Chase", "Chase Total Checking", "bank bonus"),
  R("R1003", "AttaPoll", "AttaPoll paid surveys", "surveys"),
  R("R1004", "Appen", "Appen microtasks", "gig"),
  R("R1005", "Affinity Federal Credit Union", "Affinity checking bonus", "bank bonus"),
  R("R1006", "Alliant Credit Union", "Alliant savings bonus", "bank bonus"),
  R("R1007", "First National Bank", "First checking bonus", "bank bonus"),
  R("R1008", "FirstBank", "FirstBank savings bonus", "bank bonus"),
  R("R1009", "America First Credit Union", "America First checking", "bank bonus"),
  R("R1010", "First Tech Federal Credit Union", "First Tech bonus", "bank bonus"),
];
const cases: Array<[string, boolean, string]> = [
  ["Say hello in five words", false, "greeting must not route"],
  ["My credit score dropped — find out why", false, "finance Q must not get bank bonus"],
  ["Which debt do I pay off first", false, "first != FirstBank"],
  ["What tax credits am I leaving on the table", false, "credit != credit union"],
  ["Which credit card should I actually get", false, "actually != Ally"],
  ["Cancel everything I'm not actually using", false, "actually != Ally"],
  ["Where is all my money actually going", false, "actually != Ally"],
  ["I need $300 by Friday — make it happen", false, "happen != Appen"],
  ["Track my progress toward the signup bonus I started", false, "started != star"],
  ["My Spotify bill went up — find out why and fix it", false, "bill Q, not Spotify route"],
  ["Get my internet bill lowered", false, "lowered != lowe"],
  ["Should I open an HSA this year", false, "finance Q"],
  ["How many months could I survive with no income", false, "guard: income"],
  ["Walk me through that bank account bonus start to finish", false, "ambiguous, needs model"],
  ["tell me about Chase checking", true, "legit 2-word mention"],
  ["is the Chase Total Checking bonus still available", true, "legit full mention"],
  ["how does Five Star Credit Union work", true, "legit full mention"],
  ["AttaPoll payout", true, "provider+name word = 2 hits"],
];
let fails = 0;
for (const [prompt, expect, why] of cases) {
  let got: string | null = null, err = "";
  try { got = (tryFastPath as any)(prompt, routes); }
  catch (e: any) { err = "THREW: " + e.message; }
  const matched = got !== null;
  const ok = !err && matched === expect;
  if (!ok) fails++;
  console.log(ok ? "PASS" : "FAIL", "|", prompt, "|", err || (matched ? "MATCHED->" + String(got).slice(0, 70).replace(/\n/g, " ") : "null"), "|", why);
}
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
