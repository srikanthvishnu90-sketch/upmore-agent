// Deadlines answered from code (the owner's capability list item 39): "what deadlines are coming up", "when are taxes
// due", "when are quarterly taxes due", "when is open enrollment", "when is my fsa deadline", "any class action
// deadlines?". Federal tax dates (rolled past weekends and legal holidays), Medicare and HealthCare.gov enrollment from
// packages/offers/deadlines.json, each with its source and checked date, and the FSA and work open-enrollment dates the
// person told Upmore (their settings row's watches of kind "deadline_fact"). Dates only, never what to file, pay or pick;
// class-action claim dates are not built (no verified settlement list) and the answer says so. Thin wrapper over
// packages/domain/99-deadlines.js (Deadlines, through the router bundle); the person's facts are read only for a
// deadline ask, so tests/edge/deadlines.test.ts drives it with fixtures.
import { Deadlines, DEADLINES_JSON } from "../../_shared/router_core.js";

export function deadlinesKind(message: string): string | null {
  return (Deadlines as any).ask(message);
}

export async function deadlinesReply(message: string, now: Date, o: { tz?: string; watches?: () => Promise<any[]> | any[] } = {}): Promise<string | null> {
  if (!(Deadlines as any).ask(message)) return null;
  const watches = o.watches ? await o.watches() : [];
  return (Deadlines as any).answer(message, now.getTime(), { tz: o.tz, data: DEADLINES_JSON, watches: Array.isArray(watches) ? watches : [] });
}
