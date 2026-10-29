// WO-111 (held-out lessons): the fallback routes by intent and by the shown list, never repeats the person's words, and
// enforces the limits a person states in chat. Wordings here are not the eval fixture's. No model, no network.
import { parseAlertControl } from "../../supabase/functions/_shared/career_alert_control.ts";
import { openWorld, worldTurn } from "../../evals/career/world.ts";

const need = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
async function world(name: string) {
  const fix = JSON.parse(await Deno.readTextFile("evals/career/task-context-brutal.json"));
  return await openWorld(JSON.parse(await Deno.readTextFile(`evals/career/${fix.worlds[name]}`)), {});
}
const say = async (w: any, m: string, tid = "B") => (await worldTurn(w, { brain: "router", threadId: tid, message: m, now: w.now })).reply as string;

Deno.test("general/1 a credential is refused and never echoed or asked for", async () => {
  const w = await world("stripe-analyst");
  for (const m of ["here is my login: zeke77 / Hunter2!!", "sign into my Indeed account and send the applications", "can you use my LinkedIn to auto apply for me"]) {
    const r = await say(w, m);
    need(!/zeke77|Hunter2/i.test(r), `echoed a credential: ${r}`);
    need(/never take a password|do not log in/i.test(r) && !/(what|send|give|tell).{0,20}(password|code)/i.test(r.replace(/never take a password/i, "")), r);
  }
});

Deno.test("general/2 a name nobody has shown is not repeated back or changed", async () => {
  const w = await world("stripe-analyst");
  const r = await say(w, "what about that Zorblax thing");
  need(!/zorblax|zorbla/i.test(r) && !/status/i.test(r), r);
  need((r.match(/\?/g) || []).length === 1, r);
});

Deno.test("general/3 an ordinal and 'compare' resolve against the list just shown", async () => {
  const w = await world("stripe-analyst");
  const list = await say(w, "find me jobs");
  const firms = [...list.matchAll(/ at ([A-Z][A-Za-z]+) \(/g)].map((m) => m[1]);
  need(firms.length >= 3, list);
  const third = await say(w, "tell me about the third one");
  need(third.includes(firms[2]) && !/company file|I'm Trainee/i.test(third), third);
  const cmp = await say(w, "can you weigh them against each other");
  need(firms.slice(0, 3).every((f) => cmp.includes(f)) && !/company file|The bar:/i.test(cmp), cmp);
  const named = await say(w, `what about the ${firms[1].toLowerCase()} one`);
  need(named.includes(firms[1]), named);
});

Deno.test("general/4 an ordinal with no list says so; a bare 'it' asks which", async () => {
  const w = await world("stripe-analyst");
  const a = await say(w, "go with the fourth one");
  need(/not shown you a list/i.test(a) && (a.match(/\?/g) || []).length === 1, a);
  const b = await say(w, "hmm keep that one");
  need(/not sure which/i.test(b) && (b.match(/\?/g) || []).length === 1, b);
});

Deno.test("general/5 hours: the record answers, or the absence is said and asked once", async () => {
  const w = await world("stripe-analyst");
  const r = await say(w, "which days am I free to work?");
  need(/not on your record/i.test(r) && (r.match(/\?/g) || []).length === 1, r);
  const n = await world("nurse-houston");
  const r2 = await say(n, "what hours can I work", "A");
  need(/night|weekend/i.test(r2), r2);
});

Deno.test("general/6 internships, billing and a timed pause are routed by intent", async () => {
  const w = await world("stripe-analyst");
  need(!/not sure which part/i.test(await say(w, "only internships for me please")), "internships fell to the catch-all");
  need(/not subscribed/i.test(await say(w, "end my plan")), "a cancel did not reach the billing path");
  for (const m of ["snooze everything for two weeks", "hold off on the alerts until next month", "pause it for a bit"]) need(parseAlertControl(m)?.kind === "pause", m);
  need(parseAlertControl("pause my application to Stripe") === null, "an application pause was taken as the alert");
});

Deno.test("general/7 a limit stated in chat binds the next search: hybrid, weekends, evenings", async () => {
  const w = await world("stripe-analyst");
  const ack = await say(w, "I need hybrid, I can't go in five days a week");
  need(/^Noted/.test(ack), ack);
  const r = await say(w, "find data analyst jobs in Chicago");
  need(!/onsite|Stripe \(|Brex \(|Notion \(/.test(r) || /break what you told me|left out/.test(r), r);
  const n = await world("nurse-houston");
  await say(n, "I cannot do weekends and no evening work either");
  const r2 = await say(n, "find me ICU nursing jobs");
  need(!/\(Nights\)|Night Shift/.test(r2.replace(/what you told me[^.]*\./, "")), r2);
});

Deno.test("general/8 no resume on record: no tailor offer", async () => {
  const w = await world("first-conversation");
  const r = await say(w, "find me jobs");
  need(!/tailor your resume/i.test(r) && /resume/i.test(r), r);
});
