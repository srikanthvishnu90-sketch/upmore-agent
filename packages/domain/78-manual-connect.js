  /* Guided manual connect (owner, 2026-10-11, guided manual connect addendum): the read-only lane for platforms with no
     API and no aggregator (the browser_assisted rows in packages/connectors/platforms.json). Decision 1 (settled): no
     password storage, session-only. The person opens a live browser window on the platform's own site, logs in
     themselves and completes their own 2FA or CAPTCHA; Upmore never sees or keeps a password or a code. Only the
     encrypted session persists, and it is used for one thing: reading holdings and balances.
     This module is the policy, kept pure so every rule is tested: the consent the person reads (recorded verbatim), the
     playbook a platform needs before it can be offered, read-only enforcement, session health and the honest status
     line ("Connected (manual session), last checked 3:05 PM"), and the log scrubber that keeps cookies, tokens and
     codes out of every log and message. The live window and the encrypted session store are the host's (Browserbase
     live view, Vault); neither is built yet, so the host answers NOT_WIRED until they are. */
  const ManualConnect = (() => {
    const CONSENT_VERSION = "2026-10-11";
    const READ_VERBS = Object.freeze(["health", "read_balances", "read_positions"]);
    const HEALTH_EVERY_MS = 6 * 3600 * 1000; // a session is checked every 6 hours; older than a day is said plainly
    const STALE_MS = 24 * 3600 * 1000;

    // What the person agrees to, word for word, before the window opens. The exact text is stored with the consent.
    function consentText(platform) {
      return [
        `Upmore opens ${platform}'s own sign-in page in a secure live window. You log in yourself and do your own two-step check; Upmore never sees or keeps your password or any code.`,
        `Once you're in, Upmore keeps only the encrypted session, and uses it to read your balances and holdings. Read-only: it never places an order, moves money or changes a setting.`,
        `Upmore checks the session every few hours and tells you when ${platform} signs you out, so you can log in again.`,
        `${platform}'s terms may not allow automated access. If they ask Upmore to stop, it stops.`,
        `Turn it off any time with one message ("disconnect ${platform}"); the session is deleted right away.`,
      ];
    }
    function consentRecord(platform, now, accepted) {
      if (accepted !== true) return { ok: false, code: "no_consent", text: `Nothing was connected: ${platform} connects only after you agree.` };
      return { ok: true, record: { platform, version: CONSENT_VERSION, text: consentText(platform).join(" "), accepted_at: new Date(now).toISOString() } };
    }

    // A platform is offered only with a playbook: where to sign in, how to tell the person is signed in, and what to
    // read. Reads only: a step that could buy, sell, move money or change anything is refused at validation.
    const WRITE_WORDS = /\b(buy|sell|trade|order|transfer|withdraw|deposit|invest|redeem|submit|confirm|delete|close account|change|update|save)\b/i;
    function validatePlaybook(pb) {
      const errors = [], tag = (pb && pb.platform_id) || "?";
      if (!pb || !pb.platform_id || !pb.display_name) return ["playbook: platform_id and display_name are required"];
      if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(pb.login_url || "")) errors.push(`${tag}: login_url must be the platform's own https page`);
      if (!Array.isArray(pb.signed_in_when) || !pb.signed_in_when.length) errors.push(`${tag}: signed_in_when needs at least one text the signed-in page shows`);
      if (!Array.isArray(pb.signed_out_when) || !pb.signed_out_when.length) errors.push(`${tag}: signed_out_when needs at least one text the sign-in page shows`);
      const reads = pb.reads || [];
      if (!reads.length) errors.push(`${tag}: reads is empty`);
      for (const r of reads) {
        if (!["balance", "position", "as_of"].includes(r.field)) errors.push(`${tag}: read field ${r.field} is not balance, position or as_of`);
        if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(r.page || "")) errors.push(`${tag}: read ${r.field} needs its page`);
        if (!Array.isArray(r.labels) || !r.labels.length) errors.push(`${tag}: read ${r.field} needs the labels it reads next to`);
      }
      for (const s of pb.steps || []) if (s.kind === "click" && WRITE_WORDS.test(s.text || "")) errors.push(`${tag}: step clicks "${s.text}", which could change something; manual connect is read-only`);
      if (typeof pb.verified !== "boolean") errors.push(`${tag}: verified must say true or false`);
      if (pb.verified && !pb.verified_on) errors.push(`${tag}: a verified playbook names the live run that verified it`);
      if (!Array.isArray(pb.sources) || !pb.sources.length) errors.push(`${tag}: sources are required`);
      return errors;
    }

    // Read-only, whatever is asked.
    function allow(verb) {
      if (READ_VERBS.includes(verb)) return { ok: true };
      return { ok: false, code: "read_only", text: "A manual connection is read-only: Upmore reads balances and holdings there, and never places orders, moves money or changes settings. Nothing was done." };
    }

    // Session health. A check returns what the page showed; the state moves and the person hears about a sign-out once.
    // state: pending_login | connected | needs_login | broken | revoked
    function onCheck(session, check, now) {
      const s = Object.assign({ state: "pending_login", last_checked: null, told_signed_out: false, failures: 0 }, session || {});
      if (s.state === "revoked") return { session: s, message: null };
      if (check.signed_in) return { session: Object.assign(s, { state: "connected", last_checked: now, told_signed_out: false, failures: 0 }), message: null };
      if (check.signed_out) {
        const message = s.told_signed_out ? null : `${check.platform} signed you out, so Upmore can't read it right now. Log in again whenever you like: I'll send the link.`;
        return { session: Object.assign(s, { state: "needs_login", told_signed_out: true, failures: 0 }), message };
      }
      // Neither: the page changed or did not load. Two in a row is broken, said once; one is a blip.
      const failures = s.failures + 1;
      const broken = failures >= 2 && s.state !== "broken";
      return { session: Object.assign(s, { failures, state: failures >= 2 ? "broken" : s.state }), message: broken ? `${check.platform}'s page changed, so Upmore can't read it right now. Nothing was changed; I'll tell you when it works again.` : null };
    }
    const due = (session, now) => !!session && ["connected"].includes(session.state) && (!session.last_checked || now - session.last_checked >= HEALTH_EVERY_MS);

    // The honest status line, everywhere the connection is shown.
    function statusLine(platform, session, now, fmt) {
      const t = ms => (fmt ? fmt(ms) : new Date(ms).toISOString());
      const s = session || { state: "pending_login" };
      if (s.state === "connected") {
        const stale = s.last_checked && now - s.last_checked > STALE_MS;
        return `${platform}: connected (manual session), last checked ${t(s.last_checked)}${stale ? " - older than a day, so the numbers may be out of date" : ""}`;
      }
      if (s.state === "needs_login") return `${platform}: signed out - log in again to keep reading it${s.last_checked ? ` (last read ${t(s.last_checked)})` : ""}`;
      if (s.state === "broken") return `${platform}: can't be read right now (the page changed)${s.last_checked ? `; last read ${t(s.last_checked)}` : ""}`;
      if (s.state === "revoked") return `${platform}: disconnected`;
      return `${platform}: not connected`;
    }

    // Logs and messages never carry a session, a cookie, a token, a password or a code: keys that name one are dropped,
    // and values that look like one are masked, however deep.
    const SECRET_KEY = /cookie|session|token|password|passwd|secret|authorization|auth_header|otp|one_time|code|api_key|apikey|bearer|storage_state|local_storage/i;
    const SECRET_VALUE = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}|\b(?:Bearer|Basic)\s+[\w.~+/=-]{12,}|(?:^|;\s*)[\w-]+=[\w%.~+/=-]{16,}(?:;|$)|\b[a-f0-9]{32,}\b|\b[A-Za-z0-9+/]{40,}={0,2}/;
    const KEEP_KEYS = new Set(["state", "platform", "last_checked", "field", "page", "labels"]);
    function scrub(value, depth) {
      const d = depth || 0;
      if (d > 8) return "[deep value removed]";
      if (typeof value === "string") return SECRET_VALUE.test(value) ? "[secret removed]" : value;
      if (Array.isArray(value)) return value.map(v => scrub(v, d + 1));
      if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) { if (SECRET_KEY.test(k) && !KEEP_KEYS.has(k)) continue; out[k] = scrub(v, d + 1); }
        return out;
      }
      return value;
    }
    const leaks = value => JSON.stringify(scrub(value)) !== JSON.stringify(value);

    return { CONSENT_VERSION, READ_VERBS, HEALTH_EVERY_MS, STALE_MS, consentText, consentRecord, validatePlaybook, allow, onCheck, due, statusLine, scrub, leaks };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ManualConnect;
