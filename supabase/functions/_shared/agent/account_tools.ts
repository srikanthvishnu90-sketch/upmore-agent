// Account tools: Trainee's own plan (subscribe, status, cancel at period end) and "export my data". Thin over
// trainee_billing.ts and data_export.ts; tools return data, the model writes the words. A tool is present only when its
// dependency is configured. Every external or irreversible step needs the person's own yes in this turn's message, after
// the model asked in the previous reply (same rule as a fact confirmation).
import type { ToolCtx, ToolSpec } from "./loop.ts";
import { type BillingDeps, cancelAtPeriodEnd, cardNumberIn, startCheckout, subscriptionStatus } from "../trainee_billing.ts";
import { buildExport, type ExportDeps } from "../data_export.ts";

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object" as const, properties, required });
const AFFIRM = /\b(yes|yep|yeah|yup|confirm(?:ed)?|do it|go ahead|please do|sure)\b/i;
const DENY = /\b(no|nope|not|don'?t|do not|never|wait|stop|actually|but)\b/i;
const CARD_NOTE = "A card number was typed in this chat. Tell them not to send card numbers here (they are not saved or repeated), that payment happens only on Stripe's own page, and offer the link instead. Do not repeat any digits.";

// The person's own yes, this turn, to a question the previous reply asked (`topic` is in that reply).
function confirmedYes(c: ToolCtx, topic: RegExp, what: string): void {
  const t = c.turn;
  if (!t) throw new Error(`${what}: no confirmation from the person in this turn`);
  if (!AFFIRM.test(t.message) || DENY.test(t.message)) throw new Error(`${what}: the person's message is not a plain yes; ask them first and wait for their yes`);
  if (!topic.test(t.before ?? "")) throw new Error(`${what}: the person was not asked to confirm in the previous reply; ask first, then wait for their yes`);
}

export function accountTools(deps: { billing?: BillingDeps | null; exporter?: ExportDeps | null }): ToolSpec[] {
  const tools: ToolSpec[] = [];
  const b = deps.billing;
  if (b) {
    tools.push(
      {
        name: "subscribe_to_trainee", effect: "write_own",
        description: "Make the Stripe Checkout link for Trainee's own plan so the person can subscribe from chat. They pay on Stripe's page; send the link alone on its own line with the price returned. Never ask for or accept a card number in chat.",
        input_schema: obj(),
        run: async (_i, c) => {
          if (cardNumberIn(c.turn?.message)) return { card_number_in_chat: true, note: CARD_NOTE };
          const r = await startCheckout(b, { userId: c.userId });
          if (!r.ok) {
            if (r.reason === "already_subscribed") return { already_subscribed: true, ...(await subscriptionStatus(b.store, c.userId)) };
            throw new Error("subscribing from chat is not set up here yet; say so, never pretend a link was made");
          }
          return { link: r.url, price: r.price, note: "The person pays only on Stripe's page. Never ask for, accept or repeat a card number in chat; if they send one, tell them not to." };
        },
      },
      {
        name: "get_trainee_subscription", effect: "read",
        description: "Whether the person has Trainee's own plan, its status, whether it is set to end, and the date its paid period ends.",
        input_schema: obj(),
        run: async (_i, c) => {
          const s = await subscriptionStatus(b.store, c.userId);
          return { subscribed: s.subscribed, status: s.status, cancel_at_period_end: s.cancel_at_period_end, ends_on: s.ends_on };
        },
      },
      {
        name: "cancel_trainee_subscription", effect: "write_own",
        description: "Cancel Trainee's own plan at the end of the paid period, only when the person asked to. Call first without confirm to get what will happen, tell them, and wait for their yes; then call with confirm true. Only Trainee's own plan: no other subscription is touched.",
        input_schema: obj({ confirm: { type: "boolean", description: "true only after they replied yes to the question you asked" } }),
        run: async (i, c) => {
          if (cardNumberIn(c.turn?.message)) return { card_number_in_chat: true, note: CARD_NOTE };
          const s = await subscriptionStatus(b.store, c.userId);
          if (!s.subscribed) return { subscribed: false, note: "They have no Trainee plan to cancel." };
          if (s.cancel_at_period_end) return { already_canceling: true, ends_on: s.ends_on };
          if (!i.confirm) {
            return {
              needs_confirmation: true, ends_on: s.ends_on,
              note: `Ask them to reply yes to cancel Trainee's plan. It stays active until ${s.ends_on ?? "the end of the paid period"} and then stops renewing. Only Trainee's own plan is cancelled; no other subscription is touched. Put the word cancel and that date in your question.`,
            };
          }
          confirmedYes(c, /cancel/i, "not cancelled");
          const r = await cancelAtPeriodEnd(b, { userId: c.userId });
          if (!r.ok) {
            if (r.reason === "already_canceling") return { already_canceling: true, ends_on: r.ends_on ?? null };
            throw new Error(r.reason === "no_subscription" ? "not cancelled: no active Trainee plan was found" : "not cancelled: the stored subscription is not Trainee's own plan, so nothing was changed; tell them and ask the owner to check");
          }
          return { cancelled: true, cancel_at_period_end: true, ends_on: r.ends_on };
        },
      },
    );
  }
  const x = deps.exporter;
  if (x) {
    tools.push({
      name: "export_my_data", effect: "write_own",
      description: "Export the person's own data (profile, confirmed facts, applications, messages, outreach, files) as one downloadable file, sent as a private link in this chat. Call first without confirm and ask them; call with confirm true only after their yes.",
      input_schema: obj({ confirm: { type: "boolean", description: "true only after they replied yes to the question you asked" } }),
      run: async (i, c) => {
        if (!i.confirm) {
          return {
            needs_confirmation: true,
            note: "Ask them to reply yes to export their data. It is one file with their profile, confirmed facts, applications, messages, outreach and files, and no passwords or tokens. The private link comes in this chat only and expires in an hour. Put the word export in your question.",
          };
        }
        confirmedYes(c, /export/i, "not exported");
        const file = await buildExport({ source: x.source, userId: c.userId, now: x.now ? x.now() : c.now });
        const pub = await x.publish(c.userId, file);
        return { link: pub.url, expires_minutes: pub.expires_minutes, counts: file.counts, note: "Send the link alone on its own line. The data is in the file, never in this chat." };
      },
    });
  }
  return tools;
}
