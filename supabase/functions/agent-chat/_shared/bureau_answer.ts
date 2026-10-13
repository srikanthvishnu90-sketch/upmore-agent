// Credit-bureau guided flows answered from code (K9: C139 freeze, C140 report dispute, C151 identity
// theft, C205 minor freeze): the three bureaus' real steps, links and clocks, with the honest boundary
// in the reply itself — the identity steps and every submission are the person's own taps at each
// bureau, and no PIN or identity number is ever accepted in chat. Thin wrapper over
// packages/domain/118-agent-bureaus.js (AgentBureaus, through the router bundle); pure, so
// tests/edge/bureau-answer.test.ts drives it directly. No bureau is connected, so no report rows are
// read here: the dispute flow starts from the free reports at annualcreditreport.com and the packet is
// built from what the person describes.
import { AgentBureaus } from "../../_shared/router_core.js";

export function isBureauAsk(message: string): boolean {
  return AgentBureaus.isBureauAsk(message);
}

export function bureauReply(message: string, today: string): string | null {
  const a = AgentBureaus.answer(message, { today });
  return a ? a.text : null;
}
