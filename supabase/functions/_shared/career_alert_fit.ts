// F7: each person's fit to the postings their alerts would carry, for the scheduled alerts run (career_proactive_run.ts).
// The fit is search's own (career_search.ts fitOf: 121 scoreFit over the person's CONFIRMED facts), scored against the
// scoring profile on their watch record (152's career_watch_profile.scoring_profile, written by the chat router from the
// confirmed profile). Only postings that already pass the person's alert match are scored, and those are read whole
// (the new-postings list carries no description, and the skills a fit counts are in it). Nothing here sends or decides
// what is said; the planner (career_alerts.ts) ranks by it and holds what is under the floor.
import { type AlertFit, type AlertFits, type AlertPrefs, matchPosting } from "./career_alerts.ts";
import { fitOf } from "./career_search.ts";

export const FIT_READ_LIMIT = 2000; // postings read whole per run for scoring; past it, the rest are scored on their list row

export async function alertFits(o: {
  users: { id: string; prefs: AlertPrefs }[]; postings: any[]; profiles: Map<string, unknown>;
  full?: (ids: string[]) => Promise<any[]>;
}): Promise<AlertFits> {
  const out: AlertFits = new Map();
  const want = new Map<string, any[]>();
  for (const u of o.users) {
    const sp = o.profiles.get(u.id);
    if (!sp || typeof sp !== "object") continue;
    want.set(u.id, o.postings.filter((p) => matchPosting(p, u.prefs)));
  }
  if (!want.size) return out;
  const ids = [...new Set([...want.values()].flat().filter((p) => !p.description).map((p) => String(p.job_id)))];
  const whole = new Map<string, any>();
  if (o.full && ids.length) {
    try {
      for (const p of await o.full(ids.slice(0, FIT_READ_LIMIT))) whole.set(String(p.job_id), p);
    } catch (e) {
      // A failed read scores the list rows (title and place only): ranked less well, never sent on a guess, since a fit
      // decides order and the floor only, and the person's own match has already passed.
      console.error("alerts: postings unread for fit, scoring the list rows:", e instanceof Error ? e.message : String(e));
    }
  }
  for (const [userId, ps] of want) {
    const sp = o.profiles.get(userId), mine = new Map<string, AlertFit>();
    for (const p of ps) {
      try {
        const f = fitOf(whole.get(String(p.job_id)) ?? p, sp);
        mine.set(String(p.job_id), { score: typeof f.score === "number" ? f.score : null, excluded: f.excluded, reasons: f.reasons });
      } catch (e) {
        console.error("alerts: fit not scored:", e instanceof Error ? e.message : String(e));
      }
    }
    out.set(userId, mine);
  }
  return out;
}
