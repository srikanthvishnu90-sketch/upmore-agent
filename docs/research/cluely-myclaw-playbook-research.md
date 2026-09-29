# Merchant-playbook research: Cluely + MyClaw.ai (2026-09-29)

Public, read-only research only. No sign-ins, accounts, purchases, or cancellations were performed.
`merchant-catalog.ts` was NOT edited — these are drafts for parent integration.

---

## 1. Cluely — cancellation research

### Official sources (strong)

**Cancel Subscription** — https://support.cluely.com/en/articles/11128019-cancel-subscription
- Cancel starts from the **desktop app**: open the app → click your profile icon → **Settings** → **Billing** → **Manage**.
- "Manage" opens **Stripe's customer billing portal** ("This takes you to Stripe's portal, where you can manage your subscription and update payment details"). The article's own portal link pointed at `billing.stripe.com` (Stripe's generic customer-portal login: enter your email, Stripe emails you a portal link).
- The article calls it a **one-click cancellation** on the billing page.
- Billing effects (conflicted wording inside the article itself):
  - "Canceling your subscription cancels your access to Pro features immediately."
  - "You can continue using all features until your subscription expires, which is the date of cancelation."
  - It also states **no prorated refund** is issued ("You won't get a prorated refund").
- Treat the exact access-end timing as **needing live verification** — the article contradicts itself.

**How can I manage my Cluely subscription (including switching plans and requesting refunds)** — https://support.cluely.com/en/articles/12026933-how-can-i-manage-my-cluely-subscription-including-switching-plans-and-requesting-refunds
- Confirms: **Settings → Billing → Manage Plan** → Stripe's portal.
- Cluely **support will not perform subscription actions directly** ("Out of privacy, we won't update anything on our end").
- Monthly/annual plan switching may require cancelling and waiting until the active period ends.
- **Refunds are a separate flow from support**, not part of cancellation.
- Support contact: **[email protected]**.

**How to Use Cluely Mobile** — https://support.cluely.com/en/articles/13008320-how-to-use-cluely-mobile
- Cluely Mobile also uses Settings gear → Manage Billing; it does **not** bill through Apple subscriptions — billing goes through Cluely's Stripe portal.

**How to Use Cluely's Settings** — https://support.cluely.com/en/articles/12418681-how-to-use-cluely-s-settings
- Desktop navigation: hover over profile icon → Settings.
- Profile area lets you **set account passwords** → Cluely accounts support password credentials (evidence for `email_password`).

### Secondary / unconfirmed

- A third-party competitor teardown (mani1008/torviai AUTH-PLAN.md, technical) reports: user creates account on the website, downloads the desktop app, logs in with account credentials inside the app's embedded login form; "Auth mechanism: Email/password". This is NOT an official Cluely statement. Google SSO / email-OTP / magic-link availability is **unverified**.
- The cancel article's embedded "settings" link did not resolve to a persistent public account URL in text extraction — the exact persistent account/settings route is **unknown**; the documented path starts in the desktop app.

### Login assessment

`auth: "email_password"` — supported by official docs (password management in profile settings) + third-party report (email/password in the desktop app's embedded login form). SSO/OTP options unverified. Conservative choice: keep `email_password`, no `otp_senders` (no evidence of OTP sender).

---

## 2. MyClaw.ai — cancellation research

### Official sources

**Pricing page** — https://myclaw.ai/openclaw
- Subscribers can **upgrade, downgrade, or cancel at any time**.
- **Monthly plans retain access until the end of the billing period.**
- Annual plans are described as receiving **prorated refunds for remaining months** (unclear whether automatic or support-requested — **unverified**).
- Pricing advertises "Cancel anytime." Subscribers operate through a **browser dashboard**.

**Terms of Service** — https://myclaw.ai/ja/terms (Last updated March 26, 2026)
- §5 Billing and Payments: "Subscriptions may renew automatically." / "Payments are processed by third-party providers." / "Fees are non-refundable unless required by law."
- §16 Termination: "You may stop using the Service at any time."
- Contact: **[email protected]**; Support: **https://myclaw.ai/support**.
- No dedicated cancellation section in the ToS.

### Secondary sources

- https://winningpc.com/myclaw-coupon-promo-codes/ — "Sign up with your email and complete checkout on MyClaw's site. **Billing is handled by Stripe**; your card details never touch WinningPC's servers." / "You can **cancel anytime from your account settings**." / 7-day money-back guarantee applies to the initial purchase period only (instance cost; AI token costs excluded).
- https://openclaw-easy.com/blog/myclaw-review-2026.html — users sign up at `myclaw.ai` and operate through a browser dashboard (not an authoritative cancel-flow source).

### Still missing (critical — do NOT invent)

- Exact dashboard/account/billing URL or settings path on `myclaw.ai`.
- Login method (signup is "with your email"; password vs. magic-link unknown).
- Exact cancellation navigation and button text ("account settings" per one coupon site; no screenshots or step list found).
- Whether the subscriber gets a direct Stripe customer-portal link (billing is Stripe-powered, so the emailed receipt/invoice may carry one — check the Gmail receipt).
- Whether the annual prorated refund is automatic or requires contacting support.
- Cancellation-reason selection, retention offers, confirmation sequence.
- Cancellation-confirmation email behavior and sender.
- OTP sender.

Because these are absent, the draft must stay minimal and `verified:false`.

---

## 3. Recommended live-validation approach (for parent)

1. **Cluely:** the fastest web-only path is the **Stripe customer billing portal** the official docs point to (`billing.stripe.com` — email → emailed portal link). This avoids the desktop-app dependency of the documented in-app path. The portal's login-link email sender is unknown publicly — don't hardcode `otp_senders`.
2. **MyClaw:** billing is Stripe-powered; Vishnu's subscription receipt email (#2304-6543, Sept 2026) may contain a direct Stripe portal link. If not, the account-settings path on `myclaw.ai` needs live discovery.
3. Note Vishnu's constraint: Upmore must perform the cancellations itself (no manual involvement from him), so the validation run must cover OTP/magic-link retrieval via the Gmail connector (still blocked on the one-time Google OAuth redirect registration + connection as `vishnusrikanth8@gmail.com`).

---

## 4. Draft `MerchantPlaybook` entries (UNVERIFIED — `verified:false`)

```ts
  cluely: {
    merchant_key: "cluely",
    display_name: "Cluely",
    verified: false,
    verification_note: "PUBLIC RESEARCH ONLY 2026-09-29 - NOT LIVE-VERIFIED: official Cluely support article (https://support.cluely.com/en/articles/11128019-cancel-subscription) says cancel from the DESKTOP APP: profile icon -> Settings -> Billing -> Manage, which opens the Stripe customer billing portal where cancellation is one-click (the article's portal link points at billing.stripe.com). Second official article (https://support.cluely.com/en/articles/12026933-how-can-i-manage-my-cluely-subscription-including-switching-plans-and-requesting-refunds) confirms Settings -> Billing -> Manage Plan -> Stripe portal; support will not act directly; refunds are a separate flow. Conflicting docs on access-end timing: the cancel article says cancellation 'cancels your access to Pro features immediately' AND that 'you can continue using all features until your subscription expires' - verify live. No prorated refund. Login: email+password (official settings article says profile settings can 'set account passwords'; third-party report describes an embedded email/password form in the desktop app). Exact persistent account URL unknown; SSO/OTP methods unverified. REQUIRES one live, authenticated Browserbase run before execution.",
    version: 1,
    last_verified_at: null,
    auth: "email_password",
    account_url: "https://cluely.com/",
    evidence_texts: ["cancell?ed", "cancellation confirmed", "no longer be billed", "you won't be charged again"],
    source: "https://support.cluely.com/en/articles/11128019-cancel-subscription (+ 12026933, 13008320, 12418681)",
    steps: [
      { kind: "goto", url: "https://cluely.com/" },
      { kind: "screenshot", label: "cluely-landing" },
      // Public docs: the actual cancel flow lives in the desktop app
      // (profile icon -> Settings -> Billing -> Manage -> Stripe portal),
      // or the Stripe customer billing portal directly (billing.stripe.com).
      // Exact navigation, login surface, and confirmation sequence must be
      // discovered in the live verification run - not invented here.
    ],
  },

  myclaw: {
    merchant_key: "myclaw",
    display_name: "MyClaw",
    verified: false,
    verification_note: "PUBLIC RESEARCH ONLY 2026-09-29 - NOT LIVE-VERIFIED: official pricing page (https://myclaw.ai/openclaw) says subscribers can upgrade/downgrade/cancel at any time; monthly plans keep access until end of billing period; annual plans described as prorated for remaining months (automatic vs support-requested unknown). Official ToS (https://myclaw.ai/ja/terms): subscriptions auto-renew, payments via third-party providers, fees non-refundable unless required by law. Third-party (https://winningpc.com/myclaw-coupon-promo-codes/): billing handled by Stripe; 'cancel anytime from your account settings'; 7-day money-back on initial purchase only. STILL UNKNOWN: exact dashboard/account URL, login method (signup is 'with your email'), exact cancel navigation/button text, Stripe portal-link availability, confirmation email, OTP sender. REQUIRES one live, authenticated Browserbase run before execution.",
    version: 1,
    last_verified_at: null,
    auth: "unknown",
    account_url: "https://myclaw.ai/",
    evidence_texts: ["cancell?ed", "subscription cancelled", "no longer be billed", "won't be charged again"],
    source: "https://myclaw.ai/openclaw, https://myclaw.ai/ja/terms, https://winningpc.com/myclaw-coupon-promo-codes/",
    steps: [
      { kind: "goto", url: "https://myclaw.ai/" },
      { kind: "screenshot", label: "myclaw-landing" },
      // Public sources only say 'cancel anytime from your account settings'
      // with Stripe-powered billing. Exact dashboard URL, login surface,
      // cancel navigation, and confirmation sequence must be discovered in
      // the live verification run - not invented here.
    ],
  },
```

---

## 5. Draft `merchantDirectory` entries

```ts
  cluely: {
    merchant_key: "cluely",
    display_name: "Cluely",
    deep_link: "https://cluely.com/",
    steps: [
      "Open the Cluely desktop app, click your profile icon, and go to Settings -> Billing.",
      "Click Manage to open the Stripe customer billing portal (also reachable at billing.stripe.com with your account email).",
      "Click Cancel subscription in the portal and confirm.",
      "Note: Cluely's docs conflict on access-end timing (immediately vs until expiry) and state no prorated refund; keep the confirmation text.",
    ],
    billing_note: "Pro+ $149.99/month, billed through Stripe; refunds are a separate support flow ([email protected]).",
    source: "https://support.cluely.com/en/articles/11128019-cancel-subscription",
  },
  myclaw: {
    merchant_key: "myclaw",
    display_name: "MyClaw",
    deep_link: "https://myclaw.ai/",
    steps: [
      "Sign in at myclaw.ai and open your account settings / dashboard.",
      "Cancel your subscription from the account settings (billing is handled by Stripe).",
      "Keep the confirmation message; monthly access should continue until the end of the billing period.",
    ],
    billing_note: "Pro $39/month, auto-renews; 7-day money-back on initial purchase only (ToS: fees non-refundable unless required by law). Annual prorated-refund mechanism unconfirmed.",
    source: "https://myclaw.ai/openclaw, https://myclaw.ai/ja/terms",
  },
```

---

## 6. Draft ALIASES additions

```ts
  "cluely": "cluely",
  "cluely pro": "cluely",
  "cluely pro plus": "cluely",
  "cluely ai": "cluely",
  "myclaw": "myclaw",
  "my claw": "myclaw",
  "myclaw ai": "myclaw",
```

Note: statement descriptors strip punctuation, so "CLUELY PRO+" normalizes to "cluely pro" (covered).

---

## 7. What is still missing (do NOT invent these)

- Cluely: exact persistent account/settings URL; Stripe portal confirmation button text; reason-selection or retention offers; cancellation-confirmation email sender; OTP sender (if any); Google SSO availability.
- MyClaw: exact dashboard/account/billing URL; login method; exact cancellation navigation and button text; Stripe portal-link availability; cancellation-confirmation email behavior/sender; OTP sender; annual prorated-refund mechanism.
- `otp_senders` for both: left empty — no evidence.
