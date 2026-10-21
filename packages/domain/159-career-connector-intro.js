/* Career connector INTRO COMPOSER (Lane B package 3; number 159 per coordinator assignment). Pure, deterministic:
   no I/O, no LLM, no clock reads, no writes. Composition is templates + slot
   filling over CONSENTED PUBLIC FIELDS ONLY.

   Runs only after a double opt-in (both sides said yes to this specific
   match — the match flow owns that state; this module composes the words).

   Consent whitelist: the composer reads exactly four fields per person —
   name, headline, need, offer — plus the match reasoning the matcher
   produced. Anything else on a profile object (email, phone, notes, tags)
   is never read and can never reach the output (test INTRO-008).

   No-fact-no-intro is enforced, per the capability spec (zero unexplained
   intros; every "why" must come from the match record): composing REFUSES
   without both names and a why for BOTH sides. Optional fields behave the
   opposite way — a field absent means its sentence is omitted, never filled
   with a plausible invention (tests INTRO-005..007).

   Booking is an OFFER, never a claim: the composer emits the offer text and
   a booking payload with status "offered_not_booked" and
   calendar_event_created:false. A real calendar booking waits on the user's
   in-product Google connect (payload.requires = "google_connect"); nothing
   here says or implies anything is booked (test INTRO-009).

   Follow-through (spec step 6): when the caller supplies the intro time,
   the result carries the 72h follow-up message skeleton (names filled; the
   outcome is ASKED, never asserted) and the due-marker record with
   due_at = intro_at + 72h exactly. Without a valid intro time the message
   still composes and follow_up is null with a named warning — a due time is
   never invented (test INTRO-012).

   Export surface for the integration lane:
     composeIntro(input) -> { ok, status, reason, missing, warnings,
                              message, booking, follow_up }
     composeFollowUp({a, b, introAt, matchId, introId})
                           -> { message, record } | null
     PUBLIC_FIELDS, FOLLOW_UP_AFTER_MS, VERSION
   input = { a: {id?, name, headline?, need?, offer?},
             b: {id?, name, headline?, need?, offer?},
             reasoning: { forA, forB },            // required, both sides
             firstStep?,                            // optional process step
             proposedTimes?: [{start, label?}],     // data slots, echoed
             introAt?, matchId?, introId? }
   Check: node --test tests/career-connector-intro.test.cjs */
const CareerConnectorIntro = (() => {
  const VERSION = "2026-10-21";
  const FOLLOW_UP_AFTER_MS = 72 * 60 * 60 * 1000;
  const PUBLIC_FIELDS = ["name", "headline", "need", "offer"];
  const DEFAULT_FIRST_STEP = "reply in this thread and lock a time — even a rough one — while this is in front of you both";

  const str = (v) => typeof v === "string" ? v : "";
  // Whitespace-collapsed, length-capped slot text. Trailing periods are the
  // composer's job (frames add exactly one), so a supplied one is stripped.
  const phrase = (v, n) => str(v).replace(/\s+/g, " ").trim().slice(0, n).replace(/\.+$/, "").trim();
  const sentence = (v, n) => {
    const s = phrase(v, n);
    if (!s) return "";
    return s.replace(/^[a-z]/, (ch) => ch.toUpperCase()) + ".";
  };
  const firstName = (name) => phrase(name, 80).split(" ")[0] || "";

  // The whitelist, applied once: everything downstream reads only this shape.
  function side(p) {
    const o = p && typeof p === "object" ? p : {};
    return {
      id: str(o.id).trim(),
      name: phrase(o.name, 80),
      headline: phrase(o.headline, 200),
      need: phrase(o.need, 400),
      offer: phrase(o.offer, 400),
    };
  }

  function headlineLine(p) {
    return p.headline ? `${firstName(p.name)} — ${p.headline}.` : "";
  }

  function afterLine(p) {
    const first = firstName(p.name);
    const parts = [];
    if (p.need) parts.push(`${first} wants ${p.need}.`);
    if (p.offer) parts.push(`${first} can offer ${p.offer}.`);
    return parts.join(" ");
  }

  function cleanTimes(raw, warnings) {
    const out = [];
    let dropped = 0;
    for (const t of Array.isArray(raw) ? raw : []) {
      const start = t && typeof t === "object" ? str(t.start).replace(/\s+/g, " ").trim().slice(0, 90) : "";
      if (!start || out.some((x) => x.start === start)) { dropped += 1; continue; }
      const label = str(t.label).replace(/\s+/g, " ").trim().slice(0, 90) || start;
      out.push({ start, label });
    }
    if (dropped) warnings.push(`proposed_time_dropped:${dropped}`);
    return out;
  }

  function bookingText(times) {
    if (!times.length) return "For the call: I can book a 20-minute call once you reply with times that suit you both. Nothing is booked yet.";
    const labels = times.map((t) => t.label);
    const list = labels.length === 1 ? labels[0] : labels.slice(0, -1).join(", ") + " or " + labels[labels.length - 1];
    return `For the call: ${list} could work. Nothing is booked yet — if ${labels.length === 1 ? "that" : "one of those"} works for you both, say so here and I'll book it.`;
  }

  function composeFollowUp(input) {
    const c = input && typeof input === "object" ? input : {};
    const a = side(c.a);
    const b = side(c.b);
    const t = Date.parse(str(c.introAt));
    if (!a.name || !b.name || !Number.isFinite(t)) return null;
    const introISO = new Date(t).toISOString();
    const record = {
      kind: "connector_follow_up",
      version: VERSION,
      intro_id: str(c.introId).trim() || null,
      match_id: str(c.matchId).trim() || null,
      a_id: a.id || null,
      b_id: b.id || null,
      a_name: a.name,
      b_name: b.name,
      intro_at: introISO,
      due_at: new Date(t + FOLLOW_UP_AFTER_MS).toISOString(),
      status: "pending",
    };
    const message = [
      `Hi ${firstName(a.name)} and ${firstName(b.name)} — checking in on the intro I made three days ago.`,
      "",
      "Did the two of you get to talk? If you did, was it useful? If it stalled, reply here and I'll nudge it once.",
      "",
      "— Trainee",
    ].join("\n");
    return { message, record };
  }

  function refused(reason, missing) {
    return { ok: false, status: "refused", reason, missing, warnings: [], message: null, booking: null, follow_up: null };
  }

  function composeIntro(input) {
    const c = input && typeof input === "object" ? input : {};
    const a = side(c.a);
    const b = side(c.b);
    const reasoning = c.reasoning && typeof c.reasoning === "object" ? c.reasoning : {};
    const whyA = phrase(reasoning.forA, 400);
    const whyB = phrase(reasoning.forB, 400);

    const missing = [];
    if (!a.name) missing.push("a.name");
    if (!b.name) missing.push("b.name");
    if (!whyA) missing.push("reasoning.forA");
    if (!whyB) missing.push("reasoning.forB");
    if (missing.length) return refused("missing_required_fields", missing);
    if (a.id && b.id && a.id === b.id) return refused("same_person_both_sides", []);

    const warnings = [];
    const times = cleanTimes(c.proposedTimes, warnings);

    const paragraphs = [];
    paragraphs.push(`${a.name}, meet ${b.name}. ${b.name}, meet ${a.name}.`);
    const heads = [headlineLine(a), headlineLine(b)].filter(Boolean);
    if (heads.length) paragraphs.push(heads.join(" "));
    paragraphs.push(`Why I'm connecting you: ${sentence(whyA, 400)} ${sentence(whyB, 400)}`);
    const afters = [afterLine(a), afterLine(b)].filter(Boolean);
    if (afters.length) paragraphs.push("What you're each after:\n" + afters.join("\n"));
    paragraphs.push(`First step: ${phrase(c.firstStep, 240) || DEFAULT_FIRST_STEP}.`);
    const offerText = bookingText(times);
    paragraphs.push(offerText);
    paragraphs.push("— Trainee");
    const message = paragraphs.join("\n\n");

    const booking = {
      status: "offered_not_booked",
      calendar_event_created: false,
      offer_text: offerText,
      proposed_times: times,
      payload: {
        kind: "connector_booking_offer",
        version: VERSION,
        match_id: str(c.matchId).trim() || null,
        intro_id: str(c.introId).trim() || null,
        participants: [a.name, b.name],
        proposed_times: times,
        status: "offered_not_booked",
        calendar_event_created: false,
        requires: "google_connect",
      },
    };

    const follow_up = composeFollowUp(c);
    if (!follow_up) warnings.push("follow_up_not_scheduled:intro_at_missing_or_invalid");

    return { ok: true, status: "composed", reason: null, missing: [], warnings, message, booking, follow_up };
  }

  return { VERSION, FOLLOW_UP_AFTER_MS, PUBLIC_FIELDS, composeIntro, composeFollowUp };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorIntro;
