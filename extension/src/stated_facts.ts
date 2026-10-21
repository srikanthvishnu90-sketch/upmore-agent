// FRS: facts the person states about themselves in one block of text (pasted in the panel, or texted) become facts the
// WO-102 answer contract keeps (apply_core.ts trustedManifest). Pure and deterministic: no model, no DOM, no chrome.*.
//
// The interface (Codex's richer panel import UI builds on these three; the background's "import-text" and
// "confirm-stated" steps are the only callers today):
//   parseStatedFacts(text, { source, now }) -> { facts: StatedDraft[], leftover: string[] }
//     Each draft: { field, label, value, span }. `field` is the manifest key the planner reads (full_name, email, school,
//     ...); `span` is the exact substring of `text` it came from. Nothing is inferred: no graduation month from a year
//     range, no sponsorship answer from work authorization, no degree level from a program's name. Every piece of the
//     text not read with confidence is returned in `leftover`, to be shown back to the person, never dropped or guessed.
//     A field stated twice with different values goes to leftover (asked, not picked).
//   confirmStatedFacts({ owner, drafts, keep, source, now, eventId }) -> Record<field, StatedFact>
//     Called only on the person's own confirm tap, with the event id minted for that tap. Stamps each kept draft
//     (indexes in `keep`) confirmed, the owner's, provenance "owner stated (<source>, <YYYY-MM-DD>)", the event, and a
//     fact id "stated:<event>:<field>". No event id, no confirmed fact (throws).
//   withStatedFacts(file, owner, confirmed) -> the confirmed-facts file the manifest is built from, with these facts in
//     its `answers` (a newer stated fact replaces an older one under the same key).
export interface StatedDraft { field: string; label: string; value: string; span: string }
export interface StatedFact {
  value: string; factId: string; confirmed: true; user_id: string; provenance: string; confirmation_event_id: string; span: string; label: string;
}

const LABELS: Record<string, string> = {
  full_name: "Full name", first_name: "First name", last_name: "Last name", location: "Location", city: "City", state: "State",
  phone: "Phone", email: "Email", linkedin: "LinkedIn", github: "GitHub", school: "School", education_level: "Degree (as you wrote it)",
  major: "Program / major", education_start: "Education start year", graduation_date: "Education end year", gpa: "GPA",
  test_scores: "Test scores", current_title: "Current title", current_employer: "Current employer", work_history: "Experience",
  skills: "Skills", work_authorization: "Authorized to work",
};
const STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK " +
  "OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR").split(" "));
const DEGREE = /^(B\.?S\.?c?|B\.?A|B\.?Eng|BBA|BFA|B\.?Tech|M\.?S\.?c?|M\.?A|M\.?Eng|MBA|M\.?Tech|Ph\.?D|A\.?S|A\.?A|J\.?D)\.?$/;
const SCHOOL_WORD = /^(University|College|Institute|School|Academy|Polytechnic|U)$/;
const SCHOOL_NAME = /^([A-Z][\w&'.-]*\s+)*(University|College|Institute|School|Academy|Polytechnic|U)(\s+of(\s+[A-Z][\w&'.-]*)+)?$/;
const ROLE = /^(Co-?founder|Founder|Owner|Intern|Engineer|Developer|Manager|Analyst|President|Vice-President|Director|Researcher|Assistant|Associate|Lead|Consultant|Designer|Scientist|Officer|CEO|CTO|COO|CFO|Teacher|Tutor|Volunteer|Coordinator|Specialist|Representative|Fellow|Treasurer|Secretary|TA)$/i;
const SKILLS = new Set(("python sql java javascript typescript c c++ c# go golang rust r matlab excel react node node.js html css aws gcp azure docker " +
  "kubernetes tableau pandas numpy pytorch tensorflow git linux swift kotlin ruby php scala spark figma sas stata bash").split(" "));
const RANGE = /^(.*?)[\s,]*\(?\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)\)?$/i;
const NAME = /^[A-Z][a-zA-Z'’-]+(?: [A-Z][a-zA-Z'’-]+){1,3}$/;
const SINGLE = new Set(Object.keys(LABELS).filter((k) => k !== "work_history"));

interface Part { text: string; at: number }
const draft = (field: string, value: string, span: string): StatedDraft => ({ field, label: LABELS[field] ?? field, value, span });

export function parseStatedFacts(text: string, _o: { source: string; now: number }): { facts: StatedDraft[]; leftover: string[] } {
  const src = String(text ?? "");
  // Pieces between newlines, commas, semicolons and sentence ends (a period followed by space or the end).
  const parts: Part[] = [];
  for (const m of src.matchAll(/(?:[^\n;,.]|\.(?=\S))+/g)) {
    const lead = m[0].length - m[0].trimStart().length, t = m[0].trim();
    if (!t) continue;
    // "Austin, TX": a state alone joins the place before it.
    const prev = parts[parts.length - 1];
    if (STATES.has(t) && prev && /^[A-Z][a-zA-Z .'-]*$/.test(prev.text) && !STATES.has(prev.text)) {
      prev.text = src.slice(prev.at, m.index! + lead + t.length);
      continue;
    }
    parts.push({ text: t, at: m.index! + lead });
  }
  const facts: StatedDraft[] = [], leftover: string[] = [], work: { e: Record<string, string>; span: [number, number] }[] = [];
  const scores: Part[] = [];
  let skills: Part[] = [], skillsLabel = false, education = false;
  const flushSkills = () => {
    if (skills.length) {
      const span = src.slice(skills[0].at, skills[skills.length - 1].at + skills[skills.length - 1].text.length);
      const items = skills.flatMap((p) => p.text.replace(/^skills?\s*[:\-]\s*/i, "").split(/\s*\/\s*/)).filter(Boolean);
      facts.push(draft("skills", items.join(", "), span));
    }
    skills = [];
    skillsLabel = false;
  };
  parts.forEach((p, i) => {
    const t = p.text, sub = (s: string) => t.indexOf(s) >= 0;
    const isSkill = (s: string) => s.split(/\s*\/\s*/).every((x) => SKILLS.has(x.toLowerCase()));
    if (/^skills?\s*[:\-]/i.test(t)) {
      flushSkills();
      skillsLabel = true;
      skills.push(p);
      return;
    }
    if (isSkill(t) || (skillsLabel && skills.length && t.split(/\s+/).length <= 3 && !/\d{4}|@/.test(t))) {
      skills.push(p);
      return;
    }
    flushSkills();
    let m: RegExpExecArray | null;
    if ((m = /^(?:e-?mail\s*:?\s*)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/i.exec(t))) return facts.push(draft("email", m[1], m[1]));
    if ((m = /^(?:phone\s*:?\s*)?(\+?[\d(][\d\s().-]{6,}\d)$/i.exec(t)) && m[1].replace(/\D/g, "").length >= 10) return facts.push(draft("phone", m[1], m[1]));
    if ((m = /^((?:https?:\/\/)?(?:www\.)?(linkedin|github)\.com\/[\w\/-]+?)\/?$/i.exec(t))) {
      return facts.push(draft(m[2].toLowerCase(), /^https?:/i.test(m[1]) ? m[1] : "https://" + m[1], m[1]));
    }
    if ((m = /^(?:(?:legally\s+)?authori[sz]ed to work(?: in the (?:US|U\.S\.|United States))?|work authori[sz](?:ed|ation))\s*[:?-]?\s*(yes|no|y|n)$/i.exec(t))) {
      return facts.push(draft("work_authorization", /^y/i.test(m[1]) ? "Yes" : "No", t));
    }
    if ((m = /^GPA\s*[:\-]?\s*(\d\.\d{1,2}(?:\s*\/\s*\d(?:\.\d+)?)?)$/i.exec(t))) return facts.push(draft("gpa", m[1], m[1]));
    if (/^(SAT|ACT|GRE|GMAT|LSAT|MCAT|TOEFL|IELTS)\s*[:\-]?\s*\d+(\.\d)?$/i.test(t)) return scores.push(p);
    if ((m = /^(?:location|based in|lives? in)?\s*:?\s*([A-Z][a-zA-Z.'-]*(?: [A-Z][a-zA-Z.'-]*)*),? ([A-Z]{2})$/.exec(t)) && STATES.has(m[2])) {
      facts.push(draft("location", `${m[1]}, ${m[2]}`, t), draft("city", m[1], m[1]), draft("state", m[2], m[2]));
      return;
    }
    if ((m = /^(?:name\s*:\s*)?(.+)$/i.exec(t)) && (i === 0 || /^name\s*:/i.test(t)) && NAME.test(m[1]) && !m[1].split(" ").some((w) => SCHOOL_WORD.test(w) || ROLE.test(w))) {
      facts.push(draft("full_name", m[1], m[1]));
      const w = m[1].split(" ");
      if (w.length === 2) facts.push(draft("first_name", w[0], w[0]), draft("last_name", w[1], w[1]));
      return;
    }
    const r = RANGE.exec(t), head = (r ? r[1] : t).trim(), words = head.split(/\s+/);
    const d = words.findIndex((w) => DEGREE.test(w));
    if (d > 0 || SCHOOL_NAME.test(head)) {
      if (education) return leftover.push(t); // a second school: shown back, not merged into the first
      education = true;
      const school = d > 0 ? words.slice(0, d).join(" ") : head;
      const major = d > 0 ? words.slice(d + 1).filter((w, k) => k > 0 || !/^(in|of)$/i.test(w)).join(" ") : "";
      facts.push(draft("school", school, school));
      if (d > 0) facts.push(draft("education_level", words[d], words[d]));
      if (major) facts.push(draft("major", major, major));
      if (r) {
        facts.push(draft("education_start", r[2], r[2]));
        if (!/^(present|current|now)$/i.test(r[3])) facts.push(draft("graduation_date", r[3], r[3]));
      }
      return;
    }
    // Experience: "Title at Org", or a title ending in a role word followed by the organization's capitalized name.
    let title = "", org = "";
    if ((m = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(head))) [title, org] = [m[1], m[2]];
    else {
      const k = words.map((w, j) => (ROLE.test(w) ? j : -1)).filter((j) => j >= 0 && j < words.length - 1).pop() ?? -1;
      if (k >= 0 && /^[A-Z0-9]/.test(words[k + 1])) [title, org] = [words.slice(0, k + 1).join(" "), words.slice(k + 1).join(" ")];
    }
    if (title && org && sub(title) && sub(org) && !/\d{4}/.test(org)) {
      const e: Record<string, string> = { employer: org, title };
      if (r) [e.start, e.end] = [r[2], /^(present|current|now)$/i.test(r[3]) ? "present" : r[3]];
      work.push({ e, span: [p.at, p.at + t.length] });
      if (r && e.end === "present") facts.push(draft("current_title", title, title), draft("current_employer", org, org));
      return;
    }
    leftover.push(t);
  });
  flushSkills();
  if (scores.length) {
    facts.push(draft("test_scores", scores.map((s) => s.text).join("; "), src.slice(scores[0].at, scores[scores.length - 1].at + scores[scores.length - 1].text.length)));
  }
  if (work.length) {
    facts.push(draft("work_history", JSON.stringify(work.map((w) => w.e)), src.slice(work[0].span[0], work[work.length - 1].span[1])));
  }
  // A field stated twice with different values is asked, not picked.
  const out: StatedDraft[] = [];
  for (const f of facts) {
    const same = facts.filter((x) => x.field === f.field);
    if (SINGLE.has(f.field) && new Set(same.map((x) => x.value)).size > 1) leftover.push(f.span);
    else if (!out.some((x) => x.field === f.field)) out.push(f);
  }
  return { facts: out, leftover };
}

export function confirmStatedFacts(o: { owner: string; drafts: StatedDraft[]; keep: number[]; source: string; now: number; eventId: string }): Record<string, StatedFact> {
  const event = String(o.eventId ?? "").trim();
  if (!event) throw Error("no confirmation event: stated facts are confirmed only by the person's own tap");
  const day = new Date(o.now).toISOString().slice(0, 10);
  const out: Record<string, StatedFact> = {};
  for (const i of new Set(o.keep)) {
    const d = o.drafts[i];
    if (!d || typeof d.value !== "string" || !d.value.trim()) continue;
    out[d.field] = {
      value: d.value, factId: `stated:${event}:${d.field}`.slice(0, 200), confirmed: true, user_id: o.owner, span: d.span, label: d.label,
      provenance: `owner stated (${String(o.source || "in text").replace(/[()]/g, "")}, ${day})`, confirmation_event_id: event,
    };
  }
  return out;
}

export function withStatedFacts(file: any, owner: string, confirmed: Record<string, StatedFact>) {
  const own = file && typeof file === "object" && file.user_id === owner;
  return { user_id: owner, answers: { ...(own ? file.answers : {}), ...confirmed }, saved: own ? file.saved || {} : {} };
}
