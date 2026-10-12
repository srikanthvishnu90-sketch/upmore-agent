// A send that waits for the paycheck (megadoc A15 "pay maya 40 but only if my paycheck landed";
// packages/domain/115-paycheck-send.js through the router bundle). Before the settings commands and the flows: the
// person's own rows say whether a paycheck landed (today or yesterday in their day). Landed: said with the deposit, then
// the send flow's own card for their words, which needs its yes. Not yet: the send is saved as a watch and the hourly run
// asks for the card when the next paycheck posts (plan() in _shared/proactive.ts). Nothing is sent from here. Pure apart
// from the injected deps, so tests/edge/paycheck-send.test.ts drives it with fixtures.
import { PaycheckSend } from "../../_shared/router_core.js";

export interface PaycheckDeps {
  transactions(): Promise<any[]>;
  readWatches(): Promise<any[]>;
  saveWatches(watches: any[]): Promise<boolean>;
  runFlow(text: string): Promise<{ reply: string; route?: any } | null>;
}

export async function paycheckSendMessage(message: string, d: PaycheckDeps, now: number, tz: string): Promise<{ reply: string; route?: any; changed?: boolean } | null> {
  const P: any = PaycheckSend;
  const p = P.parse(message);
  if (!p) return null;
  let rows: any[];
  try { rows = (await d.transactions()) || []; } catch { return { reply: "I can't read your bank rows right now, so I can't tell whether your paycheck landed. Nothing was set up or sent; try again in a minute." }; }
  const l = P.landed(rows, now, tz);
  if (l.landed) {
    const flow = await d.runFlow(p.command);
    const lead = `Your paycheck landed: ${P.said(l.last)}.`;
    if (flow && flow.reply) return { reply: `${lead} ${flow.reply}`, route: flow.route };
    return { reply: `${lead} I couldn't put up the card right now, so nothing was sent. Say "${p.command}" in a moment.` };
  }
  let watches: any[];
  try { watches = (await d.readWatches()) || []; } catch { return { reply: "I couldn't read your settings right now, so nothing was set up or sent. Try again in a minute." }; }
  const w = P.watch(p, now, tz);
  if (!(await d.saveWatches(watches.concat([w])))) return { reply: "I couldn't save that right now, so nothing was set up or sent. Try again in a moment." };
  return { changed: true, reply: `No paycheck has posted yet${l.last ? ` (the last one: ${P.said(l.last)})` : ""}. I'll ask you for the card to ${P.restate(w)} when your next paycheck posts; I see it after your bank rows refresh. Nothing is sent before then, and the card still needs your yes. Say "cancel the paycheck send to ${w.name.split(" ")[0].replace(/\b\w/g, (c: string) => c.toUpperCase())}" to drop it.` };
}
