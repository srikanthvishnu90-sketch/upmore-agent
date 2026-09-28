// Verified cancellation paths for common subscriptions.
// Verification status (2026-09-23): entries WITH a url had the URL confirmed
// on the merchant's own official help/support page or in the merchant's own
// terms (Spotify's ToS links its support article). Entries WITHOUT a url
// carry steps from widely-reported cancel flows that were NOT personally
// verified against an official page — never a guessed URL.
// Production rule: never invent a URL.
// Interface kept stable — ~30 more entries will be merged later, so keep
// new keys lowercase display-name keys and reuse this shape.

export interface CancelPath {
  url?: string;
  steps: string[];
  phone?: string;
  retention_warning: string;
}

export const CANCEL_PATHS: Record<string, CancelPath> = {
  netflix: {
    steps: [
      "Sign in at netflix.com and open your profile menu (top right).",
      "Choose Account — find the Membership & Billing section.",
      "Select Cancel Membership, then click Finish Cancellation to confirm.",
    ],
    retention_warning:
      "Netflix will push a pause or a cheaper ad plan — fine if you want it, but if you're done, keep clicking through. " +
      "No refunds for partial months; access runs until the end of the billing period. " +
      "If Netflix isn't your billing party (Apple, Google Play, a carrier, a bundle), you must cancel with them instead — your Netflix Account page will say who bills you.",
  },
  spotify: {
    url: "https://support.spotify.com/article/cancel-premium/",
    steps: [
      "Open your Spotify account page in a browser (you cannot cancel inside the app) and go to 'Manage your plan'.",
      "Select 'Cancel subscription' and confirm.",
      "If you don't see the option, check the Payment section — your plan is billed through a partner (Apple, Google Play, your carrier) and you cancel with them instead.",
    ],
    retention_warning:
      "Your Premium stays active until the next billing date, then the account switches to free — no partial-month refunds. " +
      "You keep your playlists and saved music on the free tier. " +
      "Family/Duo plan managers: canceling ends Premium for every member, so warn them first.",
  },
  "amazon prime": {
    url: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GU8AWX4GDKM7QGTE",
    steps: [
      "On Amazon, open Account & Lists and choose Your Prime Membership.",
      "Choose Manage membership, then End membership.",
      "Click Continue to cancel, then End on [date] to confirm.",
    ],
    retention_warning:
      "Amazon will show a list of everything you'd lose and may pitch a cheaper monthly switch. " +
      "If you're early in an annual cycle, ask about a partial refund — don't assume you get one or don't.",
  },
  hulu: {
    steps: [
      "Sign in at hulu.com (browser, not the app) and open Account from your profile menu.",
      "Under Your Subscription, select Cancel.",
      "Click Continue to Cancel — you will have to do this about three times — then Cancel Subscription to finish.",
    ],
    retention_warning:
      "Hulu layers up to three 'Continue to Cancel' screens plus a pause offer — that repetition is the dark pattern. " +
      "Click through every one until you see the final confirmation. Service runs until the end of the billing period. " +
      "Billed by Apple, Google Play, Roku, or another provider? You must cancel there instead.",
  },
  "disney+": {
    steps: [
      "Sign in at disneyplus.com, tap your profile icon, and choose Account.",
      "Under Subscription, select your plan and choose Cancel Subscription.",
      "Pick a reason, then Complete Cancellation to confirm.",
    ],
    retention_warning:
      "Disney+ gives no refunds for the remaining period — you keep access until the cycle ends either way. " +
      "If you subscribed through Apple, Google Play, or Roku, cancel there instead.",
  },
  "youtube premium": {
    url: "https://support.google.com/youtube/answer/6308278",
    steps: [
      "Go to youtube.com/paid_memberships and click Manage membership.",
      "Click Deactivate, then Continue to cancel.",
      "Select your reason for canceling, click Next, then Yes, cancel.",
    ],
    retention_warning:
      "You'll be offered a pause and plan-downgrade options — fine to take if you want them, but to fully cancel, keep going. " +
      "Benefits run until the end of the billing period. Billed by Apple or Google Play? Cancel in that app store's subscription settings instead.",
  },
  "apple music": {
    url: "https://support.apple.com/118428",
    steps: [
      "On iPhone or iPad: Settings → your name → Subscriptions.",
      "Select Apple Music and tap Cancel Subscription, then confirm.",
      "On a Mac: App Store → your name (bottom left) → Account Settings → Manage next to Subscriptions → Edit → Cancel Subscription.",
    ],
    retention_warning:
      "Canceling an Apple One bundle hits every service inside it — check what you still use first. " +
      "If Apple Music isn't listed under Subscriptions, Apple isn't billing you — cancel with whoever is (your carrier, the App Store under a different Apple Account, etc.).",
  },
  "icloud+": {
    steps: [
      "On iPhone or iPad: Settings → your name → Subscriptions → iCloud+ → Cancel Subscription, or downgrade the plan instead.",
      "To downgrade storage only: Settings → your name → iCloud → Manage Account Storage → Change Storage Plan → Downgrade Options.",
      "Pick the free 5GB plan and confirm — make sure your backups and photos fit first.",
    ],
    retention_warning:
      "Downgrading iCloud storage can break backups and photo sync if your data exceeds the new limit — " +
      "confirm your photos are downloaded somewhere before you downgrade.",
  },
  audible: {
    url: "https://help.audible.com/s/article/cancel-membership?language=en_US",
    steps: [
      "Sign in on the Audible WEBSITE (the app cannot cancel) and click your name in the top navigation.",
      "Select Membership details, then select Cancel membership.",
      "Select Confirm cancellation and keep going until you reach the confirmation page.",
    ],
    retention_warning:
      "Audible will offer a pause or a discounted retention deal — take the pause if you just have a backlog. " +
      "Unused credits expire when the membership ends, but every title you already bought with credits or cash stays yours forever.",
  },
  "new york times": {
    steps: [
      "Sign in at nytimes.com, open Account, then Subscription, and choose Cancel.",
      "If the cancel option is missing or loops you around, start a chat with Customer Care and ask them to cancel — get a written confirmation.",
    ],
    retention_warning:
      "NYT often routes you through a chat agent who will offer a lower rate to stay. If you accept it, " +
      "note the exact new price and its end date — the promo expires and the price jumps back. Confirm the final price in writing.",
  },
  siriusxm: {
    url: "https://listenercare.siriusxm.com/prweb/autoredirect/app/ExternalKM/help/SupportCenter/article/KC-1969/How-do-I-manage-or-cancel-my-service?",
    phone: "1-866-635-8641",
    steps: [
      "In SiriusXM's Online Account Center, open the Subscriptions tab and follow the prompts to cancel — or use the chat icon (lower right), or call 1-866-635-8641.",
      "State clearly: 'I want to cancel my subscription, effective today.' Decline every offer.",
      "Get a confirmation number and a written confirmation email before you hang up.",
    ],
    retention_warning:
      "The hardest cancel on this list: expect a gauntlet of retention offers on chat and phone. " +
      "Stay polite, repeat 'no thank you, please complete the cancellation,' and do not hang up without a confirmation number. " +
      "If billed through Apple or Google Play, cancel there instead — SiriusXM cannot touch it.",
  },
  "microsoft 365": {
    url: "https://support.microsoft.com/account-billing/how-to-cancel-your-microsoft-subscription-c2c6b0e3-cab3-cb98-d83e-c9ad54620530",
    steps: [
      "Sign in to your Microsoft account and find your subscription, then select Manage.",
      "On the next page, select Cancel and follow the prompts.",
      "If you see 'Turn on recurring billing' instead of a Manage link, your subscription is already set to expire on the shown date — nothing further to do.",
    ],
    retention_warning:
      "Microsoft will offer plan switches or pauses before letting you cancel — fine to take if you want them. " +
      "Billed through Apple or a third party? You must cancel there instead.",
  },
  "xbox game pass": {
    url: "https://support.microsoft.com/account-billing/how-to-cancel-your-microsoft-subscription-c2c6b0e3-cab3-cb98-d83e-c9ad54620530",
    steps: [
      "Sign in to your Microsoft account and find your Game Pass subscription, then select Manage.",
      "On the next page, select Cancel and follow the prompts.",
      "If you see 'Turn on recurring billing' instead of a Manage link, the subscription is already set to expire — nothing further to do.",
    ],
    retention_warning:
      "Access runs until the end of the billing period; any stacked prepaid time stays until it runs out. " +
      "Billed through a third party? Cancel with them instead.",
  },
  "google one": {
    url: "https://support.google.com/googleone/answer/16897381?hl=en&co=GENIE.Platform%3DDesktop",
    steps: [
      "On your computer, go to Google One.",
      "Click Settings, then Cancel membership.",
      "Click Cancel membership again to confirm — you'll get a confirmation that it's canceled.",
    ],
    retention_warning:
      "You keep paid storage benefits until the end of the billing period, then drop to the free 15GB — " +
      "make sure your stored files fit in 15GB before the downgrade takes effect.",
  },
  "linkedin premium": {
    url: "https://www.linkedin.com/help/linkedin/answer/a551618?hcppcid=search",
    steps: [
      "Cancel from the LinkedIn desktop website or the LinkedIn mobile app on an Android device — cancellation is not available in the iOS app.",
      "If you bought Premium on iOS via mobile web, use LinkedIn on desktop to cancel.",
      "After canceling, the plan expires at the end of the current billing cycle and you return to a free Basic account — you keep your profile, connections, and data.",
    ],
    retention_warning:
      "You lose all Premium features at the end of the billing cycle. The cancel path depends on where you bought it — desktop/Android only for direct purchases.",
  },
  "playstation plus": {
    url: "https://www.playstation.com/en-us/support/subscriptions/cancel-playstation-plus/",
    steps: [
      "Web browser: sign in to Account Management, select Subscription from the left menu, then Cancel Subscription next to PlayStation Plus.",
      "PS5: Settings → Users and Accounts → Account → Payment and Subscriptions → Subscriptions → PlayStation Plus → Cancel Subscription.",
    ],
    retention_warning:
      "Benefits run until the end of the billing period. Check what lapses on cancel (e.g. monthly-games access) before you confirm.",
  },
};
