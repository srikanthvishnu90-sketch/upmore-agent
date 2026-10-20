/* Trainee assisted-apply extension — saved-answers source rule (pure).
 *
 * One question, answered in exactly one place: which saved answers may
 * the content script fill from on this page? The rule binds every
 * source to the context it belongs to, because storage persists
 * across hosts and sessions:
 *
 *   stored "saved-answers" (the user's synced set)
 *       -> used ONLY while signed in. Signed out, a previous user's
 *          answers must never fill (per-user isolation, DESIGN §2).
 *   stored "demo-fixture" (the Alex Testcase TEST persona)
 *       -> used ONLY on the local demo host while signed out. Signed
 *          in, the fixture is NEVER used: filling a real form with
 *          the test persona's answers because a sync had not landed
 *          would be the worst failure this extension could produce,
 *          so the rule makes it structurally impossible, not just
 *          unlikely. Off the demo host it is equally unusable.
 *   stored, unlabeled (a set seeded by the pre-sync spike build)
 *       -> demo host only; the new build labels everything it stores.
 *   nothing stored
 *       -> signed in: nothing (sync populates it; absence stays an
 *          honest "not synced yet"). Signed out on the demo host:
 *          the fixture may be seeded (and is labeled demo). Anywhere
 *          else: nothing.
 *
 * UMD-ish like the fill engine: classic script in the page, node for
 * the guard suite.
 */
const TraineeBankSource = (() => {
  function resolveBankSource(input) {
    const i = input || {};
    const stored = i.storedBank || null;
    const hasSession = !!i.hasSession;
    const isDemoHost = !!i.isDemoHost;
    if (stored) {
      if (stored.source === "saved-answers") {
        return hasSession ? { action: "use-stored", source: "synced" } : { action: "none", source: null };
      }
      if (stored.source === "demo-fixture") {
        return (!hasSession && isDemoHost) ? { action: "use-stored", source: "demo-fixture" } : { action: "none", source: null };
      }
      return isDemoHost ? { action: "use-stored", source: stored.source || "stored" } : { action: "none", source: null };
    }
    if (hasSession) return { action: "none", source: null };
    if (isDemoHost) return { action: "seed-fixture", source: "demo-fixture" };
    return { action: "none", source: null };
  }
  return { resolveBankSource };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TraineeBankSource;
if (typeof window !== "undefined") window.TraineeBankSource = TraineeBankSource;
if (typeof self !== "undefined") self.TraineeBankSource = TraineeBankSource;
