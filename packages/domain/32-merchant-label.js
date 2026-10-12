  /* Merchant labels (overnight G3 injection sweep): a merchant name is the merchant's own text (card descriptors are partly
     set by the merchant), so any name shown back to the person in Upmore's voice goes through MerchantLabel.safe first.
     Loaded before every module that shows a merchant (router and financial bundles list it first); tests in
     tests/merchant-label.test.cjs and tests/edge/injection-sweep.test.ts. */
  const MerchantLabel = (() => {
    // A merchant name is the merchant's own text (descriptors are partly set by the merchant), so anything shown back to
    // the person in Upmore's voice is cleaned first: links, emails, @handles and markup removed, and the text cut at the
    // first instruction-like word ("ignore", "reply", "visit", "password", ...), capped at 40 characters. Ordinary
    // descriptors ("NETFLIX.COM", "TRADER JOE S #552") pass unchanged. Matching still uses the raw text (merchantKey).
    const INSTRUCTION_RE = /\b(?:system|assistant|user|developer)\s*:|\b(?:ignore|disregard|reply|visit|click|confirm|verify|password|passcode|ssn|social security|one[- ]time code|send \$|approved? (?:a )?transfer|you have been)\b/i;
    function safeMerchant(raw) {
      let s = String(raw || "").replace(/<[^>]*>/g, " ").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, " ").replace(/\S+@\S+\.\S+/g, " ").replace(/(^|\s)@[\w.-]+/g, " ");
      const cut = INSTRUCTION_RE.exec(s);
      if (cut) s = s.slice(0, cut.index);
      s = s.replace(/[\s,.;:!-]+$/, "").replace(/\s+/g, " ").trim();
      if (s.length > 40) s = s.slice(0, 40).replace(/\s+\S*$/, "").trim() || s.slice(0, 40);
      return s || "Unknown merchant";
    }
    return { safe: safeMerchant, INSTRUCTION_RE };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MerchantLabel;
