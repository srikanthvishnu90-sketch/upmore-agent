// WO-111 (brutal T05, T19): the person's own words stop, pause or resume their saved job alert from chat. Code does it and says
// exactly what it did, from the saved row; nothing is guessed and nothing else is touched. No model.
import type { AlertStore } from "./career_alert_store.ts";

export type AlertControl = { kind: "remove" | "pause" | "resume" };
const NOUN = String.raw`(?:(?:my|the|all|all of my|all my)\s+)?(?:job\s+|email\s+|text\s+)?(?:alerts?|watch(?:es)?|notifications?)`;
export function parseAlertControl(text: string): AlertControl | null {
  const t = String(text ?? "").toLowerCase().replace(/[’]/g, "'").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 90) return null;
  const lead = String.raw`^(?:(?:ok|okay|please|can you|could you|just)[, ]+)*`;
  if (new RegExp(`${lead}(?:cancel|remove|delete|stop|end|get rid of)\\s+${NOUN}$`).test(t) || new RegExp(`${lead}turn off\\s+${NOUN}$`).test(t) || new RegExp(`${lead}stop sending me (?:job )?(?:alerts?|notifications?)$`).test(t)) return { kind: "remove" };
  if (new RegExp(`${lead}(?:pause|snooze|mute|disable)\\s+${NOUN}$`).test(t)) return { kind: "pause" };
  if (new RegExp(`${lead}(?:turn|switch)\\s+(?:them|it|${NOUN})\\s+(?:back\\s+)?on(?: again)?$`).test(t) || new RegExp(`${lead}(?:resume|unpause|restart|re-?enable)\\s+${NOUN}$`).test(t) || new RegExp(`${lead}(?:resume|unpause)\\s+(?:them|it)$`).test(t)) return { kind: "resume" };
  return null;
}
const what = (p: { keywords?: string[]; locations?: string[]; remote_ok?: boolean }) =>
  `${(p.keywords ?? []).join(" or ") || "any role"}${(p.locations ?? []).length || p.remote_ok ? ` in ${[...(p.locations ?? []), ...(p.remote_ok ? ["remote"] : [])].join(" or ")}` : ""}`;

export async function alertControlTurn(o: { message: string; userId: string; store: Pick<AlertStore, "get" | "save"> & Partial<Pick<AlertStore, "remove">> }): Promise<{ reply: string; intent: string; status: string } | null> {
  const c = parseAlertControl(o.message);
  if (!c) return null;
  const row = await o.store.get(o.userId);
  if (!row) return { reply: "You have no saved job alert, so there is nothing to change.", intent: "career_alert_control", status: "none" };
  const label = what(row.prefs as any);
  if (c.kind === "remove") {
    if (!o.store.remove) return { reply: "I could not remove your alert just now, and it is unchanged. Try again in a moment.", intent: "career_alert_control", status: "failed" };
    await o.store.remove(o.userId);
    return { reply: `Removed your job alert for ${label}. You will get no more alerts from it. Tell me a role to watch for if you want a new one.`, intent: "career_alert_control", status: "removed" };
  }
  if (c.kind === "pause") {
    if (!(row.prefs as any).on) return { reply: `Your job alert for ${label} was already paused. Your search is kept.`, intent: "career_alert_control", status: "paused" };
    await o.store.save({ ...row, prefs: { ...row.prefs, on: false } } as any);
    return { reply: `Paused your job alert for ${label}. The search is kept as it was; say turn them back on and it resumes.`, intent: "career_alert_control", status: "paused" };
  }
  if ((row.prefs as any).on) return { reply: `Your job alert for ${label} is already on.`, intent: "career_alert_control", status: "on" };
  await o.store.save({ ...row, prefs: { ...row.prefs, on: true } } as any);
  return { reply: `Your job alert is back on, the same search as before: ${label}.`, intent: "career_alert_control", status: "on" };
}
