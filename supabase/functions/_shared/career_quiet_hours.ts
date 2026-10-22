// Job-alert settings use the existing owned alert row. No model, new watch, timezone guess, or counter reset.
import { type AlertStore, validZone } from "./career_alert_store.ts";

type Reply = { reply: string; intent: string; resultStatus: string; contained: false; handler: string };
const answer = (reply: string, resultStatus: string): Reply =>
  ({ reply, intent: "career_quiet_hours", resultStatus, contained: false, handler: "quiet_hours" });
const showHour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const query = /^(?:what are|show|tell me) my (?:job[- ]alert )?quiet hours[?.!]*$/i;
// Only direct first-person settings are writes; quoted instructions, hypotheticals and suggestions are not.
const setting = /^(?:(?:please )?set my (?:job[- ]alert )?quiet hours(?: to| from)?|my (?:job[- ]alert )?quiet hours (?:are|should be))\s+(.+?)[.!]*$/i;
const clock = "(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)";
const windowPattern = new RegExp(`^${clock}\\s*(?:[-–—]|to)\\s*${clock}(?:\\s+(?:in\\s+)?([A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+|UTC))?$`, "i");
function hour(token: string): number | null {
  const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m || (m[2] !== undefined && m[2] !== "00")) return null;
  const h = Number(m[1]);
  if (m[3]) return h >= 1 && h <= 12 ? h % 12 + (m[3].toLowerCase() === "pm" ? 12 : 0) : null;
  // Without am/pm require an explicit 24-hour clock, rather than interpreting "10-7".
  return m[2] === "00" && h <= 23 ? h : null;
}
export async function quietHoursTurn(o: { message: string; userId: string; store: AlertStore }): Promise<Reply | null> {
  const text = o.message.trim(), read = query.test(text), write = text.match(setting);
  if (!read && !write) return null;
  const window = write?.[1].match(windowPattern);
  const start = window ? hour(window[1]) : null, end = window ? hour(window[2]) : null;
  if (write && (!window || start === null || end === null || start === end)) {
    return answer("Which whole-hour quiet window should job alerts use? Give both times as 22:00-07:00 or 10pm-7am; minute-level settings are not supported yet.", "awaiting_user");
  }
  try {
    const previous = await o.store.get(o.userId);
    if (!previous) return answer("There is no saved job-alert watch to update. Which jobs should I watch, and what IANA timezone should the alerts use?", "awaiting_user");
    const tz = window?.[3] ?? previous.tz;
    if (!validZone(tz)) return answer("What IANA timezone should job alerts use, for example America/Chicago?", "awaiting_user");
    if (read) return answer(`Your saved job-alert quiet hours are ${showHour(previous.prefs.quiet_start)}-${showHour(previous.prefs.quiet_end)} (${tz}).`, "answered");
    if (!o.store.patchQuietHours) return answer("Quiet-hour settings cannot be saved here right now. Please retry later.", "blocked");
    const saved = await o.store.patchQuietHours(o.userId, previous, { quiet_start: start!, quiet_end: end!, tz });
    if (!saved) return answer("Your alert settings changed during this request. I did not replace them; please retry the quiet-hours change.", "blocked");
    const confirmed = await o.store.get(o.userId);
    if (!confirmed || confirmed.tz !== tz || confirmed.prefs.quiet_start !== start || confirmed.prefs.quiet_end !== end) {
      return answer("I could not confirm the saved quiet hours. Ask for your current quiet hours before retrying.", "blocked");
    }
    return answer(`Saved job-alert quiet hours: ${showHour(start!)}-${showHour(end!)} (${tz}). Job alerts and daily job reports wait until this window ends.`, "completed");
  } catch {
    return answer("I could not confirm a quiet-hours update. Ask for your current quiet hours before retrying.", "blocked");
  }
}
