// Upmore "cancel it for me" merchant catalog.
//
// Two data sets:
//   1. playbookRegistry — declarative browser playbooks keyed by merchant_key.
//      HARD RULE: every newly authored playbook ships with verified:false.
//      The executor (index.ts) REFUSES to run any playbook whose
//      verified !== true and returns { path: "guided", reason:
//      "unverified_playbook" } with a guided fallback instead. A playbook may
//      be flipped to verified:true only after a real, live, authenticated
//      Browserbase run against the merchant's production site.
//   2. merchantDirectory — human-readable guided fallback entries (deep link +
//      steps + source) shown when the agent cannot act: unknown merchant, no
//      playbook, unverified playbook, missing setup, or human-only flows.
//
// All URLs and steps below come from public research (2026-09-27 search
// results), NOT from live authenticated navigation. Sources are recorded on
// each entry so the founder can audit provenance.

export type AuthKind = "email_password" | "email_otp" | "unknown";

export type DriverAction =
  | { kind: "goto"; url: string }
  | { kind: "waitFor"; js: string; timeoutMs?: number; required?: boolean; label?: string }
  | { kind: "clickText"; pattern: string }
  | { kind: "clickFirst"; selectors: string[]; required?: boolean }
  | { kind: "clickDialogButton"; pattern: string }
  | { kind: "typeInto"; selectors: string[]; credential?: "username" | "password"; text?: string }
  | { kind: "otpPause"; hint: string }
  | { kind: "fillOtp" }
  | { kind: "screenshot"; label: string }
  | { kind: "requireText"; patterns: string[] };

export interface MerchantPlaybook {
  merchant_key: string;
  display_name: string;
  // Executor gate: only verified:true playbooks may run.
  verified: boolean;
  verification_note?: string;
  auth: AuthKind;
  account_url: string;
  steps: DriverAction[];
  evidence_texts: string[];
  // Where the steps were confirmed (public research, not live navigation).
  source: string;
}

export interface DirectoryEntry {
  merchant_key: string;
  display_name: string;
  deep_link: string | null;
  steps: string[];
  billing_note?: string;
  // true when the agent cannot complete this flow (in-person / mail /
  // phone / device-only) — the user must do the steps themselves.
  human_only?: boolean;
  source: string;
}

// Shared selectors for email/password login forms.
const EMAIL_SEL = [
  'input[type="email"]', 'input[name="email"]',
  'input[autocomplete="email"]', 'input[placeholder*="mail" i]',
];
const PASS_SEL = [
  'input[type="password"]', 'input[name="password"]',
  'input[autocomplete="current-password"]',
];
const LOGIN_CLICK = "log ?in|sign ?in";

// ================= playbook registry =================

export const playbookRegistry: Record<string, MerchantPlaybook> = {
  // ------------------------------------------------------------------
  // Devin — authored 2026-09-26 from Devin's shipped JS bundle (email-first +
  // passwordless email OTP; cancel is a React dialog on private APIs) and
  // implemented as the dedicated executor path in index.ts (not the
  // declarative runner). Ships verified:false per the catalog hard rule: it
  // graduates to verified:true only after one real, live, authenticated
  // Browserbase run against Devin's production site (the founder's key
  // install + first supervised run is that verification). Until then the
  // executor returns the guided fallback — never a guessed live run.
  // ------------------------------------------------------------------
  devin: {
    merchant_key: "devin",
    display_name: "Devin",
    verified: false,
    verification_note:
      "Bundle-analysis authored 2026-09-26; needs one live authenticated run to graduate.",
    auth: "email_otp",
    account_url: "https://app.devin.ai/auth/login?redirect=/&reauth=true",
    steps: [], // dedicated implementation; the declarative runner is never used
    evidence_texts: ["cancell?ed", "cancellation confirmed", "no longer be billed", "access until"],
    source: "agent-exec/index.ts dedicated implementation (2026-09-26 recon)",
  },

  // ------------------------------------------------------------------
  // Everything below is UNVERIFIED (verified:false). None of it may
  // execute until a live, authenticated Browserbase run validates it.
  // Steps reflect public cancellation guides, not live navigation.
  // ------------------------------------------------------------------

  spotify: {
    merchant_key: "spotify",
    display_name: "Spotify",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.spotify.com/account/subscription/",
    source: "https://legalclarity.org/how-to-cancel-spotify-premium-and-get-a-refund/",
    evidence_texts: ["cancell?ed", "won't be charged again", "no longer be billed", "premium ends"],
    steps: [
      { kind: "goto", url: "https://www.spotify.com/account/subscription/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "subscription page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel premium|cancel plan" },
      { kind: "clickDialogButton", pattern: "confirm|yes,?\\s*cancel|continue" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "won't be charged again", "no longer be billed", "premium ends"] },
    ],
  },

  netflix: {
    merchant_key: "netflix",
    display_name: "Netflix",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://netflix.com/YourAccount",
    source: "https://usesparrow.com/blog/how-to-cancel-netflix-subscriptions/",
    evidence_texts: ["cancell?ed", "membership ends", "no longer be billed"],
    steps: [
      { kind: "goto", url: "https://netflix.com/YourAccount" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[name="userLoginId"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL.concat(['input[name="userLoginId"]']), credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL.concat(['input[name="password"]']), credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/cancel membership/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel membership" },
      { kind: "clickDialogButton", pattern: "finish cancellation|complete cancellation|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)", "no longer be billed"] },
    ],
  },

  hulu: {
    merchant_key: "hulu",
    display_name: "Hulu",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://hulu.com/account",
    source: "https://tvplusstream.com/how-to-cancel-hulu/",
    evidence_texts: ["cancell?ed", "subscription ends", "access until"],
    steps: [
      { kind: "goto", url: "https://hulu.com/account" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/your subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "continue to cancel|confirm cancellation|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)", "access until"] },
    ],
  },

  disney_plus: {
    merchant_key: "disney_plus",
    display_name: "Disney+",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.disneyplus.com/account",
    source: "https://github.com/peerjakobsen/smartspender/blob/HEAD/subscriptions/disney-plus.md",
    evidence_texts: ["cancell?ed", "subscription ends", "effective"],
    steps: [
      { kind: "goto", url: "https://www.disneyplus.com/account" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/subscriptions?/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickText", pattern: "other|no longer (need|want)|too expensive" },
      { kind: "clickDialogButton", pattern: "complete cancellation|confirm cancellation|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)", "effective"] },
    ],
  },

  max: {
    merchant_key: "max",
    display_name: "Max",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://max.com/subscription",
    source: "https://www.engadget.com/entertainment/how-to-cancel-your-hbo-max-subscription-155047857.html",
    evidence_texts: ["cancell?ed", "access until", "no longer be billed"],
    steps: [
      { kind: "goto", url: "https://max.com/subscription" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/manage subscription|subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "subscription page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage subscription" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "confirm|continue to cancel|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "access until", "no longer be billed"] },
    ],
  },

  amazon_prime: {
    merchant_key: "amazon_prime",
    display_name: "Amazon Prime",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.amazon.com/gp/primecentral/editMembership",
    source: "https://www.aeanet.org/how-to-cancel-my-amazon-prime-free-trial/",
    evidence_texts: ["cancell?ed", "membership ends", "refund"],
    steps: [
      { kind: "goto", url: "https://www.amazon.com/gp/primecentral/editMembership" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "continue" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/end membership|manage membership/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "prime membership page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "end membership" },
      { kind: "clickText", pattern: "end my benefits|continue to cancel" },
      { kind: "clickDialogButton", pattern: "end membership|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|ended)", "refund"] },
    ],
  },

  youtube_premium: {
    merchant_key: "youtube_premium",
    display_name: "YouTube Premium",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.youtube.com/paid_memberships",
    source: "https://support.google.com/youtubemusic/answer/6308278?hl=en&ref_topic=6313531",
    evidence_texts: ["cancell?ed", "deactivat", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.youtube.com/paid_memberships" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "next" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: "next" },
      { kind: "waitFor", js: `/manage membership/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "memberships page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage membership" },
      { kind: "clickText", pattern: "deactivate|turn off auto-renew" },
      { kind: "clickText", pattern: "continue" },
      { kind: "clickText", pattern: "next" },
      { kind: "clickDialogButton", pattern: "cancel|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "deactivat", "membership ends"] },
    ],
  },

  audible: {
    merchant_key: "audible",
    display_name: "Audible",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.audible.com/",
    source: "https://help.audible.com/s/article/cancel-membership?language=en_US",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.audible.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "continue" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/account details|membership details/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "account details|membership details" },
      { kind: "clickText", pattern: "cancel membership" },
      { kind: "clickText", pattern: "continue|no thanks" },
      { kind: "clickDialogButton", pattern: "confirm cancellation|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  xbox_game_pass: {
    merchant_key: "xbox_game_pass",
    display_name: "Xbox Game Pass",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://account.microsoft.com/services",
    source: "https://learn.microsoft.com/en-us/answers/questions/5428119/i-want-to-cancel-my-microsoft-store-subscription",
    evidence_texts: ["cancell?ed", "recurring billing", "turned off"],
    steps: [
      { kind: "goto", url: "https://account.microsoft.com/services" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "next" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/cancel subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "services page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "turn off recurring billing|confirm|next" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "recurring billing.{0,20}(off|turned off)"] },
    ],
  },

  playstation_plus: {
    merchant_key: "playstation_plus",
    display_name: "PlayStation Plus",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.playstation.com/",
    source: "https://www.playstation.com/en-us/support/subscriptions/cancel-playstation-plus/",
    evidence_texts: ["cancell?ed", "subscription ends"],
    steps: [
      { kind: "goto", url: "https://www.playstation.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[name="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "next" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "clickText", pattern: "account|profile" },
      { kind: "clickText", pattern: "subscription" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)"] },
    ],
  },

  google_one: {
    merchant_key: "google_one",
    display_name: "Google One",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://one.google.com/",
    source: "https://support.google.com/googleone/answer/15801606?hl=en",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://one.google.com/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "next" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: "next" },
      { kind: "waitFor", js: `/settings/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "google one page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "settings" },
      { kind: "clickText", pattern: "cancel membership" },
      { kind: "clickDialogButton", pattern: "cancel membership|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  dropbox: {
    merchant_key: "dropbox",
    display_name: "Dropbox",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.dropbox.com/",
    source: "https://www.androidauthority.com/cancel-dropbox-subscription-3205952/",
    evidence_texts: ["cancell?ed", "plan ends"],
    steps: [
      { kind: "goto", url: "https://www.dropbox.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/settings/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "settings" },
      { kind: "clickText", pattern: "cancel plan" },
      { kind: "clickText", pattern: "other|no longer need" },
      { kind: "clickDialogButton", pattern: "confirm cancel|cancel plan|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "plan (ends|will end)"] },
    ],
  },

  linkedin_premium: {
    merchant_key: "linkedin_premium",
    display_name: "LinkedIn Premium",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.linkedin.com/",
    source: "https://www.pockettactics.com/how-to/cancel-linkedin-premium",
    evidence_texts: ["cancell?ed", "premium ends"],
    steps: [
      { kind: "goto", url: "https://www.linkedin.com/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[name="session_key"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL.concat(['input[name="session_key"]']), credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL.concat(['input[name="session_password"]']), credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/premium/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "home page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "premium" },
      { kind: "clickText", pattern: "manage premium account|cancel subscription" },
      { kind: "clickText", pattern: "continue to cancel" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "premium (ends|will end)"] },
    ],
  },

  nytimes: {
    merchant_key: "nytimes",
    display_name: "The New York Times",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://myaccount.nytimes.com/seg/cancel",
    source: "https://legalclarity.org/how-to-cancel-a-new-york-times-subscription-all-methods/",
    evidence_texts: ["cancell?ed", "subscription ends"],
    steps: [
      { kind: "goto", url: "https://myaccount.nytimes.com/seg/cancel" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/cancel your subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "subscription page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel your subscription" },
      { kind: "clickText", pattern: "continue to cancel|continue" },
      { kind: "clickDialogButton", pattern: "confirm cancellation|yes,?\\s*cancel" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)"] },
    ],
  },

  washington_post: {
    merchant_key: "washington_post",
    display_name: "The Washington Post",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://subscribe.washingtonpost.com/profile/#/profile/digitalsubscription",
    source: "https://www.comparably.com/companies/the-washington-post/faqs",
    evidence_texts: ["cancell?ed", "billing ends"],
    steps: [
      { kind: "goto", url: "https://subscribe.washingtonpost.com/profile/#/profile/digitalsubscription" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/digital subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "profile page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "billing (ends|will end)"] },
    ],
  },

  wsj: {
    merchant_key: "wsj",
    display_name: "The Wall Street Journal",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution. Print/digital combos may still require a call in some regions — never fall back to a call; refuse guided instead.",
    auth: "email_password",
    account_url: "https://customercenter.wsj.com/",
    source: "https://www.19pine.ai/cancel-subscription/wall-street-journal",
    evidence_texts: ["cancell?ed", "subscription ends"],
    steps: [
      { kind: "goto", url: "https://customercenter.wsj.com/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/manage subscriptions/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "customer center" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage subscriptions" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)"] },
    ],
  },

  doordash_dashpass: {
    merchant_key: "doordash_dashpass",
    display_name: "DoorDash DashPass",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.doordash.com/",
    source: "https://help.doordash.com/en-ca/consumers/article/how-do-i-cancel-my-dashpass-subscription",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.doordash.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[type="tel"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL.concat(['input[type="tel"]']), credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/dashpass/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "home page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage dashpass" },
      { kind: "clickText", pattern: "cancel membership|end subscription" },
      { kind: "clickText", pattern: "other|no longer need" },
      { kind: "clickDialogButton", pattern: "cancel dashpass|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  uber_one: {
    merchant_key: "uber_one",
    display_name: "Uber One",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.ubereats.com/",
    source: "https://help.uber.com/en/ubereats/restaurants/article/c%C3%B3mo-cancelo-la-suscripci%C3%B3n-de-uber%C2%A0one?nodeId=32e7f8ac-07a3-462d-9784-aa6e46b3b6ab",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.ubereats.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[type="tel"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL.concat(['input[type="tel"]']), credential: "username" },
      { kind: "clickText", pattern: "next|continue" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: "next|continue" },
      { kind: "waitFor", js: `/uber one/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "home page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "uber one" },
      { kind: "clickText", pattern: "manage membership" },
      { kind: "clickText", pattern: "end membership" },
      { kind: "clickText", pattern: "leave uber one" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  instacart_plus: {
    merchant_key: "instacart_plus",
    display_name: "Instacart+",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.instacart.com/store/account/express",
    source: "https://github.com/opentermsarchive/contrib-versions/blob/HEAD/Instacart/Terms%20of%20Service.md",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.instacart.com/store/account/express" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/manage your membership/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "membership page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage your membership" },
      { kind: "clickText", pattern: "cancel membership" },
      { kind: "clickText", pattern: "continue to cancel" },
      { kind: "clickDialogButton", pattern: "confirm cancellation|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  walmart_plus: {
    merchant_key: "walmart_plus",
    display_name: "Walmart+",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.walmart.com/",
    source: "https://helpdeskgeek.com/how-to-cancel-a-walmart-plus-subscription/",
    evidence_texts: ["cancell?ed", "membership ends"],
    steps: [
      { kind: "goto", url: "https://www.walmart.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/account/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "home page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "account" },
      { kind: "clickText", pattern: "walmart\\+|walmart plus" },
      { kind: "clickText", pattern: "manage membership" },
      { kind: "clickText", pattern: "cancel membership" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)"] },
    ],
  },

  peloton: {
    merchant_key: "peloton",
    display_name: "Peloton",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.onepeloton.com/mymembership",
    source: "https://support.onepeloton.com/s/article/Peloton-Membership-How-to-Manage-Your-All-Access-Membership?language=en_AU",
    evidence_texts: ["cancell?ed", "membership ends", "access through"],
    steps: [
      { kind: "goto", url: "https://www.onepeloton.com/mymembership" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/manage/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "membership page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage" },
      { kind: "clickText", pattern: "pause or cancel|cancel membership" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "membership (ends|will end)", "access through"] },
    ],
  },

  adobe: {
    merchant_key: "adobe",
    display_name: "Adobe",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution. Annual plans cancelled after 14 days incur an early-termination fee (50% of remaining obligation) — surface it in the confirmation, never conceal it.",
    auth: "email_password",
    account_url: "https://account.adobe.com/plans",
    source: "https://helpx.adobe.com/vn_en/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html",
    evidence_texts: ["cancell?ed", "plan ends"],
    steps: [
      { kind: "goto", url: "https://account.adobe.com/plans" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "continue" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: "continue" },
      { kind: "waitFor", js: `/manage plan/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "plans page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "manage plan" },
      { kind: "clickText", pattern: "cancel your plan" },
      { kind: "clickText", pattern: "continue to cancel" },
      { kind: "clickText", pattern: "other|no longer need" },
      { kind: "clickText", pattern: "continue" },
      { kind: "clickDialogButton", pattern: "confirm cancellation|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "plan (ends|will end)"] },
    ],
  },

  microsoft_365: {
    merchant_key: "microsoft_365",
    display_name: "Microsoft 365",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://account.microsoft.com/services",
    source: "https://support.microsoft.com/en-us/office/cancel-a-microsoft-365-subscription-46e2634c-c64b-4c65-94b9-2cc9c960e91b",
    evidence_texts: ["cancell?ed", "recurring billing", "turned off"],
    steps: [
      { kind: "goto", url: "https://account.microsoft.com/services" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "clickText", pattern: "next" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/cancel subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "services page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "turn off recurring billing|confirm|next" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "recurring billing.{0,20}(off|turned off)"] },
    ],
  },

  nordvpn: {
    merchant_key: "nordvpn",
    display_name: "NordVPN",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://my.nordaccount.com/",
    source: "https://nordvpn.com/blog/how-to-cancel-nordvpn/",
    evidence_texts: ["cancell?ed", "auto-renewal"],
    steps: [
      { kind: "goto", url: "https://my.nordaccount.com/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/billing/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "billing" },
      { kind: "clickText", pattern: "subscriptions" },
      { kind: "clickText", pattern: "cancel" },
      { kind: "clickDialogButton", pattern: "cancel auto-renewal|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "auto-renewal.{0,20}(off|cancelled)"] },
    ],
  },

  mcafee: {
    merchant_key: "mcafee",
    display_name: "McAfee",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://myaccount.mcafee.com/",
    source: "https://www.mcafee.com/support/s/article/000001781?language=it",
    evidence_texts: ["cancell?ed", "auto-renewal"],
    steps: [
      { kind: "goto", url: "https://myaccount.mcafee.com/" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/subscriptions/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "subscriptions" },
      { kind: "clickText", pattern: "cancel" },
      { kind: "clickText", pattern: "cancel auto-renewal" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "auto-renewal.{0,20}(off|cancelled)"] },
    ],
  },

  paramount_plus: {
    merchant_key: "paramount_plus",
    display_name: "Paramount+",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.paramountplus.com/account",
    source: "https://support.paramountplus.com/s/article/PI-How-do-I-cancel-my-subscription?language=en_US",
    evidence_texts: ["cancell?ed", "subscription ends"],
    steps: [
      { kind: "goto", url: "https://www.paramountplus.com/account" },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/cancel subscription/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "cancel subscription" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "subscription (ends|will end)"] },
    ],
  },

  peacock: {
    merchant_key: "peacock",
    display_name: "Peacock",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution.",
    auth: "email_password",
    account_url: "https://www.peacocktv.com/",
    source: "https://www.peacocktv.com/help/article/cancellation",
    evidence_texts: ["cancell?ed", "plan ends"],
    steps: [
      { kind: "goto", url: "https://www.peacocktv.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL, credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/account/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "home page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "account" },
      { kind: "clickText", pattern: "plans & payments|plans and payments" },
      { kind: "clickText", pattern: "cancel all subscriptions|cancel plan" },
      { kind: "clickDialogButton", pattern: "confirm|yes" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["cancell?ed", "plan (ends|will end)"] },
    ],
  },

  comed: {
    merchant_key: "comed",
    display_name: "ComEd",
    verified: false,
    verification_note: "UNVERIFIED — needs live Browserbase validation before execution. This is utility disconnection (Start Stop Move → Stop Service), not a subscription — the effective date and final bill apply.",
    auth: "email_password",
    account_url: "https://www.comed.com/",
    source: "https://donotpay.com/learn/cancel-comed/",
    evidence_texts: ["request received", "confirmation", "stop date"],
    steps: [
      { kind: "goto", url: "https://www.comed.com/" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `!!document.querySelector('input[type="email"], input[name*="user" i]')`, timeoutMs: 25000, label: "login form" },
      { kind: "typeInto", selectors: EMAIL_SEL.concat(['input[name*="user" i]']), credential: "username" },
      { kind: "typeInto", selectors: PASS_SEL, credential: "password" },
      { kind: "clickText", pattern: LOGIN_CLICK },
      { kind: "waitFor", js: `/start stop move/i.test(document.body.innerText || "")`, timeoutMs: 25000, label: "my account page" },
      { kind: "screenshot", label: "account" },
      { kind: "clickText", pattern: "start stop move" },
      { kind: "clickText", pattern: "stop service" },
      { kind: "clickText", pattern: "submit|confirm" },
      { kind: "screenshot", label: "confirmation" },
      { kind: "requireText", patterns: ["request.{0,20}received", "confirmation", "stop date"] },
    ],
  },
};

// ================= guided directory =================
// Shown to the user when the agent cannot or may not act. deep_link is the
// merchant's own account page (search-confirmed); steps are the human flow.

export const merchantDirectory: Record<string, DirectoryEntry> = {
  devin: {
    merchant_key: "devin",
    display_name: "Devin",
    deep_link: "https://app.devin.ai/",
    steps: [
      "Sign in at app.devin.ai (email → verification code).",
      "Open Settings → Billing.",
      "Click Cancel subscription and confirm in the dialog.",
      "Save the confirmation text.",
    ],
    source: "agent-exec dedicated implementation (2026-09-26 recon)",
  },
  spotify: {
    merchant_key: "spotify",
    display_name: "Spotify",
    deep_link: "https://www.spotify.com/account/subscription/",
    steps: ["Sign in, go to your Subscription page, click Cancel Premium and confirm."],
    source: "https://legalclarity.org/how-to-cancel-spotify-premium-and-get-a-refund/",
  },
  netflix: {
    merchant_key: "netflix",
    display_name: "Netflix",
    deep_link: "https://netflix.com/YourAccount",
    steps: ["Sign in, go to Account, click Cancel Membership and finish the cancellation."],
    source: "https://usesparrow.com/blog/how-to-cancel-netflix-subscriptions/",
  },
  hulu: {
    merchant_key: "hulu",
    display_name: "Hulu",
    deep_link: "https://hulu.com/account",
    steps: ["Sign in, open your Account, click Cancel Subscription and confirm."],
    source: "https://tvplusstream.com/how-to-cancel-hulu/",
  },
  disney_plus: {
    merchant_key: "disney_plus",
    display_name: "Disney+",
    deep_link: "https://www.disneyplus.com/account",
    steps: ["Sign in, open Account → Subscriptions, click Cancel Subscription, pick a reason, confirm."],
    source: "https://github.com/peerjakobsen/smartspender/blob/HEAD/subscriptions/disney-plus.md",
  },
  max: {
    merchant_key: "max",
    display_name: "Max",
    deep_link: "https://max.com/subscription",
    steps: ["Sign in, go to Subscription, choose Manage Subscription → Cancel Subscription, confirm."],
    source: "https://www.engadget.com/entertainment/how-to-cancel-your-hbo-max-subscription-155047857.html",
  },
  amazon_prime: {
    merchant_key: "amazon_prime",
    display_name: "Amazon Prime",
    deep_link: "https://www.amazon.com/gp/primecentral/editMembership",
    steps: ["Sign in, open Prime Membership settings, click End membership → End my benefits, confirm."],
    source: "https://www.aeanet.org/how-to-cancel-my-amazon-prime-free-trial/",
  },
  youtube_premium: {
    merchant_key: "youtube_premium",
    display_name: "YouTube Premium",
    deep_link: "https://www.youtube.com/paid_memberships",
    steps: ["Sign in, open Paid memberships → Manage membership → Deactivate, continue through the screens and cancel."],
    source: "https://support.google.com/youtubemusic/answer/6308278?hl=en&ref_topic=6313531",
  },
  audible: {
    merchant_key: "audible",
    display_name: "Audible",
    deep_link: "https://www.audible.com/",
    steps: ["Sign in, click your name → Account details (Membership details), click Cancel membership, Continue and confirm. A confirmation email is sent."],
    source: "https://help.audible.com/s/article/cancel-membership?language=en_US",
  },
  xbox_game_pass: {
    merchant_key: "xbox_game_pass",
    display_name: "Xbox Game Pass",
    deep_link: "https://account.microsoft.com/services",
    steps: ["Sign in at account.microsoft.com/services, select Cancel subscription, then Turn off recurring billing."],
    source: "https://learn.microsoft.com/en-us/answers/questions/5428119/i-want-to-cancel-my-microsoft-store-subscription",
  },
  playstation_plus: {
    merchant_key: "playstation_plus",
    display_name: "PlayStation Plus",
    deep_link: "https://www.playstation.com/",
    steps: ["Sign in to Account Management, open Subscription, select Cancel Subscription."],
    source: "https://www.playstation.com/en-us/support/subscriptions/cancel-playstation-plus/",
  },
  google_one: {
    merchant_key: "google_one",
    display_name: "Google One",
    deep_link: "https://one.google.com/",
    steps: ["Sign in at one.google.com, open Settings, click Cancel membership and confirm. If billed through a third party, cancel with them instead."],
    source: "https://support.google.com/googleone/answer/15801606?hl=en",
  },
  dropbox: {
    merchant_key: "dropbox",
    display_name: "Dropbox",
    deep_link: "https://www.dropbox.com/",
    steps: ["Sign in, click your avatar → Settings → Plan, click Cancel plan, pick a reason, confirm."],
    source: "https://www.androidauthority.com/cancel-dropbox-subscription-3205952/",
  },
  linkedin_premium: {
    merchant_key: "linkedin_premium",
    display_name: "LinkedIn Premium",
    deep_link: "https://www.linkedin.com/",
    steps: ["Sign in, click Me → Access My Premium → Manage Premium account → Cancel subscription → Continue to cancel, confirm. If billed via Apple, cancel in the App Store instead."],
    source: "https://www.pockettactics.com/how-to/cancel-linkedin-premium",
  },
  nytimes: {
    merchant_key: "nytimes",
    display_name: "The New York Times",
    deep_link: "https://myaccount.nytimes.com/seg/cancel",
    steps: ["Sign in, open Subscription Overview, click Cancel your Subscription, continue through the retention screens to the final confirmation."],
    source: "https://legalclarity.org/how-to-cancel-a-new-york-times-subscription-all-methods/",
  },
  washington_post: {
    merchant_key: "washington_post",
    display_name: "The Washington Post",
    deep_link: "https://subscribe.washingtonpost.com/profile/#/profile/digitalsubscription",
    steps: ["Sign in, open your Account Profile, cancel the digital subscription. Billing ends after the current cycle. Print/digital combos may need support."],
    source: "https://www.comparably.com/companies/the-washington-post/faqs",
  },
  wsj: {
    merchant_key: "wsj",
    display_name: "The Wall Street Journal",
    deep_link: "https://customercenter.wsj.com/",
    steps: ["Sign in to the Customer Center, open Manage Subscriptions, select Cancel Subscription and confirm."],
    billing_note: "Some print/digital combos historically required a call — Upmore never places calls; use online chat if the site offers it.",
    source: "https://www.19pine.ai/cancel-subscription/wall-street-journal",
  },
  doordash_dashpass: {
    merchant_key: "doordash_dashpass",
    display_name: "DoorDash DashPass",
    deep_link: "https://www.doordash.com/",
    steps: ["Sign in, open your account → Manage DashPass → Cancel Membership / End Subscription, pick a reason, Cancel DashPass."],
    source: "https://help.doordash.com/en-ca/consumers/article/how-do-i-cancel-my-dashpass-subscription",
  },
  uber_one: {
    merchant_key: "uber_one",
    display_name: "Uber One",
    deep_link: "https://www.ubereats.com/",
    steps: ["Sign in, open Uber One → Manage Membership → End Membership → Leave Uber One. Cancel at least 48 hours before the billing date."],
    source: "https://help.uber.com/en/ubereats/restaurants/article/c%C3%B3mo-cancelo-la-suscripci%C3%B3n-de-uber%C2%A0one?nodeId=32e7f8ac-07a3-462d-9784-aa6e46b3b6ab",
  },
  instacart_plus: {
    merchant_key: "instacart_plus",
    display_name: "Instacart+",
    deep_link: "https://www.instacart.com/store/account/express",
    steps: ["Sign in, open Your Instacart+ membership → Manage your membership → Cancel membership → Continue to cancel → Confirm cancellation."],
    source: "https://github.com/opentermsarchive/contrib-versions/blob/HEAD/Instacart/Terms%20of%20Service.md",
  },
  walmart_plus: {
    merchant_key: "walmart_plus",
    display_name: "Walmart+",
    deep_link: "https://www.walmart.com/",
    steps: ["Sign in, open Account → Walmart+ → Manage membership → Cancel membership, confirm."],
    source: "https://helpdeskgeek.com/how-to-cancel-a-walmart-plus-subscription/",
  },
  peloton: {
    merchant_key: "peloton",
    display_name: "Peloton",
    deep_link: "https://www.onepeloton.com/mymembership",
    steps: ["Sign in, open Manage → Pause or cancel, cancel the membership. Access continues through the end of the billing period."],
    source: "https://support.onepeloton.com/s/article/Peloton-Membership-How-to-Manage-Your-All-Access-Membership?language=en_AU",
  },
  adobe: {
    merchant_key: "adobe",
    display_name: "Adobe",
    deep_link: "https://account.adobe.com/plans",
    steps: ["Sign in at account.adobe.com/plans, open Manage plan → Cancel your plan → Continue to cancel, pick a reason, Continue, confirm."],
    billing_note: "Annual plans cancelled after 14 days incur an early-termination fee (50% of the remaining obligation) — it is shown during cancellation, not hidden.",
    source: "https://helpx.adobe.com/vn_en/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html",
  },
  microsoft_365: {
    merchant_key: "microsoft_365",
    display_name: "Microsoft 365",
    deep_link: "https://account.microsoft.com/services",
    steps: ["Sign in at account.microsoft.com/services, select Cancel subscription, then Turn off recurring billing. Business plans cancel in the Microsoft 365 admin center."],
    source: "https://support.microsoft.com/en-us/office/cancel-a-microsoft-365-subscription-46e2634c-c64b-4c65-94b9-2cc9c960e91b",
  },
  nordvpn: {
    merchant_key: "nordvpn",
    display_name: "NordVPN",
    deep_link: "https://my.nordaccount.com/",
    steps: ["Sign in to your Nord Account, open Billing → Subscriptions, click Cancel, then Cancel auto-renewal."],
    source: "https://nordvpn.com/blog/how-to-cancel-nordvpn/",
  },
  mcafee: {
    merchant_key: "mcafee",
    display_name: "McAfee",
    deep_link: "https://myaccount.mcafee.com/",
    steps: ["Sign in at myaccount.mcafee.com, open Subscriptions, click Cancel, scroll and click Cancel Auto-Renewal. Turn off auto-renewal at least 30 days before term end."],
    source: "https://www.mcafee.com/support/s/article/000001781?language=it",
  },
  paramount_plus: {
    merchant_key: "paramount_plus",
    display_name: "Paramount+",
    deep_link: "https://www.paramountplus.com/account",
    steps: ["Sign in, open your Account page, click Cancel Subscription and follow the prompts. If billed through a third party, cancel with them instead."],
    source: "https://support.paramountplus.com/s/article/PI-How-do-I-cancel-my-subscription?language=en_US",
  },
  peacock: {
    merchant_key: "peacock",
    display_name: "Peacock",
    deep_link: "https://www.peacocktv.com/",
    steps: ["Sign in at peacocktv.com, open your Account → Plans & Payments → Cancel All Subscriptions (or Cancel Plan), confirm. A confirmation email is sent."],
    source: "https://www.peacocktv.com/help/article/cancellation",
  },
  comed: {
    merchant_key: "comed",
    display_name: "ComEd",
    deep_link: "https://www.comed.com/",
    steps: ["Sign in to ComEd My Account, go to My Service → Start Stop Move → Stop Service, enter the stop date and confirm."],
    billing_note: "Utility disconnection, not a subscription — the effective date and a final bill apply.",
    source: "https://donotpay.com/learn/cancel-comed/",
  },

  // ---- guided/fallback only: the agent cannot complete these ----
  apple_subscriptions: {
    merchant_key: "apple_subscriptions",
    display_name: "Apple subscriptions",
    deep_link: "https://support.apple.com/en-us/HT202039",
    human_only: true,
    steps: [
      "On your iPhone or iPad: Settings → [your name] → Subscriptions, tap the subscription, then Cancel Subscription.",
      "On a Mac: App Store → [your name] → Account Settings → Subscriptions → Manage → Cancel.",
    ],
    billing_note: "Apple-billed subscriptions (Apple Music, iCloud+, App Store apps) can only be cancelled on an Apple device or Mac — a browser agent cannot do this. If Upmore detected the charge, the actual biller is Apple.",
    source: "https://support.apple.com/en-us/HT202039",
  },
  icloud_plus: {
    merchant_key: "icloud_plus",
    display_name: "iCloud+",
    deep_link: null,
    human_only: true,
    steps: [
      "On iPhone/iPad: Settings → [your name] → iCloud → Manage Account Storage → Change Storage Plan → Downgrade Options → sign in with your Apple Account → choose the free 5GB plan.",
      "On a Mac: System Settings → [your name] → iCloud → Manage → Change Storage Plan → Downgrade Options → 5GB.",
    ],
    billing_note: "iCloud+ storage is managed on-device under the Apple Account — device-only, cannot be cancelled by a browser agent.",
    source: "https://www.knowtechie.com/how-to-cancel-icloud-storage-plan/",
  },
  planet_fitness: {
    merchant_key: "planet_fitness",
    display_name: "Planet Fitness",
    deep_link: "https://www.planetfitness.com/",
    human_only: true,
    steps: [
      "Cancel in person at your home club, or send certified mail to the club.",
      "Bring your membership ID and a photo ID, and get written confirmation of the cancellation.",
    ],
    billing_note: "Planet Fitness generally requires an in-person visit or certified mail — online cancellation is not reliably available.",
    source: "https://legalclarity.org/how-to-cancel-planet-fitness-membership-without-paying/",
  },
  la_fitness: {
    merchant_key: "la_fitness",
    display_name: "LA Fitness / Esporta",
    deep_link: "https://www.lafitness.com/",
    human_only: true,
    steps: [
      "Cancel in person at the club, or send certified/registered mail to: P.O. Box 54170, Irvine, CA 92619.",
      "Keep your receipt — the FTC sued LA Fitness (Aug 20, 2025) over cancellation hurdles, so written proof matters.",
    ],
    billing_note: "Online cancellation was reportedly introduced, but hurdles are documented; the safe path is in person or certified mail.",
    source: "https://sgbonline.com/la-fitness-owner-sued-over-hurdles-to-canceling-memberships/",
  },
  att: {
    merchant_key: "att",
    display_name: "AT&T",
    deep_link: "https://www.att.com/myatt",
    human_only: true,
    steps: [
      "Sign in at att.com/myatt and check whether your service offers online cancellation.",
      "Most AT&T services require a call or chat with support to cancel.",
    ],
    billing_note: "Upmore never places phone calls — if a call is required, it has to be yours. Ask for written confirmation of the cancellation.",
    source: "https://www.att.com/myatt",
  },
  tmobile: {
    merchant_key: "tmobile",
    display_name: "T-Mobile",
    deep_link: "https://www.t-mobile.com/",
    human_only: true,
    steps: [
      "Add-ons and services: sign in → Account Hub → Manage services, and deselect what you no longer want.",
      "Cancelling a full line requires a call (611 from your T-Mobile phone) or a store visit.",
    ],
    billing_note: "Upmore never places phone calls — line cancellation has to be yours.",
    source: "https://www.t-mobile.com/support/business/account-hub-manage-services",
  },
  verizon: {
    merchant_key: "verizon",
    display_name: "Verizon",
    deep_link: "https://www.verizon.com/",
    steps: [
      "Add-ons and +play subscriptions: sign in → My Plans & Services → Add-ons & Accessories → Action → Remove.",
      "Cancelling mobile service itself usually requires support contact.",
    ],
    source: "https://www.verizon.com/support/entertainment-play-faqs/",
  },
  xfinity: {
    merchant_key: "xfinity",
    display_name: "Xfinity",
    deep_link: "https://www.xfinity.com/support/cancel-service",
    human_only: true,
    steps: [
      "Fill in the online cancellation form at xfinity.com/support/cancel-service.",
      "Xfinity will call you back within 2 business days — you must answer and confirm with them. The cancellation is NOT final until they confirm.",
      "Return any rented equipment and keep the return receipt.",
    ],
    billing_note: "The online form only starts the process; a confirmation call/chat is required. Upmore never places calls.",
    source: "https://ExplainCharges.com/how-to-cancel-xfinity-service/",
  },
  siriusxm: {
    merchant_key: "siriusxm",
    display_name: "SiriusXM",
    deep_link: "https://www.siriusxm.com/contactus",
    human_only: true,
    steps: [
      "Sign in and use online live chat at siriusxm.com/contactus, or call 1-866-635-2349.",
      "Ask for a confirmation email of the cancellation.",
    ],
    billing_note: "Online self-service cancellation is not reliably available. Upmore never places calls — chat is the online path.",
    source: "https://www.siriusxm.com/content/dam/sxm-com/pdf/corporate-pdf/Customer-Agreement-ENG-app.pdf?desktop=yes",
  },
};

// Universal fallback for merchants the catalog does not know.
export const GENERIC_FALLBACK: DirectoryEntry = {
  merchant_key: "unknown",
  display_name: "This merchant",
  deep_link: null,
  steps: [
    "Find the merchant's official website (type it yourself — never use a search ad).",
    "Sign in to your account.",
    "Open Account, Billing, or Subscriptions.",
    "Cancel the renewal or auto-renewal, and confirm.",
    "Save the visible confirmation — text and a screenshot.",
  ],
  billing_note: "Upmore does not have a cancellation path for this merchant yet, so here is the universal self-serve flow.",
  source: "Upmore universal guided fallback",
};

// ================= merchant-name normalization =================
// Statement descriptors are noisy ("SPOTIFY USA", "MICROSOFT*XBOX",
// "GOOGLE *YOUTUBE", "PLANET FITNESS 123"). normalizeMerchant strips
// punctuation, transaction numbers, and common suffixes, then maps via
// aliases or the catalog keys. Returns "unknown" when nothing matches.

const ALIASES: Record<string, string> = {
  "spotify": "spotify",
  "netflix": "netflix",
  "hulu": "hulu",
  "disney plus": "disney_plus",
  "disneyplus": "disney_plus",
  "disney": "disney_plus",
  "max": "max",
  "hbo max": "max",
  "hbomax": "max",
  "hbo": "max",
  "amazon prime": "amazon_prime",
  "amzn prime": "amazon_prime",
  "prime": "amazon_prime",
  "youtube premium": "youtube_premium",
  "google youtube": "youtube_premium",
  "youtube": "youtube_premium",
  "audible": "audible",
  "xbox game pass": "xbox_game_pass",
  "microsoft xbox": "xbox_game_pass",
  "xbox": "xbox_game_pass",
  "playstation plus": "playstation_plus",
  "playstation": "playstation_plus",
  "google one": "google_one",
  "dropbox": "dropbox",
  "linkedin premium": "linkedin_premium",
  "linkedin": "linkedin_premium",
  "new york times": "nytimes",
  "nytimes": "nytimes",
  "nyt": "nytimes",
  "washington post": "washington_post",
  "washingtonpost": "washington_post",
  "wall street journal": "wsj",
  "wsj": "wsj",
  "dashpass": "doordash_dashpass",
  "doordash": "doordash_dashpass",
  "uber one": "uber_one",
  "instacart plus": "instacart_plus",
  "instacart": "instacart_plus",
  "walmart plus": "walmart_plus",
  "walmart": "walmart_plus",
  "peloton": "peloton",
  "adobe": "adobe",
  "microsoft 365": "microsoft_365",
  "nordvpn": "nordvpn",
  "mcafee": "mcafee",
  "paramount plus": "paramount_plus",
  "paramountplus": "paramount_plus",
  "paramount": "paramount_plus",
  "peacock": "peacock",
  "apple subscriptions": "apple_subscriptions",
  "apple": "apple_subscriptions",
  "itunes": "apple_subscriptions",
  "icloud plus": "icloud_plus",
  "icloud": "icloud_plus",
  "planet fitness": "planet_fitness",
  "la fitness": "la_fitness",
  "esporta": "la_fitness",
  "at t": "att",
  "att": "att",
  "t mobile": "tmobile",
  "tmobile": "tmobile",
  "verizon": "verizon",
  "xfinity": "xfinity",
  "comcast": "xfinity",
  "siriusxm": "siriusxm",
  "sirius xm": "siriusxm",
  "sirius": "siriusxm",
  "comed": "comed",
  "devin": "devin",
  "cognition": "devin",
};

export function normalizeMerchant(raw: string): string {
  let s = (raw ?? "").toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");       // punctuation, *, ., -, etc.
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim(); // transaction numbers
  s = s.replace(/\s+(usa|inc|llc|ltd|corp|co|com|net|org)\s*$/, "").trim(); // common suffixes
  if (!s) return "unknown";
  if (ALIASES[s]) return ALIASES[s];
  const key = s.replace(/\s+/g, "_");
  if (playbookRegistry[key] || merchantDirectory[key]) return key;
  return "unknown";
}

export type Resolution =
  | { merchant_key: string; path: "playbook"; playbook: MerchantPlaybook; directory: DirectoryEntry }
  | { merchant_key: string; path: "guided"; playbook?: MerchantPlaybook; directory: DirectoryEntry };

export function resolveMerchant(rawName: string): Resolution {
  const key = normalizeMerchant(rawName);
  if (key === "unknown") {
    return { merchant_key: "unknown", path: "guided", directory: GENERIC_FALLBACK };
  }
  const playbook = playbookRegistry[key];
  const directory = merchantDirectory[key] ?? GENERIC_FALLBACK;
  if (playbook && playbook.verified === true) {
    return { merchant_key: key, path: "playbook", playbook, directory };
  }
  return { merchant_key: key, path: "guided", playbook, directory };
}
