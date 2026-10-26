# Trainee: connectors and credentials

**How the best products do it, and the design for Trainee**

Prepared 2026-10-26 for the owner (Vishnu). This covers:
- how leading agents and integration vendors connect user accounts and handle secrets;
- what job-application agents actually do;
- the fallbacks when no connector exists;
- a concrete design for Trainee: Telegram-first chat plus a web dashboard, under the rules in `CLAUDE.md` (exact-payload approval, OpenAI only, no LinkedIn or Indeed automation, no captcha solving, never a password or one-time code through chat).

**How to read this.** Every factual claim links to its source. Facts that change (prices, limits, dates) are dated. "Inference" marks my reasoning rather than a sourced fact. Vendor and competitor blogs are labeled, because they are advocacy.

**Limits of the evidence.**
- Reddit, LinkedIn Help pages, and Instinct's own terms and privacy pages could not be fetched (robots or allowlist). Complaints therefore come from Trustpilot pages, store listings and dated secondary compilations. Instinct facts come from third-party reviews that quote its terms.
- Prices are list prices on the date fetched (2026-10-26 unless noted). The "at 100k / 1M users" figures are my extrapolations under stated assumptions, not quotes.

---

## 0. The answer on one page

**Platforms.**
- **Build the core in-house.** That means Gmail, Outlook mail, Google Calendar, Outlook Calendar, and the resume file pickers. Use your own Google and Microsoft OAuth clients, your own push pipeline (Gmail Pub/Sub watch and Graph change notifications), and your own token vault (KMS envelope encryption). Four reasons:
  - Google's restricted-scope verification and annual security assessment are your burden with or without a vendor.
  - Emailed codes must arrive inside D-021's 15-minute window, and vendor polling can take up to about 15 minutes.
  - At 1M users, vendor list prices run from about $90k to $3M a month. The Google and Microsoft APIs themselves are free.
  - Composio says token export is not supported, and Smithery's shutdown came with no stated token migration. Only Nango documents export. Without export, leaving means every user has to reconnect.
- **Long tail.** For the connectors you add later, use Composio behind an internal connector interface, with your own OAuth apps.
- **If you want a vendor even for the core plumbing,** use Nango, because it exports and imports tokens.
- **Avoid four vendors.** Pipedream is now owned by Workday and charges per user. Zapier charges per task. Paragon and Merge are built for business-to-business tenants. Smithery shuts down its connection services on 2026-10-31.

**Top 10 connectors, in order:**
1. Gmail (read-only, push)
2. Outlook / Microsoft 365 mail (Graph)
3. Resume intake: chat upload, Google Drive Picker (`drive.file`), OneDrive picker
4. The Trainee extension in the person's own browser, as the "ATS connector" (Workday, iCIMS, Taleo, SuccessFactors)
5. Google Calendar (free/busy plus a Trainee-created interviews calendar)
6. Outlook Calendar
7. LinkedIn data-export import
8. An opt-in Trainee applicant relay address
9. Handshake through share, alert emails and extension assist
10. Password-manager handoff in the person's browser

**Credentials.**
- OAuth only, and server-side tokens encrypted per user under KMS, decrypted only in one connector-broker service. The model never sees a token.
- Trainee never holds ATS passwords. The person's browser or password manager signs in (D-013(b)).
- One-time codes are read just in time from the inbox or relay address, filled once, never stored and never shown (D-021, D-029).
- A chat secret-scrubber deletes any password or code a user pastes into Telegram.
- Disconnecting deletes the data (crypto-shredding).

**Fallback ladder.** In order: data Trainee already has; a one-tap connector offered just in time; the person's own browser (extension); forward or share into Trainee; upload or export import; paste with read-back confirmation; a prefilled "do it with me" link; ask for one step, then resume; honest refusal with the 30-second manual path.

**Why competitors feel poor or inconsistent.**
1. They promise more than they cover, and they fail silently.
2. They submit without the person reviewing the exact payload, which leads to wrong or invented answers.
3. Connections break (expired tokens, school consent walls, slow polling), and there is no repair flow.
4. Chat and web hand-offs drop the task: OAuth fails inside webviews, and there is no resume.
5. Outcomes are opaque, and proxy-identity side effects surprise people.

**Launch gates for the owner.** Google verification of `gmail.readonly` is the hard one. Unverified apps have a 100-user lifetime cap. Restricted-scope verification takes about 6 weeks, plus the security assessment. So Gmail for more than 100 users is not possible by Oct 30 unless verification is already done. The other gates are Microsoft publisher verification, the Telegram linking method (D-023), and the relay-address decision.

---

## 1. How agent platforms do connectors

### 1.1 Claude (connectors directory, remote MCP with OAuth)

**Connect inside chat, step by step** ([Claude Help: connectors](https://support.claude.com/en/articles/11176164)):
1. In a chat, click **+** (or type **/**), hover **Connectors**, and choose **Manage connectors**, then **+**. Or go to **Customize > Connectors**.
2. Click the connector, review it, then click **Connect** or **Install**.
3. Follow the authentication prompts.
4. Configure settings and permissions.
5. Toggle the connector on for a conversation from the same **+** menu.

**Offering a connector mid-conversation.**
- Anthropic's [Apr 23, 2026 post](https://claude.com/blog/connectors-for-everyday-life) says Claude "now suggests the right app for what you're doing." It uses your preferences, context and conversation.
- If several apps could help, "Claude shows them all and lets you choose." There are no paid placements.
- You install "with a click on desktop or a few taps on mobile." The directory has over 200 connectors.
- Before booking or purchasing, Claude is designed to check with you first.
- Once an app is connected, Claude can bring it into a conversation on its own ([help](https://support.claude.com/en/articles/11176164)).

**Scopes, and when they are asked.**
- For a remote MCP connector, the authentication setting can be "Sign in now", "Sign in when needed" (Claude connects without credentials and prompts sign-in when the server asks) or "No sign-in" ([Claude docs: remote MCP](https://www.claude.com/docs/connectors/custom/remote-mcp)).
- Client identity can be "Use Claude's published identity" (recommended), "Register automatically" (Dynamic Client Registration), or your own OAuth client (same page).
  - The published identity is a Client ID Metadata Document, or CIMD: a document Anthropic hosts that tells the server who Claude is, so no per-server registration is needed.
- Support article ([custom connectors via remote MCP](https://support.claude.com/en/articles/11503834)):
  - The callback is `https://claude.ai/api/mcp/auth_callback`, and the client name is "Claude".
  - Claude supports the 3/26 and 6/18 auth specs, DCR, manual client ID and secret, and token expiry and refresh.

**Token storage.**
- Not publicly documented. The only storage statement found is about request headers: "Claude stores each header value securely, doesn't show it again after you save." Anthropic reviews custom header names ([docs](https://www.claude.com/docs/connectors/custom/remote-mcp)).
- Custom connectors "are reached from Anthropic's cloud" ([help](https://support.claude.com/en/articles/11176164)). Inference: OAuth tokens are held server-side by Anthropic.

**Per-tool permissions.**
- Users can set a tool to **Blocked**. Approval prompts offer **Always allow** ([docs](https://www.claude.com/docs/connectors/custom/remote-mcp)).
- Team and Enterprise owners can set categories or individual tools to "Always allow," "Needs approval" or "Blocked." Tools are grouped into read-only versus write or delete ([help](https://support.claude.com/en/articles/11176164)).

**Seeing and revoking access.**
- Disconnect at Customize > Connectors.
- Authentication settings can't be changed after a connector is added. You remove it and add it again ([docs](https://www.claude.com/docs/connectors/custom/remote-mcp)).

### 1.2 ChatGPT (apps, the Apps SDK, OAuth)

**Rename.** Connectors were renamed to apps on **December 17, 2025**. Existing connections kept working ([OpenAI Help](https://help-lb.openai.com/en/articles/11487775)).

**Connect, step by step** (same page):
1. Open Settings > Apps, the sidebar, or the app directory.
2. Click **Connect**.
3. Log in and complete the OAuth authorization.
4. Enable sync if the app needs it.
5. Invoke the app with **@** or **+ > More**.

**OAuth mechanics** ([Apps SDK: Authentication](https://developers.openai.com/apps-sdk/build/auth)):
1. **Discovery.** ChatGPT fetches protected-resource metadata from `/.well-known/oauth-protected-resource`, or from a `WWW-Authenticate` header on a 401 response.
2. **Client identity.**
   - CIMD is preferred: the `client_id` is `https://chatgpt.com/oauth/client.json`.
   - DCR is the fallback: ChatGPT registers once per server.
3. **Authorization.** The authorization-code flow with PKCE (S256) starts on the user's first tool call.
4. **Token use.** ChatGPT sends the access token as a Bearer token on later requests.
5. **Verification.** The server must validate issuer, audience, expiry and scopes on every request.
6. **Not supported.** Client-credentials and other machine-to-machine grants.

The page cites MCP authorization spec revisions 2025-11-25 and 2026-07-28. I could not fetch the 2026-07-28 changelog.

**Per-tool authentication.** Each tool declares `securitySchemes`, either `noauth` or `oauth2` with its scopes ([auth doc](https://developers.openai.com/apps-sdk/build/auth)).

**Offering a connection mid-conversation is developer-driven.** "Linking UI appears only when" two things are present (same doc):
- the tool declares `securitySchemes` and the server publishes resource metadata;
- the tool returns an error carrying `_meta["mcp/www_authenticate"]`, for example an `insufficient_scope` challenge.

The help article describes manual invocation only. It does not describe ChatGPT proactively suggesting apps ([help](https://help-lb.openai.com/en/articles/11487775)).

**Permissions and approvals** ([help](https://help-lb.openai.com/en/articles/11487775)):
- The default level is "Important actions": ChatGPT reads automatically and asks before important actions.
- The other levels are Always ask, Any changes, and Never ask (labeled "elevated risk").
- The approval card shows Deny, Allow once, and Always allow.
- "Some especially risky actions may be blocked" rather than offered for approval.
- Permission settings "don't grant new access."
- Disconnect in Settings > Apps.

**Token storage.** Not described. The doc says only that tokens "can still expire or rotate normally" ([auth doc](https://developers.openai.com/apps-sdk/build/auth)).

**Security guidance** ([Apps SDK security](https://developers.openai.com/apps-sdk/guides/security-privacy)):
- "Assume prompt injection and malicious inputs will reach your server."
- Validate inputs server-side even when the model supplied them.
- Require human confirmation for irreversible operations.
- Redact PII before writing to logs.

**Agent mode has changed.**
- OpenAI's help page now says "ChatGPT agent is no longer available. Use ChatGPT Work" ([help, updated days before 2026-10-26](https://help.openai.com/en/articles/11752874)).
- Its old takeover mode paused for logins ("Take over browser"). Screenshots were not captured during takeover. ChatGPT "doesn't capture passwords or sensitive data you manually enter." Cookies persisted across sessions.
- ChatGPT Work launched July 9, 2026. It pauses for authorization before "sensitive actions," and admins can pre-authorize or block them ([report](https://pasqualepillitteri.it/en/news/7727/chatgpt-work-openai-agent)).

### 1.3 Instinct: which product the founder means

**Identification.** "Instinct" is **Instinct (instinct.com)**, operated by Spear Street Technology, Inc. Its founder is Noah Shinn: former Sierra research scientist, first author of Reflexion, co-author of τ-bench ([eesel](https://www.eesel.ai/blog/instinct-ai)). This matches two things in the founder's own notes: "iPhone-number login like Flip/Instinct" and the repo's "Instinct-class assistant" language (`docs/instinct-spec-series/`). That match is my inference.

**What it is.**
- An invite-only beta launched **August 26, 2026** ([eesel](https://www.eesel.ai/blog/instinct-ai)).
- You sign in at app.instinct.com with a phone number and a texted code. There is no email or password login (same).
- Channels: iMessage or WhatsApp, voice calls, a Mac app, and the app.instinct.com workspace ([eesel review](https://www.eesel.ai/blog/instinct-ai-review)).
- It runs on a persistent cloud computer with browser access and cached credentials ([Vellum, a competitor](https://www.vellum.ai/blog/official-instinct-breakdown)).
- Funding:
  - Reported $250M Series B at $2.5B, led by Index Ventures and Benchmark, confirmed to the WSJ per [Vellum](https://www.vellum.ai/blog/official-instinct-breakdown).
  - [Sacra](https://sacra.com/c/instinct/) reports a $1B Series C at $10B in September 2026.
  - Treat both as reported, not verified.

**Connectors.**
- Google Workspace through official APIs: Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks ([Sacra](https://sacra.com/c/instinct/), [eesel](https://www.eesel.ai/blog/instinct-ai)).
- With permission: screen, keyboard and cursor activity, audio, and location ([Sacra](https://sacra.com/c/instinct/)).
- Stripe Link and Shopify, added later. A Stripe Link payment uses a one-time card for an amount you "explicitly review and approve" ([eesel](https://www.eesel.ai/blog/instinct-ai)).

**Credentials.**
- Its privacy policy, as quoted, lets it collect "your username and password for third-party accounts" ([eesel](https://www.eesel.ai/blog/instinct-ai)).
- A "Vault" holds them, excluded from training. Shinn says 32% of users share credentials through it (same).
- No encryption claim was found for the Vault ([eesel review](https://www.eesel.ai/blog/instinct-ai-review)).

**Approvals and trust failures.**
- There is no general approval gate. The terms say actions "may not always be reversible" ([eesel review](https://www.eesel.ai/blog/instinct-ai-review)).
- A tester reported an email sent on their behalf without prior consent ([SC World summarizing TechCrunch, Aug 25, 2026](https://www.scworld.com/brief/instinct-ai-assistant-faces-privacy-concerns-amid-praise)).
- Users found summarized emails kept after they revoked access (same). A deletion tool was added later ([Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)).
- A founder's hidden-instruction test email was followed (same).

**How it offers connections mid-conversation.** Not documented publicly. A guide dated Oct 19, 2026 only says to "review the permissions before connecting accounts" ([Anima](https://animaapp.com/blog/ai-en/instinct-ai-guide/)).

**Lesson for Trainee (inference).**
- Instinct proves the appetite: people text an agent like a person and hand it credentials.
- Its failures are the ones Trainee's rules already prevent: acting without exact-payload approval, keeping data after disconnect, and taking passwords.
- Matching Instinct's polish while keeping those rules is the differentiator.

**Similar consumer agents.**
- **Poke (The Interaction Company).**
  - Works over iMessage, SMS and **Telegram**.
  - It was the first third-party AI agent in Apple Messages for Business, on June 4, 2026 ([report](https://letsdatascience.com/news/poke-joins-apples-messages-app-as-ai-agent-10b4db92)).
  - Integrations come through "Recipes": "Poke will walk you through any auth steps (OAuth, API key, etc.)." Users can also add a custom MCP server URL with an optional API key ([Poke docs](https://poke.com/docs/managing-integrations)).
  - The poke.com/integrations page shows every connection, with "Disconnect from Poke" and a "Retry Connection" or "Refresh Connection" repair flow (same).
- **OpenClaw** (open-source, self-hosted; runs on Telegram, WhatsApp and other channels).
  - By default it keeps API keys and bot tokens in plaintext in `~/.openclaw/openclaw.json` ([LumaDock, Feb 14, 2026](https://lumadock.com/tutorials/openclaw-secrets-management)).
  - In a February 2026 sample, about 17% of skills on its ClawHub marketplace were assessed as malicious. Some searched for and exfiltrated API tokens (Bitdefender, via the [AI Incident Database](https://incidentdatabase.ai/entities/clawhub/)).
  - Lesson: an unreviewed connector or skill marketplace becomes a credential-theft channel.
- **Career-specific agents with chat channels.**
  - Tsenta (YC S26) runs on iOS, Android, iMessage and WhatsApp plus a Chrome extension. It claims "account creation, email verification, & filling in OTPs on over 30 ATSs" ([YC launch](https://www.ycombinator.com/launches/SBV-tsenta-your-ai-career-agent-that-applies-to-jobs-lands-you-interviews)).
  - Pinloop "creates employer accounts and enters the codes they email you." Its demo shows a "Code entered from your Gmail." The user chooses "Let me review first" or "Submit when complete." It "asks before it guesses," and offers a CLI and MCP ([pinloop.ai](https://pinloop.ai/), [CLI](https://github.com/pinloop-ai/pinloop-cli)).

### 1.4 Google Gemini (Connected Apps, formerly Extensions)

**Connecting.**
- The Google Workspace app connects Gmail, Docs, Drive, Tasks, Keep and Calendar.
- It requires Keep Activity to be on. Gmail's "Smart features in other Google products" must also be on.
- "For work and school accounts, the Google Workspace administrator must first enable the ability to connect with apps."
- When Workspace isn't connected, Gemini offers to connect it.
- Source: [Gemini Help](https://support.google.com/gemini/answer/15229592?hl=en).

**Using a connected app.**
- Google's help says to name the service, or type **@**, in each new conversation (same).
- A third-party guide (Apr 10, 2026) says Gemini may also use a connected app automatically when relevant ([Digital Citizen](https://www.digitalcitizen.life/how-to-connect-apps-to-gemini-a-complete-setup-guide/)).

**Personal Intelligence** ([summary of Google's posts](https://www.gend.co/blog/google-personal-intelligence-expands-empowering-more-users)):
- January 14, 2026: U.S. beta for AI Pro and Ultra subscribers.
- March 17, 2026: expanded to more surfaces, including free-tier users.
- Off by default. Set up at Settings > Personal Intelligence > Connected Apps.
- Personal accounts only: not Workspace business, enterprise or education. Users must be 18 or older and in the U.S.

**Revoking.** Toggle the app off. Past chats stay in history until you delete them through Gemini Apps Activity ([Digital Citizen](https://www.digitalcitizen.life/how-to-connect-apps-to-gemini-a-complete-setup-guide/)).

**Tokens.** First-party Google data, with no third-party OAuth tokens involved (inference).

### 1.5 Microsoft Copilot (connectors)

**Consumer Copilot, step by step** ([Microsoft Support](https://support.microsoft.com/en-gb/microsoft-copilot/connecting-microsoft-copilot-to-other-services)):
1. Open **Profile > Connectors**.
2. Click **Connect**. A readiness screen appears.
3. Click **Continue to …** (for example, "Continue to Gmail").
4. Authorize on the provider's sign-in and consent screen.
5. You return to Copilot with the connector enabled.

**Details** (same page):
- Services: OneDrive; Outlook.com mail, calendar and contacts; Google Drive; Gmail, Google Calendar and Google Contacts.
- The Copilot account must match the Microsoft account used for OneDrive or Outlook.
- Connectors can be toggled per conversation.
- A prompt such as "What's on my Outlook calendar tomorrow?" makes "Copilot … ask for permission to connect."
- "Copilot does not store a separate copy of your data," and connected data isn't used for training.
- Available for personal accounts with Microsoft 365 Personal, Family, Premium or Pro.
- Disconnecting is not documented beyond the per-conversation toggles.
- First shipped to Windows Insiders on Oct 9–10, 2025 ([Yahoo Tech](https://tech.yahoo.com/ai/copilot/articles/microsoft-copilot-ai-now-pull-210000747.html)).

**Microsoft 365 Copilot connectors** are a different, admin-deployed product. More than 100 connectors ingest external content into Microsoft Graph ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/prebuilt-connectors-overview)).

### 1.6 What the MCP authorization spec (2025-11-25) contributes

**Key requirements** ([spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)):
- Servers MUST publish Protected Resource Metadata (RFC 9728).
- Clients and servers SHOULD support Client ID Metadata Documents, and MAY support DCR.
- PKCE with S256 is required.
- Resource indicators (RFC 8707) are required, binding each token to the intended server.
- Tokens go in the Authorization header only, never in the URL.
- Servers MUST validate audience, and MUST NOT pass a received token through to downstream services.
- Missing scopes trigger a step-up flow: a 403 with `error="insufficient_scope"` and the needed scopes.
- Public clients MUST rotate refresh tokens.

**This revision also added** URL-mode elicitation (SEP-1036) and incremental scope consent through `WWW-Authenticate` (SEP-835) ([changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)).

**For Trainee (inference).** Copy the pattern even though Telegram isn't an MCP client:
- A tool that lacks a grant returns a structured "needs connection" challenge (provider, scopes, reason).
- Code turns it into a connect card.
- A step that can only happen in a browser becomes a URL hand-off.
- The task resumes when the grant lands.

### 1.7 Platform comparison

| Platform | How a user connects | When scopes are asked | Token storage (public) | See and revoke | Mid-conversation offer |
|---|---|---|---|---|---|
| Claude | + or / > Connectors > Connect; OAuth | "Sign in now" or "Sign in when needed" (on the server's challenge) | Not documented; headers "stored securely" | Customize > Connectors; per-tool Blocked or Always allow | Yes: "suggests the right app" (Apr 2026) |
| ChatGPT | Settings > Apps or directory > Connect; OAuth with PKCE | On first tool call; step-up through `mcp/www_authenticate` | Not documented | Settings > Apps; four permission levels | Developer-triggered linking UI |
| Instinct | Web workspace; Google APIs; Vault for logins | Not documented | Vault (no encryption claim found) | Disconnect didn't delete data (later fixed) | Not documented |
| Poke | Recipes walk through OAuth or API key; custom MCP URL | At recipe setup | Not documented | poke.com/integrations: Disconnect, Retry | Through recipes |
| Gemini | Toggle in Connected Apps (first-party) | At toggle | First-party | Toggle off; history stays | Offers to connect; @ mentions |
| Copilot | Profile > Connectors > Continue to provider | At connect | "Does not store a separate copy of your data" | Per-chat toggles only | Asks permission when a prompt implies the service |

### 1.8 Lessons that transfer to Trainee

1. **Offer the connector in context, then resume the task automatically.** Claude's suggestions and ChatGPT's scope challenge both do this.
2. **Keep permission tiers per tool.** Reads run freely; writes ask. This matches Trainee's `read`, `write_own` and `external` effects.
3. **Keep one place that lists every connection, with repair and revoke.** Poke's "Retry Connection" is the model to copy.
4. **Publish the custody model.** Nobody publishes token-storage details, so Trainee can differentiate by saying exactly how tokens are held (inference).
5. **Disconnect must delete.** Instinct's retention after revocation was its loudest trust failure.

---

## 2. Managed-auth and integration platforms

### 2.1 Comparison table

The extrapolations use **assumptions A**: 2 connections per user (mail and calendar), 300 tool calls per user per month through the vendor, mailbox events handled first-party, list prices, no discounts.

| Platform | Apps claimed | List pricing (date) | At 100k / 1M users (assumptions A) | Token custody and export | SOC 2 | MCP endpoint | Own OAuth app; Google burden | Lock-in and red flags |
|---|---|---|---|---|---|---|---|---|
| **Composio** | 1,600+ apps ([docs](https://docs.composio.dev/docs/welcome)) | Hobby $0 with 100k calls/mo; Pro $29/mo plus usage; tool call $0.0003; trigger event $0.003; Composio-managed apps: first 1k connected accounts free, then $0.10 each. Rates refreshed 2026-10-25 ([pricing](https://composio.dev/pricing.md)) | About $9k / $90k per month. Mailbox triggers at 1k events per user would add about $300k / $3M | Composio holds credentials (AES-256-GCM). Customer-managed keys go through a proxy in your cloud. "Reading connected-account state is not a supported token-export workflow" ([custody](https://docs.composio.dev/docs/security/token-custody)) | "SOC 2 Type II compliant" ([security](https://docs.composio.dev/docs/security/overview.md)) | Sessions over a hosted MCP endpoint | Custom auth config brings your OAuth app and consent-screen name ([white-label](https://docs.composio.dev/docs/authentication/white-labeling-authentication.md)). You "complete Google's required verification" ([Google guide](https://docs.composio.dev/kb/guide/platform-google-oauth.md)). Gmail and Calendar triggers poll, up to about 15 minutes ([triggers](https://docs.composio.dev/docs/triggers)) | High: no token export, so leaving means re-consent |
| **Pipedream Connect** | 3,000+ APIs, 10k+ tools ([pricing](https://pipedream.com/pricing)) | Free is development-only. Startup is $99/mo billed annually or $150 monthly: 100 users, then **$2 per user per month**; 10k credits, then $0.012 each (1 credit per 30 s of compute). Business is custom | About $200k plus credits / about $2M plus credits per month | Vendor-held; export not verified | SOC 2 Type 2 and GDPR on all plans ([pricing](https://pipedream.com/pricing)) | MCP tool calls billed as credits ([docs](https://pipedream.com/docs/pricing.md)) | Not researched further | **Workday agreed to acquire Pipedream on Nov 19, 2025** ([Workday](https://newsroom.workday.com/2025-11-19-Workday-Signs-Definitive-Agreement-to-Acquire-Pipedream)). That is the ATS you automate. Per-user pricing doesn't suit consumer apps |
| **Nango** | Auth for 1,000+ APIs; 10k+ tools ([pricing](https://www.nango.dev/pricing)) | Free: 10 connections. Pay-as-you-go: $50/mo including credits, then $0.29 per connection per month and $0.72 per compute hour. Enterprise "as low as $0.01/connection/month at scale" | About $58k / $580k per month at pay-as-you-go; about $2k / $20k at the enterprise floor | Nango Cloud, or self-host. Free self-host covers "Auth and Proxy" only; Enterprise covers BYOC and self-managed ([self-hosting](https://www.nango.dev/docs/guides/platform/self-hosting)). **Export:** `GET /connection?refresh_token=true` ([API](https://nango.dev/docs/reference/backend/http-api/connection/get.md)). **Import:** `POST /connection` ([API](https://nango.dev/docs/reference/backend/http-api/connection/post)) | "Certified SOC 2 Type 2" ([pricing](https://www.nango.dev/pricing)) | "10,000+ tools, one server" (not in free self-host) | Bring your own client; it recommends "switching to your own OAuth client before going to production" ([blog](https://nango.dev/blog/how-to-migrate-from-composio-to-nango)) | **Low:** tokens are portable |
| **Merge Agent Handler** | "thousands of pre-built tools" ([site](https://www.merge.dev/merge-agent-handler)) | "One credit per tool call"; Free, Pro and Enterprise; prices not public ([FAQ](https://docs.merge.dev/merge-agent-handler/resources/faq)) | Quote only | Merge holds credentials (AES-256), "decrypted only at the moment of injection"; "Your code (and the model) never sees them" | "Merge's SOC 2 Type II program"; ISO 27001 badge | One MCP endpoint, scoped per Registered User | Bring your own OAuth app supported | Business-to-business governance product; 90-day log retention by default |
| **Paragon (ActionKit)** | 130+ SaaS apps, 1,000+ actions ([profile](https://rywalker.com/research/paragon)) | Quote only; metered on "Connected Users" ([pricing](https://useparagon.com/pricing)) | Quote only. Each consumer counts as a Connected User ([billing](https://docs.useparagon.com/billing/connected-users.md)), and new users are blocked at the limit | Paragon holds | SOC 2 Type II | ActionKit MCP | White-label portal | Built for tenants of business customers |
| **Arcade.dev** | "8,000+ permission-aware tools" ([site](https://arcade.dev/)) | Free: 2k auth events and 2k calls. Team: $25/mo plus $0.10 per auth event and **$0.01 per tool call** ([pricing](https://www.arcade.dev/pricing/)) | About $300k / $3M per month in tool calls | Arcade Cloud, or your VPC or an air-gapped install on Enterprise | SOC 2 Type 2 (Aug 18, 2025) ([blog](https://www.arcade.dev/blog/soc-2-compliance-ai-agents-production-security/)) | MCP runtime | The default Google app is shared, with fixed scopes. "For production use, we strongly recommend creating your own Google OAuth provider." A custom user verifier is required ([Google provider](https://docs.arcade.dev/en/references/auth-providers/google.md)) | Enterprise focus; acquired Smithery Aug 5, 2026 ([Arcade](https://arcade.dev/blog/smithery-joins-arcade)) |
| **Zapier MCP** | 9,000+ apps ([embed docs](https://docs.zapier.com/powered-by-zapier/embedding-zapier-mcp/getting-started)) | 2 tasks per successful call. Free: 100 tasks. Pro: 750. Team: 2,000. As of Sept–Oct 2026 ([Latenode, a competitor](https://latenode.com/blog/zapier-mcp-pricing)) | Impractical at this scale | Zapier holds | Not verified here | Embed gives each user a server URL | Not researched | Task pricing built for prosumers |
| **Klavis** | 300+ ([Jun 2026 profile](https://rywalker.com/research/klavis-ai)) or 600+ ([site](https://eu.klavis.ai)) | Paid tiers not published | Unknown | Cloud, or self-host under Apache-2.0 | Claims SOC 2 Type II (per profile) | Strata unified MCP | Not researched | Seed-stage vendor (YC X25) |
| **Smithery** | Registry | Not applicable | Not applicable | Not applicable | Not stated | Registry only from now on | Not applicable | **"On October 31, 2026, we're shutting down Smithery's connection management services."** That covers the Connect API, accounts and API keys, with no stated token migration ([Smithery](https://smithery.ai/future)) |

### 2.2 Vendor notes that matter for a consumer agent

- **Composio** has the widest catalog and the cheapest per-call price.
  - The consent screen shows Composio's name unless you bring your own OAuth app ([white-label](https://docs.composio.dev/docs/authentication/white-labeling-authentication.md)).
  - Even with your own app, "Owning the OAuth app does not move the token store into your infrastructure" ([custody](https://docs.composio.dev/docs/security/token-custody)).
  - Its Gmail trigger is polling-based, "up to about 15 minutes with Composio-managed auth" ([triggers](https://docs.composio.dev/docs/triggers)). That is incompatible with filling codes inside D-021's 15-minute window.
- **Nango** is the only major vendor found that documents both exporting a refresh token and importing existing tokens. That is the strongest protection against lock-in.
- **Arcade, Merge and Paragon** are excellent at enterprise governance (audit, SIEM, DLP), and their prices assume business customers.
- **Pipedream's** new owner is Workday, the dominant applicant system. Inference: sending your applicant traffic and credentials through Workday's integration layer is a strategic conflict.
- **Smithery's shutdown** is the cautionary tale. When a connection vendor exits, every end user must reconnect somewhere else. The vendor offered help choosing a replacement but stated no token migration ([Smithery](https://smithery.ai/future)).

### 2.3 What no vendor removes

1. **Google's restricted-scope verification and annual security assessment.**
   - Every vendor tells you to use your own Google client in production ([Composio](https://docs.composio.dev/kb/guide/platform-google-oauth.md), [Arcade](https://docs.arcade.dev/en/references/auth-providers/google.md), [Nango](https://nango.dev/blog/how-to-migrate-from-composio-to-nango)).
   - Google requires a security assessment when you "store or transmit restricted scope data on servers" ([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)).
2. **Microsoft publisher verification and tenant consent policy.** These are properties of your app and of each school's tenant (see 3.2).
3. **Limited Use obligations** on Gmail data apply to you ([policy](https://developers.google.com/terms/api-services-user-data-policy?authuser=3)).
4. **Latency.** Push is yours to build. Vendors often poll.

### 2.4 Recommendation for Trainee

- **Core (P0), built in-house.** Gmail, Microsoft Graph mail and calendar, Google Calendar, and the Drive and OneDrive pickers.
  - Use your own Google Cloud project, verified, and your own Microsoft Entra app, multitenant plus personal accounts and publisher-verified.
  - Use your own Gmail Pub/Sub watch and your own Graph subscriptions.
  - Use your own vault (§7.4).
  - The work is a handful of providers with well-documented APIs. Trainee already runs a Gmail grant (`_shared/career_mail_gmail.ts`, `career_email_code.ts`).
- **If you'd rather not run OAuth plumbing for the core,** use **Nango** (self-hosted, BYOC, or cloud) for authentication and refresh only. Call the provider APIs directly with fetched tokens, and keep restricted-scope content off the vendor's proxy. Tokens stay exportable.
- **Long tail (P2+).** Notion, Calendly, GitHub, Dropbox, Zoom, Slack and similar go through **Composio**:
  - behind an internal `ConnectorPort` interface, so the vendor can be swapped;
  - read-mostly;
  - with your own OAuth apps wherever users see a consent screen;
  - with every external effect still going through Trainee's exact-payload approval card.
  - Accept that moving away means users reconnect, because these connectors aren't critical.
- **Do not adopt** Pipedream (Workday ownership, per-user pricing), Zapier (per-task pricing), Paragon or Merge (built for business tenants), Arcade (tool-call price at consumer scale), or Smithery (exiting).

---

## 3. Email and calendar, Google and Microsoft at equal depth

### 3.1 Gmail

**Scopes** ([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)):

| Scope | Classification | What it allows |
|---|---|---|
| `gmail.readonly` | Restricted | Read messages and settings |
| `gmail.metadata` | Restricted | Headers and labels, no body |
| `gmail.modify`, `gmail.compose`, `gmail.insert`, `gmail.settings.basic` | Restricted | Write access of various kinds |
| `https://mail.google.com/` | Restricted | Full access, including permanent deletion |
| `gmail.send` | Sensitive | Send email |
| `gmail.labels` | Non-sensitive | View and edit labels |

Inference: every scope that reads a message body is restricted. Reading codes or classifying mail therefore needs restricted verification.

**Verification and the assessment** ([FAQ](https://support.google.com/cloud/answer/13463817?hl=en), [Security Assessment](https://support.google.com/cloud/answer/13465431?hl=en)):
- An unverified app that requests sensitive or restricted scopes has a **100-user cap**. The cap "applies over the entire lifetime of the project, and it cannot be reset or changed."
- Estimated time: Restricted Scope Verification about **6 weeks**, sensitive about 10 business days, brand 2–3 business days. "These estimates are not guaranteed."
- Restricted scopes require an **annual security assessment** at assurance level AL1 or AL2, revalidated every year. Google charges nothing; the assessor's price is agreed privately.
  - This assessment is commonly called CASA (Cloud Application Security Assessment).
  - Market prices (undated table, footer © 2026): TAC Security about $540 for Tier 2 and $4,500 for Tier 3; others run $800 to $8,000 or more ([Switch Labs](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option)).

**Limited Use** ([policy, last updated Feb 15, 2024](https://developers.google.com/terms/api-services-user-data-policy?authuser=3)):
- Use the data only for user-facing features.
- No transfers, except the listed ones.
- No human reading, unless the user agrees for specific content, or for security, legal or aggregated internal needs.
- No ads. No credit or lending decisions.
- A privacy policy must disclose the use.

The FAQ adds that Google user data "may not be used to train or improve foundational or frontier models"; personalized models are allowed ([FAQ](https://support.google.com/cloud/answer/13463817?hl=en)).

For OpenAI-based processing:
- OpenAI API data has not been used for training by default since March 1, 2023.
- Abuse logs are kept up to 30 days.
- Zero data retention requires OpenAI's approval ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)).
- Disclose OpenAI processing in the Limited Use statement. The repo already flags this before `CAREER_MAIL_MODEL=on` (`docs/architect/work-orders/WO-040-mail-accuracy.md`).

**Consent mechanics.**
- With granular consent, users can grant a subset of the requested scopes, and "the application must check what scopes are granted" ([Google](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions?authuser=3)).
- Policy says request "the smallest set of scopes," and ask "in context with incremental authorization" ([OAuth policies, Aug 5, 2026](https://developers.google.com/identity/protocols/oauth2/policies?authuser=4)).
- So: don't bundle Gmail with sign-in. Ask for it at the moment of need.

**Refresh-token pitfalls.**
- In "Testing" status, refresh tokens expire after **7 days**, unless the app asks for sign-in scopes only.
- There is a limit of **100 refresh tokens per Google Account per client**; each new one invalidates the oldest.
- Sources: a [Google forum](https://discuss.google.dev/t/oauth2-refresh-token-expiration-and-youtube-api-v3/160874) post quoting the docs, and [WorkOS](https://workos.com/blog/invalid-grant-oauth-errors-by-provider).
- Tokens also die after six months unused, and when the user changes password if the token carries Gmail scopes ([WorkOS](https://workos.com/blog/invalid-grant-oauth-errors-by-provider)).
- Subscribe to **Cross-Account Protection**, Google's security-event feed. Delete the refresh token on `token-revoked`, and end sessions on `sessions-revoked` ([RISC](https://developers.google.com/identity/protocols/risc?authuser=48)).

**Push versus polling** ([push guide](https://developers.google.com/workspace/gmail/api/guides/push?authuser=2), [sync guide](https://developers.google.com/workspace/gmail/api/guides/sync)):
- **Setup.** Create a Pub/Sub topic. Grant publish rights to `gmail-api-push@system.gserviceaccount.com`. Call `users.watch` with `labelIds: ["INBOX"]`.
- **Renewal.** "You must call the `watch` method at least once every 7 days." Google recommends daily.
- **Notifications** carry only `emailAddress` and `historyId`. You then call `history.list` from your last `historyId`.
- **Rate limit.** One event per second per watched user; excess notifications are dropped.
- **Reliability.** Notifications "might be delayed or dropped," so poll `history.list` after a quiet period.
- **History retention.** History is "typically available for at least one week." A 404 means you must run a full sync.
- **Quotas** (fetched 2026-10-26) ([quota](https://developers.google.com/workspace/gmail/api/reference/quota?hl=en)):
  - 1.2M quota units per minute per project; 6,000 per minute per user.
  - `history.list` costs 2 units; `messages.get` costs 20 (60 for full or raw).

**Design (inference).** Push for latency, with a reconciliation poll every 5–10 minutes per active user and a backstop after any long silence. Fetch metadata first, and the full body only for candidate job mail.

### 3.2 Microsoft 365 and Outlook.com

**App registration (Entra).**
- Register for "Accounts in any organizational directory and personal Microsoft accounts" (`AzureADandPersonalMicrosoftAccount`).
- Stricter limits apply to this audience: at most two client secrets, 30 permissions per resource, and national clouds unsupported ([Microsoft Learn](https://learn.microsoft.com/lt-lt/entra/identity-platform/supported-accounts-validation)).
- Use a confidential web client. Do **not** register the redirect as "SPA": SPA refresh tokens last only 24 hours ([refresh tokens](https://learn.microsoft.com/en-ca/entra/identity-platform/refresh-tokens)).

**Scopes.**
- Sign-in: `openid profile email offline_access User.Read`.
- `offline_access` must be requested explicitly on the v2.0 endpoint to get refresh tokens. The consent page shows it as "Maintain access to data you have given it access to" ([scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc)).
- `Mail.Read`: "read the signed-in user's mailbox." Delegated use needs no admin consent at the permission level ([permission reference](https://graphpermissions.merill.net/permission/Mail.Read.html)).
- `Mail.ReadBasic` excludes body, `previewBody` and attachments ([reference](https://graphpermissions.merill.net/permission/Mail.ReadBasic.html)). It is enough for tracking by header but not for codes.
- `Calendars.ReadWrite`, delegated, also needs no admin consent at the permission level ([reference](https://graphpermissions.merill.net/permission/Calendars.ReadWrite.html)).

**Publisher verification** ([Microsoft Learn](https://learn.microsoft.com/en-ca/entra/identity-platform/publisher-verification-overview)):
- Requires a Partner One ID from the Microsoft AI Cloud Partner Program.
- The domain must match the publisher domain; `*.onmicrosoft.com` is not allowed.
- The app must be registered with a work or school account. It then gets a blue "verified" badge.
- "Beginning November 2020, if risk-based step-up consent is enabled, users can't consent to most newly registered multitenant apps that aren't publisher verified."
- Verification is free, and can be fast if the requirements are already met ([Nylas guide](https://developer.nylas.com/docs/provider-guides/microsoft/verification-guide.md)).

**School and work tenants: the student problem.**
- Built-in consent policies include `microsoft-user-default-low`: "verified publishers, for selected permissions" that the admin classifies as low impact. Admins can also disable user consent entirely ([configure user consent](https://learn.microsoft.com/en-gb/entra/identity/enterprise-apps/configure-user-consent)).
- Microsoft-managed app consent policies rolled out July–August 2025. By default, users can no longer consent to third-party apps that access files and sites ([MC1097272](https://mc.merill.net/message/MC1097272)).
- Blocked users see an "Approval required" window when the admin consent workflow is enabled ([Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)).
- Real universities:
  - University of Oregon shows "Approval required" for permissions its policy doesn't let users grant. Low-risk apps typically take about 7 days ([UO, Mar 18, 2026](https://service.uoregon.edu/TDClient/2030/Portal/KB/ArticleDet?ID=141226)).
  - University of Georgia: "You cannot approve the app yourself" ([UGA](https://uga.teamdynamix.com/TDClient/3190/eitsclientportal/KB/ArticleDet?ID=169007)).
  - Oakland University is "selective," and apps licensed for "individual, personal use" may be denied ([Oakland](https://support.oakland.edu/TDClient/33/Support-Center/KB/ArticleDet?ID=814)).
- Forwarding school mail out often fails too. Microsoft's default for automatic external forwarding changed to off in 2021 for new organizations; senders get NDR `5.7.520` ([Microsoft](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-policies-external-email-forwarding)).
- Google Workspace for Education requires users designated under 18 to request access to unconfigured third-party apps ([Google, Aug 2023](https://workspaceupdates.googleblog.com/2023/08/third-party-app-access-enhancements-for-google-workspace-edu.html?m=0)).
- **Plan (inference).** When a school tenant blocks consent:
  - offer the personal mailbox the student uses for applications;
  - offer the Trainee relay address (§7.1, item 8);
  - offer forwarding of specific emails into Trainee;
  - or draft the IT request.
  - Never let a consent wall dead-end the task.

**Token lifetimes.**
- Access tokens get a random 60–90 minute lifetime, 75 on average. Long-lived lifetimes of 20–28 hours apply under Continuous Access Evaluation ([access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)).
- Refresh tokens last **90 days**, or 24 hours for SPA and email-passcode flows ([refresh tokens](https://learn.microsoft.com/en-ca/entra/identity-platform/refresh-tokens)).
- "Refresh tokens replace themselves with a fresh token upon every use," so delete the old one.
- A user's own password change leaves confidential-client tokens alive. An admin revoke kills them.

**Change notifications versus delta polling.**
- **Subscribe** to `/me/mailFolders('inbox')/messages`.
  - Maximum lifetime: 10,080 minutes (under 7 days).
  - Notifications that include the message content (rich) last 1,440 minutes and require an encryption certificate ([subscription](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-beta)).
- **Limits and speed.** 1,000 active subscriptions per mailbox across all apps. Message latency averages under 1 minute, with a 3-minute maximum ([overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)).
- **Webhook rules** ([delivery](https://learn.microsoft.com/lt-lt/graph/change-notifications-delivery-webhooks)):
  - Echo the `validationToken` in `text/plain` within 10 seconds.
  - Verify `clientState` on every notification.
  - Return a 2xx within 3 seconds.
  - If more than 10% of responses take over 3 seconds, the endpoint is marked "slow" and notifications are delayed by 10 minutes.
  - If more than 15% take over 10 seconds, notifications are dropped, unrecoverably.
  - Renew by PATCH, and handle the lifecycle notifications (`reauthorizationRequired`, `missed`, `subscriptionRemoved`).
- **Reconciliation.** Delta is per folder, using `deltaLink` and `skipToken`. `Mail.ReadBasic` is the least privilege for delta, including on personal accounts ([message delta](https://learn.microsoft.com/en-us/graph/api/message-delta)).
- **Throttling.** 10,000 requests per 10 minutes per app per mailbox, and 4 concurrent requests ([Nylas, citing Microsoft](https://cli.nylas.com/guides/microsoft-graph-mailbox-agent-best-practices)).
- **Gap.** Microsoft's overview doesn't state whether personal Outlook.com mailboxes support message subscriptions; it only excludes the user resource for personal accounts. Test this early.

### 3.3 IMAP and app passwords: why not

- **Google.** Access by less secure apps was "turned off for all Google Accounts" on **March 14, 2025**. IMAP, SMTP, POP, CalDAV and CardDAV "no longer work with legacy passwords," with the exception of app passwords ([Google](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth?hl=en)).
- **Microsoft.**
  - Exchange Online basic authentication was disabled on Oct 1, 2022. It is now disabled in all tenants and can't be re-enabled ([Microsoft Learn](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)).
  - Outlook.com basic authentication ended **Sept 16, 2024** ([Microsoft Support](https://support.microsoft.com/en-us/topic/c5d65390-9676-4763-b41f-d7986499a90d)).
- **Why even app passwords are wrong for Trainee (inference):**
  - An app password is a long-lived password equivalent, with unscoped full-mailbox access over IMAP.
  - It can't be limited to one purpose.
  - Collecting it breaks the owner's "no passwords" rule and makes the data sensitive personal information under California's privacy law (§4.4).
- **IMAP over OAuth is worse for least privilege.** On Gmail it requires `https://mail.google.com/`, the broadest restricted scope ([scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). On Microsoft it is a full-mailbox protocol ([Microsoft](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online) recommends OAuth for IMAP). Use the Gmail API and Graph instead.

### 3.4 One event pipeline for both providers (inference)

1. **Ingress.** Gmail sends to a Pub/Sub push endpoint; Graph sends to a webhook. Each acknowledges in under 1 second and enqueues `{user, provider, cursor}`.
2. **Worker.** Gmail calls `history.list(startHistoryId)`; Graph follows the delta link. Each new message gets a metadata read, then a body read only if the sender or subject passes the job-mail prefilter.
3. **Code path (D-021, D-029).** Applies when an application is waiting on a code:
   - the sender is on the ATS allowlist with DKIM or DMARC pass (as `career_email_code.ts` already does);
   - the mail is no more than 15 minutes old;
   - it contains exactly one code;
   - the code is filled and never stored.
4. **Reconciliation.** A cron job renews the Gmail watch daily, renews Graph subscriptions every few days, handles lifecycle and Google security events, and runs a periodic delta as backstop.
5. **Health.** Each connection carries `last_event_at`, `last_reconcile_at` and `renew_due_at`. Alert the user once when it degrades (§7.2).

### 3.5 Classifying job-related mail

**How competitors do it.**
- Simplify matches recruiting mail to tracked applications and "can recommend a tracker status update," which requires the user's approval. Matching "is not guaranteed to capture every relevant message" ([Simplify](https://help.simplify.jobs/articles/0236686-email-integration)).
- Others avoid OAuth with proxy inboxes:
  - Simplify Autopilot uses Letterfern ([Simplify](https://help.simplify.jobs/articles/1787280-apply-to-a-job-with-autopilot)).
  - Massive uses a neuronmail.io address ([Scoutify, a competitor](https://scoutify.com/blog/massive-review/)).
  - JobShinobi gives each user a forwarding address ([JobShinobi](https://jobshinobi.com/blog/how-to-use-email-to-track-job-applications-automatically)).

**Trainee's own measurements.**
- Phrase rules alone scored 83.3% precision and 33.3% recall on new wordings (blind40) (`docs/career/mail-tracking.md`).
- A model pass is needed for recall. Codes stay rule-only.

**Recommended taxonomy and rules (inference):**

| Class | Typical signals | Allowed effect |
|---|---|---|
| verification_code | ATS sender allowlist, DKIM/DMARC pass, strict per-ATS pattern, mail newer than the prompt | Fill once into the waiting form; never stored |
| application_received | ATS template, application or requisition ID, links to the ATS | Upgrade `submitted_unconfirmed` to confirmed |
| status_update / under review | ATS templates | Note only |
| assessment_invite | HackerRank- or CodeSignal-style links, deadlines | Reminder plus prep offer |
| interview_invite | A scheduling link (Calendly, GoodTime, ATS scheduler) or proposed times | Draft a reply or slot choice for approval; calendar hold offer |
| interview_confirmed | `.ics` or invitation | Calendar event (app-created calendar) |
| rejection | Employer domain, authenticated | Move stage, but only from authenticated employer mail (repo guard, WO-040) |
| offer | Employer domain, authenticated, plus human confirmation | Never auto-moved without the person's "yes, that's an offer" |
| recruiter_outreach | Personal sender at a company domain | Surface with a draft reply for approval |
| job_alert | LinkedIn, Handshake or Indeed alert digests | Parse postings as leads (read your own mail; no site automation) |
| other | Not applicable | Ignore |

**Mechanics.**
- Match messages to applications by Message-ID and In-Reply-To (Trainee outreach), ATS IDs in links, company domain, and time since submission.
- Run the model over minimal text, with a JSON schema and evidence spans.
- Below the confidence threshold, ask the person ("Looks like a rejection from Stripe. Right?") instead of moving the stage.

### 3.6 Calendars and files

- **Google Calendar.** Use the narrow scopes ([Calendar API auth](https://developers.google.com/calendar/api/auth)):
  - `calendar.app.created`: create a "Trainee interviews" calendar and manage only its events;
  - `calendar.freebusy` or `calendar.events.freebusy`: availability;
  - `calendar.events.owned` only if editing the person's own events is needed.
  - The page doesn't list sensitivity classes; check them in the Cloud console.
- **Outlook Calendar.** `Calendars.ReadWrite`, or `Calendars.Read` plus `.ics` files for holds.
- **No-scope fallback.**
  - A Google "add to calendar" link: `calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…&ctz=…`. It is undocumented by Google ([community reference](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/master/services/google.md)).
  - An `.ics` attachment.
- **Resumes.**
  - Google Drive `drive.file` is **non-sensitive** and gives per-file access through the Google Picker. `drive.readonly` is restricted ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).
  - So never ask for whole-Drive access. A file chosen in the Picker, or uploaded in Telegram or on the web, is enough.

---

## 4. User secrets and credentials

### 4.1 Password managers built for agents

- **1Password Secure Agentic Autofill** (Oct 8, 2025, early access with Browserbase) ([1Password](https://1password.com/blog/closing-the-credential-risk-gap-for-browser-use-ai-agents)):
  1. The agent requests a credential.
  2. 1Password finds the match.
  3. A human approves; this is required by default.
  4. The credential is injected over an end-to-end encrypted channel built on the Noise Framework. The agent and model "never need to see nor handle the credentials."
- **1Password for Claude** (Jul 16, 2026, Mac) ([1Password](https://1password.com/blog/1password-for-claude)):
  - The user approves with biometrics: "Allow 1Password to fill in Claude."
  - It fills the page directly and checks that secrets weren't exposed. If submission fails, it clears the filled values.
  - One-time codes go the same way: "Claude never sees the vault item, password, or one-time code."
  - Access lasts for the current task only.
  - **Agentic Mode** (Aug 2026) locks the 1Password interface and limits any compatible browser agent to credentials approved for the task ([1Password community](https://www.1password.community/announcements-52/august-2026-at-1password-smarter-sign-ins-secure-ai-agents-and-safer-developer-secrets-25431)).
- **1Password's principle** (Jul 16, 2025): it "will not use MCP to expose raw credentials or secrets." Credentials "should be injected on behalf of the agent." Human authorization is required, and anything delivered must be "short-lived, revocable, and scoped" ([1Password](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)).
- **Bitwarden MCP server** (Jul 2025): local-first through the Bitwarden command-line tool. Agents can "generate, retrieve, and manage credentials" while it keeps "zero-knowledge, end-to-end encryption" ([Help Net Security](https://www.helpnetsecurity.com/2025/07/11/bitwarden-mcp-server/)). Inference: for a cloud agent like Trainee, the user's machine must be in the loop.

### 4.2 Browser agents

- **Claude in Chrome** ([help](https://support.claude.com/en/articles/12902428)):
  - With 1Password, "your passwords and one-time codes never enter Claude's context."
  - Claude is prohibited from "Inputting sensitive data" and from "Bypassing captchas."
  - It asks before accessing financial sites and blocks some site categories.
  - Two classifiers check incoming content and each action. Internal testing found attack success below 0.08%, with the caveat that "the risk is not zero."
- **ChatGPT agent's takeover mode.** Login by the user, no screenshots captured during takeover, persistent cookies. It has now been retired in favor of ChatGPT Work (see 1.2).
- **Perplexity Comet incident** ([The Decoder, Mar 3, 2026](https://the-decoder.com/a-calendar-invite-is-all-it-took-to-hijack-perplexitys-comet-browser-and-steal-1password-credentials/)):
  - A calendar invite carrying a prompt injection drove Comet to the *unlocked* 1Password web vault. It exfiltrated entries and could take over the account.
  - Fixes: a code-level block on `file://` paths; 1Password added confirm-before-fill and an option to disable automatic sign-in.
  - **Lesson:** never let a model browse a vault or any page that shows secrets. Inject on approval, outside the model.

### 4.3 Vault designs: best practice versus dangerous

| Design | How it works | Fit for Trainee |
|---|---|---|
| **Client-side, zero-knowledge** (1Password, Bitwarden) | The server can't decrypt | Only for secrets the person's own browser uses, such as ATS logins in their password manager. A cloud agent can't use these without the person's device |
| **Cloud KMS envelope encryption** | A data key per object or user encrypts the data. A key-encryption key in a hardware security module wraps the data keys and "never leaves the HSM." Per-tenant keys give cryptographic isolation. Rotation re-wraps the data keys ([WorkOS, Jul 15, 2026](https://workos.com/blog/envelope-encryption-explained)) | **Best fit for OAuth refresh tokens.** A per-user data key, an encryption context of `{user, provider, connection}`, and decryption only in a broker service |
| **Supabase Vault** | Authenticated encryption (libsodium); "the encryption key is never stored in the database alongside the encrypted data." The `decrypted_secrets` view decrypts at query time, and anyone who can query it reads secrets. The Management API returns the project root key ([Supabase](https://supabase.com/docs/guides/database/vault)). pgsodium is labeled "pending deprecation" | Fine for app secrets and bootstrap. Risky as the only protection for millions of user tokens: one project-wide key and a view reachable by SQL (inference). Today's grant lives at `oauth_google_career_<uid>` in Vault |
| **Per-user keys** | Each user's data key is wrapped by KMS; deleting it crypto-shreds that user's tokens | Use for disconnect and account deletion |

**Dangerous patterns, with evidence:**
- plaintext token files (OpenClaw default);
- an LLM with access to an unlocked vault (Comet);
- collecting third-party passwords into a vault with no published encryption model (Instinct);
- secrets typed into chat channels: Telegram cloud chats aren't end-to-end encrypted ([Telegram](https://tsf.telegram.org/manuals/e2ee-simple)).

### 4.4 What regulators and stores require

- **Google.** Limited Use plus the annual assessment for restricted scopes (§3.1).
- **Apple.** App Review guideline 5.1.2(i), updated Nov 13, 2025: "You must clearly disclose where personal data will be shared with third parties, including with third-party AI," and obtain explicit permission ([TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)). Trainee's OpenAI processing needs an in-app consent screen before any iOS app ships.
- **California (CCPA/CPRA).** "Sensitive personal information" includes "a consumer's account log-in … in combination with any required security or access code, password, or credentials allowing access to an account" (Cal. Civ. Code § 1798.140(ae), via [Presencis](https://presencis.com/regulations/ccpa/definitions/sensitive_personal_information/)). Holding ATS passwords would put Trainee into this category.
- **Chrome Web Store.** The extension needs a Limited Use statement. The repo already drafts one (`docs/launch/chrome-web-store.md`).
- **The owner's rule matches the platforms.** OpenAI advises against typing passwords into messages ([OpenAI](https://help.openai.com/en/articles/11752874)). 1Password and Claude keep codes out of model context ([1Password](https://1password.com/blog/1password-for-claude)).

---

## 5. Job-application agents

### 5.1 How each one handles the hard parts

| Product | Runs where | ATS accounts (Workday, iCIMS, Taleo) | Email and codes | LinkedIn | Review before submit | Sources and notes |
|---|---|---|---|---|---|---|
| **Simplify** | Copilot: the person's browser (extension). Autopilot: cloud | Copilot: the person signs in. Autopilot: not documented; "appears only on supported postings" | Autopilot uses a proxy on **Letterfern**; codes are entered on supported apps; other mail is forwarded. Gmail integration matches mail and suggests status changes for approval | Not documented | Copilot: the person presses Submit. Autopilot: "There is no review step before submission." 20 credits a week; failed runs are free | [Autopilot](https://help.simplify.jobs/articles/1784339-get-started-with-autopilot), [apply](https://help.simplify.jobs/articles/1787280-apply-to-a-job-with-autopilot), [credits](https://help.simplify.jobs/articles/4455305-autopilot-credits-and-failed-applications), [email](https://help.simplify.jobs/articles/0236686-email-integration) |
| **Jobright** | Autofill extension, plus an "Agent" that "submits applications on behalf of job seekers" (Jun 24, 2025) | Autofill claims Workday, Greenhouse, Lever, iCIMS, Ashby, Workable | Not documented | Profile import from LinkedIn | Autofill: the person reviews and submits | [Autofill](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/), [Agent](https://jobright.ai/blog/jobright-launches-first-ai-agent-to-put-job-search-on-autopilot/). Indeed's venture arm invested |
| **LazyApply** | Extension | Not applicable | Not documented | Automates LinkedIn and Indeed "Easy Apply" | Auto | [Trustpilot 2.1 from 110 reviews](https://ca.trustpilot.com/review/lazyapply.com?page=3) |
| **AIApply** | Auto Apply (mechanics not public) | Not documented | Not documented | Not documented | Auto | [Aggregator](https://checkthat.ai/brands/aiapply/reviews): Trustpilot rating hidden for a guideline breach (as reported) |
| **Sonara** | Cloud | Not documented | Not documented | Not documented | Auto | Shut down Feb 1, 2024; BOLD relaunched it around Aug 2024 ([Resumly, a competitor](https://resumly.ai/answers/what-happened-to-sonara-ai)) |
| **Massive** | Cloud | Not stated | **Proxy address** (neuronmail.io); reads replies into a dashboard | Source of listings only | Preview of materials | [Scoutify (a competitor), Sept 30, 2026](https://scoutify.com/blog/massive-review/): Trustpilot 1.7 from 43 reviews |
| **Tsenta (YC S26)** | Chat (iMessage, WhatsApp), apps and extension | Creates accounts; email verification and one-time codes "on over 30 ATSs" | Not stated how | Not stated | "Chat with Tsenta to manage and submit" | [YC](https://www.ycombinator.com/launches/SBV-tsenta-your-ai-career-agent-that-applies-to-jobs-lands-you-interviews), [YourStory, Jun 11, 2026](https://yourstory.com/2026/06/tsenta-wants-to-make-job-applications-faster-smarter-less-manual) |
| **Pinloop** | Web app, CLI, MCP | "Creates employer accounts"; claims 50+ systems including Workday | Reads codes from **Gmail** | Listed as a job source | "Let me review first" or "Submit when complete" | [pinloop.ai](https://pinloop.ai/) |
| **JobCopilot** | Applies on employer sites; extension for LinkedIn and Workday forms | Not documented | Not documented | Extension on LinkedIn forms (ToS risk) | Optional save-to-review | [Weekday (a competitor), Oct 2026](https://www.weekday.works/post/jobcopilot-review), [Trustpilot 2.0 from 99 reviews](https://uk.trustpilot.com/review/jobcopilot.com) |
| **Huntr** | Tracker plus autofill extension ("1000s of websites") | The person | Not documented | Not applicable | The person | [huntr.co](https://huntr.co/): interview times tracked; no calendar sync stated |
| **Teal** | Tracker extension | The person | Not documented | Saves postings from LinkedIn | "A copilot, not an auto-apply bot" | [Tool Directory, Jul 25, 2026](https://tooldirectory.ai/tools/teal) |
| *Kombo AI Apply (an API for business customers; reference)* | Cloud | **Creates an account per application** with a unique proxy email. The candidate claims it later by resetting the password, after which "AI Apply can no longer access it." Kombo doesn't store passwords | Forwards mail; handles emailed two-factor codes | Not applicable | Not applicable | [Kombo docs](https://docs.kombo.dev/ai-apply-candidate-account-creation) |

**Handshake.**
- None of the main tools documents Handshake support.
- Handshake's terms prohibit "Creating accounts through unauthorized means, including scripts, bots, or automated crawlers," and crawling or scraping without consent ([ToS, Jul 22, 2025](https://joinhandshake.com/tos)).
- Students are limited to **300 applications per day**. Going over "automatically blocks the account until Handshake's Trust & Safety team reviews" it ([Handshake](https://support.joinhandshake.com/hc/en-us/articles/218693418)).
- One small extension auto-applies on Handshake, with 296 installs ([ExtScope](https://www.extscope.org/extension/aedegffcgkjmbaefclfjlklommhmeokf)). That is a risk signal, not a model to follow.

**Calendars.** Calendar integration is mostly absent. Huntr tracks interview times "in one place," and Teal tracks follow-up dates. Inference: this is an open lane for Trainee.

**Captchas.**
- No major tool documents solving them. Claude in Chrome prohibits bypassing them ([help](https://support.claude.com/en/articles/12902428)).
- Applicant systems combine captchas, rate limits and device fingerprinting against bot applications. Gartner is cited as projecting that by 2028 "one in four job applications will be fake" ([Fingerprint, a vendor, Feb 12, 2026](https://fingerprint.com/blog/job-application-fraud-detection/)).

### 5.2 Patterns, and why they exist

1. **The person's browser (extension) versus the cloud.**
   - An extension rides the person's own session, cookies and home IP address, and never holds a password. But it "can only fill one form at a time, and need[s] the user to drive" (Tsenta's founders, [YourStory](https://yourstory.com/2026/06/tsenta-wants-to-make-job-applications-faster-smarter-less-manual)).
   - The cloud scales to volume, but it needs accounts, codes and a way past bot defenses. That is why cloud tools create accounts and use proxy inboxes.
   - Trainee's split matches this:
     - open systems (Greenhouse, Lever, Ashby) run in the cloud worker;
     - systems that need an account (Workday and similar) run in the person's browser (D-013(b));
     - codes come from the inbox (D-029).
2. **Proxy inboxes are the industry's way to handle codes without inbox OAuth.** Examples: Simplify's Letterfern, Massive's neuronmail, and Kombo's per-application address.
   - The cost: employers see an unfamiliar address.
   - Proxies have side effects: one reviewer kept getting interview emails after cancelling ([Scoutify](https://scoutify.com/blog/massive-review/)).
   - The account belongs to whoever controls the inbox, unless there is a "claim your account" step, as Kombo has.
3. **LinkedIn.**
   - The User Agreement §8.2 bars "software, devices, scripts, robots or any other means or processes … to scrape or copy the Services" and "bots or other unauthorized automated methods." LinkedIn's Help Center warns that tools such as browser plug-ins risk accounts being "restricted or shut down" ([as quoted by contentin.io, Jul 28, 2026](https://contentin.io/blog/linkedin-mcp-terms-of-service/)).
   - LinkedIn sued Proxycurl in January 2025, and Proxycurl shut down ([StartupHub, Jul 4, 2025](https://www.startuphub.ai/ai-news/startup-news/2025/the-1-linkedin-scraping-startup-proxycurl-shuts-down)).
   - Sign In with LinkedIn (OpenID Connect) returns only name, picture, email and locale ([Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)).
   - So Trainee's only good LinkedIn path is the data-export import (§6), alongside the owner's rule.

### 5.3 What users complain about

These are dated and sourced. Reddit couldn't be fetched, so the complaints come from Trustpilot and dated compilations.

- **Coverage is far below the promise.**
  - "Only about 3.5% of the jobs which indicated that the application could be filled out automatically" (Jobright, Oct 1, 2026, [Trustpilot](https://www.trustpilot.com/review/jobright.ai?page=3); Jobright overall is 4.8 from 3,536 reviews).
  - About 10 applications a day, not the advertised 750 (LazyApply, [Trustpilot](https://ca.trustpilot.com/review/lazyapply.com?page=3)).
- **Wrong or invented answers.**
  - JobCopilot: "Lied about my schooling," "It faked languages" (Oct 12, 2026), and "generated false information on my résumé" (Jul 29, 2026) ([Trustpilot](https://uk.trustpilot.com/review/jobcopilot.com)).
  - AIApply: resumes listing skills and languages the applicant doesn't have ([aggregator](https://checkthat.ai/brands/aiapply/reviews)).
  - Massive: "The user does NOT require sponsorship," and invented expertise ([Scoutify](https://scoutify.com/blog/massive-review/)).
- **Irrelevant targeting.**
  - "The first batch of 20 jobs I received was completely irrelevant" (JobCopilot, Jul 16, 2026).
  - 200 of 270 matches irrelevant (AIApply).
  - A pharmacist (PharmD) sent to physician and nursing roles (LazyApply, Aug 12, 2024).
- **Duplicates and spam.** "Applying for the same exact job over ONE HUNDRED times" (Massive, Aug 2024) ([Scoutify](https://scoutify.com/blog/massive-review/)).
- **Opacity.** "AFTER it sent out 200 resumes, I was mortified to see pure lies" (JobCopilot, Oct 12, 2026).
- **Billing and support.** Charges after cancellation, slow refunds, and support by bot only (AIApply, LazyApply, JobCopilot, as cited above).

---

## 6. When no connector exists

### 6.1 Patterns, and who uses them

| Pattern | Who uses it | Mechanics and evidence |
|---|---|---|
| **The person's own browser (extension or computer use)** | Simplify Copilot, Jobright Autofill, Claude in Chrome, Trainee's extension | Fills inside the person's session. The person presses Submit |
| **An email-forwarding address** | TripIt: `plans@tripit.com`, then a notification once the trip is created ([TripIt](https://help.tripit.com/en/support/solutions/articles/103000063275-adding-travel-plans-to-tripit)). Expensify: `receipts@expensify.com`, which "MUST" come from an address on your account ([Expensify](https://community.expensify.com/discussion/2714/where-to-email-receipts-to-to-get-them-into-your-expensify-expenses)) | The sender is authenticated by the known address. Results confirmed back to the user. Success rates aren't published |
| **Proxy or relay inbox** | Simplify Letterfern, Massive, Kombo | See 5.2 |
| **File upload or export import** | LinkedIn data export: Settings & Privacy > Get a copy of your data. Selected data takes about 10 minutes, the full archive about 24 hours, and the download lasts 72 hours ([Technipages, 2020; may have changed](https://www.technipages.com/download-linkedin-data/)). `Connections.csv` has First Name, Last Name, URL, Email Address, Company, Position, Connected On ([Juicebox](https://docs.juicebox.ai/help/data-migration/linkedin-connections)) | Parse into the fact bank as draft facts. The person confirms (D-007) |
| **Paste with structured extraction** | General pattern | Echo it back as a card ("Here's what I read") with Confirm or Fix |
| **Share sheets and in-browser capture** | Closest analog found: Simplify's iOS app and "Copilot in Safari on iPhone" ([Simplify help index](https://help.simplify.jobs/)). No job agent documenting a share-sheet flow was found | On Telegram, forward or share a link, posting or file into the bot, and Trainee parses it (inference) |
| **"Do it with me," with a prefilled link** | Gmail compose URL: `mail.google.com/mail/u/0/?to=…&su=…&body=…&tf=cm`, undocumented ([Willison, Mar 12, 2024](https://til.simonwillison.net/google/gmail-compose-url)). Google Calendar template link (§3.6) | Sends a follow-up with no `gmail.send` scope; the person presses Send |
| **Generic MCP or HTTP connectors** | Poke custom MCP ([Poke](https://poke.com/docs/managing-integrations)), Claude custom connectors ([Claude](https://www.claude.com/docs/connectors/custom/remote-mcp)), ChatGPT custom MCP on Pro, Business and Enterprise ([OpenAI](https://help-lb.openai.com/en/articles/11487775)) | For power users only |
| **Ask for one step, then resume** | ChatGPT agent's "Take over browser," which "may need to re-establish the run" ([OpenAI](https://help.openai.com/en/articles/11752874)). Trainee's `needs_user` stops (WO-096) | Keep the task state and resume automatically |

### 6.2 Success rates where known

- **OSWorld-Verified.** The best model scored 42% in early 2025. In June 2026 the leader scored 85%, against about 72% for humans. But "a business process only finishes if every step does," and a 2–3 minute human task can take an agent 8–10 minutes ([a16z, Aug 10, 2026](https://a16z.com/can-agents-use-a-computer-yet-weve-got-the-data/)).
- **Online-Mind2Web** (300 real tasks on 136 sites) ([arXiv](https://arxiv.org/html/2504.01382v4)):
  - Operator 61.3%; Claude Computer Use 3.7, 56.3%; Browser Use 30.0%.
  - Most errors were filtering and navigation. Failed tasks took about twice as many steps as successful ones.
  - The paper calls benchmark claims near 90% "an illusion of progress."
- **What that means (inference, matching a16z).** Use deterministic drivers per applicant-system family, and call the model only for exceptions. That is Trainee's existing driver approach (packages 149, 150, 155). Treat computer use as the fallback, not the core.
- **Email forwarding and paste.** No published success rates were found.

### 6.3 UX patterns that make fallbacks feel seamless (inference)

1. **One task object, one resume.**
   - Every hand-off carries the task ID. When the person finishes their step, Trainee resumes and reports what happened.
   - Never "start over."
2. **One ask per message**, with a single primary button and one alternative.
3. **Read-back before use.** Anything Trainee parsed (an export, a paste, a forwarded email) is confirmed once, then reused forever (the answer-once pattern, WO-054).
4. **Deep links land on the exact page and state.** The prefilled compose window, the exact posting with the extension ready, the exact Connections card.
5. **Honest stops.** "I can't do X here. The fastest way is Y (30 seconds). Want me to set it up?"

---

## 7. Synthesis: the design for Trainee

### 7.1 Connectors, ranked

**Launch (P0):**

1. **Gmail, read-only, with push** (`gmail.readonly`, plus `gmail.send` only if outreach ships).
   - Why: emailed codes are where real submissions stop. The only real submission ever attempted (Gusto on Greenhouse) stopped at Greenhouse's code (WO-096).
   - Replies and rejections drive the outcome-rate metric.
   - **Gate:** restricted verification plus the security assessment (§3.1).
2. **Outlook / Microsoft 365 mail** (Graph `Mail.Read` plus `offline_access`, with webhooks and delta).
   - Why: parity. Many students and professionals live in Outlook.
   - School tenants need the fallback path (§3.2).
3. **Resume intake.**
   - Telegram document upload, web upload, Google Drive Picker (`drive.file`, non-sensitive), and the OneDrive picker.
   - Why: "never submit without a real, confirmed resume." The Picker avoids a restricted scope.
4. **The Trainee extension in the person's own browser, as the "ATS connector".**
   - Covers Workday, iCIMS, Taleo, SuccessFactors and other systems that need an account.
   - The person signs in; their password manager fills the credentials.
   - Trainee fills the application with per-page approval (WO-048) and fills codes from the inbox (WO-096).
   - Why: this covers most large employers without Trainee ever holding a password (D-013(b)).
5. **Google Calendar** (`calendar.app.created` plus free/busy).
   - Why: interviews are the outcome. A Trainee-owned calendar stays out of the person's other events.
6. **Outlook Calendar** (`Calendars.ReadWrite`, or `Calendars.Read` plus `.ics`). Parity.

**Next (P1):**

7. **LinkedIn data-export import** (ZIP or CSV upload), plus optional Sign In with LinkedIn for identity only.
   - Why: work history, education and connections for referrals, with zero automation risk.
8. **The Trainee applicant relay address** (opt-in), for example `vish.k7@apply.trainee.ai`.
   - Everything is forwarded to the real inbox, and codes are read in seconds.
   - Accounts are claimable, using Kombo's pattern.
   - Why: it unblocks people who won't or can't grant inbox access, such as students on locked school tenants.
   - **Owner decision:** it changes the identity employers see.
9. **Handshake, without automation.**
   - Share or forward a posting into Telegram, parse Handshake alert emails, and help with the external application in the person's browser on their tap.
   - Why: students. The terms and the 300-per-day lockout rule out bulk automation.
10. **Password-manager handoff.**
    - Detect and guide 1Password, Bitwarden or Chrome autofill in the person's browser, and stay compatible with 1Password's Agentic Mode.
    - Why: it makes the "you sign in yourself" step take seconds.

**Later (P2), through `ConnectorPort` and Composio:** GitHub (portfolio proof; public repos need no OAuth), Calendly and scheduling links, Notion or Docs portfolios, Zoom.

**Never:** LinkedIn or Indeed automation, captcha solving, IMAP or app passwords.

### 7.2 Connect UX in chat, and the Connections page

**In Telegram (the example is Gmail at the moment a code is needed):**

1. **Trigger.** A tool returns `needs_connection{provider:"google", scopes:["gmail.readonly"], reason:"greenhouse_code", task_id}`.
   - Code builds the card: provider, button, scopes.
   - The model writes one sentence of why, using only the requirement's facts. There is no canned prose (ARCHITECTURE §3.1).
2. **Card.** A single bubble, for example: "Greenhouse will email you a security code when we submit. Connect Gmail (read-only) and I'll fill it for you. I never show or keep the code."
   - Inline buttons: **[Connect Gmail]**, **[Use Outlook]**, **[I'll type it myself]**.
3. **The button is a `login_url` button.**
   - Telegram adds the user's authorization data, in the Telegram Login Widget format, to the HTTPS URL. It is "a great replacement for the Telegram Login Widget when the user is coming from Telegram" ([LoginUrl](https://docs.aiogram.dev/en/latest/api/types/login_url.html)).
   - Verify that data server-side, per Telegram's "Receiving authorization data" documentation. It identifies which Telegram user opened the page, without any token or code typed or shown in the chat.
   - The domain must be linked to the bot.
   - This is a cleaner answer to **D-023** than a `/start` token.
4. **The connect page** is mobile-first, from the web app. It shows three lines of what will be read, what won't, and how to undo it, then **Continue with Google**.
   - Google blocks OAuth in embedded webviews with `disallowed_useragent` ([Google](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)). It has been reported failing inside Telegram Web Apps ([report](https://feedback.base44.com/p/urgent-google-oauth-403-disalloweduseragent-in-telegram-web-app)).
   - So the page detects an embedded user agent and offers **Open in browser**. Inside a Mini App, use `openLink` to open the external browser ([Telegram Mini Apps SDK](https://docs.telegram-mini-apps.com/packages/telegram-apps-sdk/2-x/utils/links)).
   - Test Telegram on iOS, Android and Desktop, including its in-app browser setting.
5. **Return.** "Connected. Back to Telegram," with a `t.me/<bot>` link. The bot immediately posts "Gmail connected (read-only). Resuming your Greenhouse application…" and the task continues.
6. **Partial or blocked grants.**
   - Granular consent unchecked: say what won't work and offer the next rung of the ladder.
   - A school tenant's "Approval required": offer a personal mailbox, the relay address, or a drafted IT request.

**Telegram Mini App (optional)** for viewing Connections inside Telegram:
- Validate `initData` server-side: HMAC-SHA256 with a key derived from the bot token, or Telegram's Ed25519 signature. Check `auth_date` freshness ([init data](https://docs.telegram-mini-apps.com/platform/init-data)).
- OAuth itself still opens externally.

**The Connections page (web dashboard).** One card per connection:
- the account (for example `vish@gmail.com`);
- a status: **Working**, **Needs you**, **Paused** or **Disconnected**, with the last check time;
- **"What Trainee does with it,"** in plain words. For Gmail: "reads emails from employers and job sites to track your applications; fills sign-in codes employers email you; never sends unless you approve each email";
- **"What it can't do"**;
- the scopes, with technical names behind a disclosure;
- **recent activity**, for example "Filled Greenhouse code for Gusto, 2:14pm" or "Marked Interview for Stripe";
- the data held, with **Delete this data**;
- the actions **Pause**, **Fix**, and **Disconnect & delete**;
- a pointer to remove access in the Google or Microsoft account too.

A fixed panel lists **what Trainee will never ask for in chat:** passwords, one-time codes, Social Security numbers.

**Health.**
- Daily refresh check; Gmail watch renewed daily; Graph subscriptions renewed before expiry; Google security events and Graph lifecycle events handled.
- On degradation, send one calm message with a Fix button ("Gmail stopped working. Tap to fix. Until then I'll ask you for codes"). Never nag.

### 7.3 Just-in-time offer policy (code-enforced; inference)

1. Offer only when the **current task** needs the connector, never during onboarding unless the person asks.
2. Offer only when no lower rung works without friction: data already held, the extension already present.
3. **One connect ask per message.** At most one unsolicited connect offer per person per 24 hours.
4. The offer states **what is read, why, and how to undo it**, in one sentence. It always carries an alternative.
5. A decline is remembered per purpose for 14 days. Use the fallback silently after that, and don't re-ask until the person shows intent again.
6. Ask for the **minimal scope for this purpose**. Ask for more scopes in context later (incremental authorization). This is Google policy as well ([policies](https://developers.google.com/identity/protocols/oauth2/policies?authuser=4)).
7. After the grant, **resume the task automatically** and report the result. A connection with no immediate payoff feels like a tax.
8. External effects still go through exact-payload approval. A connection grants reads, never permission to send (D-007).

### 7.4 Credential custody

| Secret | Where it lives | Who can use it | How it's used | Retention and revocation |
|---|---|---|---|---|
| Google and Microsoft refresh tokens | Postgres row, AES-256-GCM, a per-user data key wrapped by a cloud KMS key, with an encryption context of `{user, provider, connection}` | Only the **connector broker** (one function identity with KMS decrypt rights) | The broker exchanges the token in memory, calls the API, and returns parsed minimal data to tools. **The model never sees tokens** | Until disconnect. Disconnect means: revoke at the provider, delete the wrapped key (crypto-shred), delete derived data, and say what's kept. Google security events and Graph lifecycle events trigger the same |
| Access tokens | Memory only | Broker | Not applicable | About 1 hour |
| Emailed one-time codes | **Never stored** (the `EmailCode` wrapper prints as `[emailed code]`) | Apply worker and extension | Filled once into the waiting form | Not applicable |
| ATS passwords | **Not held by Trainee** (D-013(b)). They live in the person's password manager or browser | The person | The extension never reads password fields (WO-048 rule 1) | Not applicable |
| Bot and provider tokens (Telegram, WhatsApp, LoopMessage) | Server secret store | Edge functions | Not applicable | Rotate through BotFather or Meta on exposure |
| Relay mailbox content (if adopted) | Encrypted at rest | Code path and tracking | Codes extracted just in time; mail forwarded | Short retention (for example 30 days); deleted on account deletion |
| User-supplied API keys (rare) | Same as refresh tokens | Broker | Entered in a write-only web field, never in chat (Claude's "doesn't show it again" pattern) | Until removed |

**Chat hygiene for Telegram.** Telegram cloud chats aren't end-to-end encrypted ([Telegram](https://tsf.telegram.org/manuals/e2ee-simple)).
- Scan inbound messages for password-like and code-like content before logging and before the model sees them.
- On a match, call `deleteMessage`. "Bots can delete incoming messages in private chats" sent within the last 48 hours ([Bot API](https://docs.aiogram.dev/en/latest/api/methods/delete_message.html)).
- Then reply: "I deleted that. Please don't send passwords or codes here. Here's the safe way…", and suggest rotating the password.

**If the owner later wants Trainee to create ATS accounts (D-013(c)), prefer Kombo's pattern over a password vault:**
- create the account on the relay address;
- generate a password used once and never persisted, or keep it only in the extension's client-side encrypted store;
- have the person claim the account through the reset email.

This keeps California-sensitive login data out of Trainee's servers (inference).

**Migrating Supabase Vault (inference):**
- Keep Vault for app secrets.
- Move user tokens to KMS envelope encryption.
- Restrict `vault.decrypted_secrets` to a single security-definer function until the move is done.
- Log every decryption.

### 7.5 The fallback ladder

**Getting data in:**
1. Already confirmed in Trainee.
2. The connected inbox or calendar.
3. Forward or share into Trainee: email forwarding, Telegram share or forward.
4. Upload or export import: resume, LinkedIn ZIP.
5. Paste, followed by a read-back card.
6. Ask one precise question, saved once and reused.

**Getting an action done:**
1. The cloud worker on open applicant systems.
2. The extension in the person's browser (systems that need an account, the person signs in).
3. A prefilled "do it with me" link (compose, calendar, the exact posting).
4. Ask for one step: the person types a code or completes a captcha. Trainee watches and resumes.
5. Honest refusal, with the 30-second manual path and an offer to set it up.

Every rung resumes the same task and reports a proof: the employer's confirmation page or email (ARCHITECTURE §3.3).

### 7.6 Why competitors feel "poor or inconsistent," and the fix

| Cause | Evidence | Trainee's fix (rule and test) |
|---|---|---|
| **1. The promise outruns the coverage, and failures are silent** | Jobright "only about 3.5%" autofillable; LazyApply "10 a day not 750"; Simplify Autopilot only "on supported postings" and fails on verification steps | Label every posting **before** the person commits: "I can submit this end to end," "you'll sign in once," or "I'll prepare it and you'll press Submit." Measure the share submitted with employer confirmation |
| **2. Acting without exact-payload review leads to fabrication** | JobCopilot "Lied about my schooling"; AIApply invented skills; Massive "does NOT require sponsorship"; Simplify Autopilot "no review step"; Instinct sent email unasked | Exact-payload, hash-bound approval per batch (already the architecture). Answers only from confirmed facts (D-007). Never draft a fact |
| **3. Brittle connections and slow event paths** | Testing-mode 7-day refresh tokens; 7-day Gmail watch and under-7-day Graph subscriptions; school consent walls; vendor polling up to about 15 minutes; Instinct kept data after disconnect | Push plus reconciliation; automatic renewal; Google security events and Graph lifecycle events; one-tap Fix; Disconnect deletes |
| **4. Chat and web hand-offs drop the task** | OAuth blocked in embedded webviews; ChatGPT takeover "may need to re-establish the run"; Instinct's single messy thread | `login_url` buttons; external browser for OAuth; task-bound resume; approvals valid only while they are the thread's last word (WO-022) |
| **5. Opaque outcomes and proxy surprises** | "AFTER it sent out 200 resumes…"; Massive interview emails after cancel; refund complaints | Show every submitted payload and the employer's receipt. If a relay address is adopted, forward everything and offer account claim. Plain billing |

### 7.7 Launch gates, risks, and decisions for the owner

1. **Google verification for `gmail.readonly`.**
   - The unverified cap is 100 users for the life of the project.
   - Restricted verification takes about 6 weeks, plus the annual security assessment (about $540–$4,500 per year at TAC).
   - Testing-mode refresh tokens die after 7 days.
   - **Check the Cloud console status now.** Gmail for more than 100 users can't meet Oct 30 unless verification is already underway.
   - Until then, use Outlook, the relay address (if approved), forwarding, and "type it yourself".
2. **Microsoft publisher verification.** It needs a Partner One ID, a verified domain, and an app registered with a work or school account. Without it, risk-based step-up consent blocks many tenants.
3. **D-023.** Prefer `login_url` or a Mini App with `initData` over a `/start` token in chat.
4. **The relay address.** It changes the identity employers see. Get a written yes or no.
5. **Vendors.** If any is used, it must not be Pipedream (Workday-owned). It must have token export, or else hold only the long tail.
6. **Disclosures.** Update the privacy policy with the Limited Use statement and OpenAI processing. Apple's guideline 5.1.2(i) consent screen is needed before an iOS app.
7. **The custody migration.** Move user tokens from Vault-only to KMS envelope encryption before scaling past the first cohort.

---

## Sources (by section)

**Agent platforms:**
- [support.claude.com/11176164](https://support.claude.com/en/articles/11176164)
- [support.claude.com/11503834](https://support.claude.com/en/articles/11503834)
- [claude.com/docs remote MCP](https://www.claude.com/docs/connectors/custom/remote-mcp)
- [Claude blog, Apr 23, 2026](https://claude.com/blog/connectors-for-everyday-life)
- [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth)
- [Apps SDK security](https://developers.openai.com/apps-sdk/guides/security-privacy)
- [OpenAI apps help](https://help-lb.openai.com/en/articles/11487775)
- [OpenAI agent help](https://help.openai.com/en/articles/11752874)
- [ChatGPT Work](https://pasqualepillitteri.it/en/news/7727/chatgpt-work-openai-agent)
- [MCP auth 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [eesel Instinct](https://www.eesel.ai/blog/instinct-ai)
- [eesel review](https://www.eesel.ai/blog/instinct-ai-review)
- [Vellum](https://www.vellum.ai/blog/official-instinct-breakdown)
- [Sacra](https://sacra.com/c/instinct/)
- [SC World](https://www.scworld.com/brief/instinct-ai-assistant-faces-privacy-concerns-amid-praise)
- [Anima](https://animaapp.com/blog/ai-en/instinct-ai-guide/)
- [Poke news](https://letsdatascience.com/news/poke-joins-apples-messages-app-as-ai-agent-10b4db92)
- [Poke docs](https://poke.com/docs/managing-integrations)
- [OpenClaw secrets](https://lumadock.com/tutorials/openclaw-secrets-management)
- [AIID ClawHub](https://incidentdatabase.ai/entities/clawhub/)
- [Gemini help](https://support.google.com/gemini/answer/15229592?hl=en)
- [Personal Intelligence summary](https://www.gend.co/blog/google-personal-intelligence-expands-empowering-more-users)
- [Gemini guide](https://www.digitalcitizen.life/how-to-connect-apps-to-gemini-a-complete-setup-guide/)
- [Copilot support](https://support.microsoft.com/en-gb/microsoft-copilot/connecting-microsoft-copilot-to-other-services)
- [Copilot launch](https://tech.yahoo.com/ai/copilot/articles/microsoft-copilot-ai-now-pull-210000747.html)
- [M365 Copilot connectors](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/prebuilt-connectors-overview)

**Managed auth:**
- Composio: [pricing](https://composio.dev/pricing.md), [docs](https://docs.composio.dev/docs/welcome), [custody](https://docs.composio.dev/docs/security/token-custody), [security](https://docs.composio.dev/docs/security/overview.md), [white-label](https://docs.composio.dev/docs/authentication/white-labeling-authentication.md), [Google](https://docs.composio.dev/kb/guide/platform-google-oauth.md), [triggers](https://docs.composio.dev/docs/triggers)
- Pipedream: [pricing](https://pipedream.com/pricing), [docs](https://pipedream.com/docs/pricing.md), [Workday acquisition](https://newsroom.workday.com/2025-11-19-Workday-Signs-Definitive-Agreement-to-Acquire-Pipedream)
- Nango: [pricing](https://www.nango.dev/pricing), [self-host](https://www.nango.dev/docs/guides/platform/self-hosting), [get](https://nango.dev/docs/reference/backend/http-api/connection/get.md), [post](https://nango.dev/docs/reference/backend/http-api/connection/post), [migration](https://nango.dev/blog/how-to-migrate-from-composio-to-nango)
- Merge: [FAQ](https://docs.merge.dev/merge-agent-handler/resources/faq), [site](https://www.merge.dev/merge-agent-handler)
- Paragon: [pricing](https://useparagon.com/pricing), [billing](https://docs.useparagon.com/billing/connected-users.md), [profile](https://rywalker.com/research/paragon)
- Arcade: [pricing](https://www.arcade.dev/pricing/), [Google](https://docs.arcade.dev/en/references/auth-providers/google.md), [SOC 2](https://www.arcade.dev/blog/soc-2-compliance-ai-agents-production-security/), [site](https://arcade.dev/), [Smithery](https://arcade.dev/blog/smithery-joins-arcade)
- Zapier: [pricing](https://latenode.com/blog/zapier-mcp-pricing), [embed](https://docs.zapier.com/powered-by-zapier/embedding-zapier-mcp/getting-started)
- Klavis: [profile](https://rywalker.com/research/klavis-ai), [site](https://eu.klavis.ai)
- Smithery: [profile](https://rywalker.com/research/smithery), [shutdown](https://smithery.ai/future)

**Google:**
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Security Assessment](https://support.google.com/cloud/answer/13465431?hl=en)
- [FAQ](https://support.google.com/cloud/answer/13463817?hl=en)
- [CASA prices](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option)
- [push](https://developers.google.com/workspace/gmail/api/guides/push?authuser=2)
- [sync](https://developers.google.com/workspace/gmail/api/guides/sync)
- [quota](https://developers.google.com/workspace/gmail/api/reference/quota?hl=en)
- [refresh tokens (forum)](https://discuss.google.dev/t/oauth2-refresh-token-expiration-and-youtube-api-v3/160874)
- [WorkOS](https://workos.com/blog/invalid-grant-oauth-errors-by-provider)
- [Limited Use](https://developers.google.com/terms/api-services-user-data-policy?authuser=3)
- [granular consent](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions?authuser=3)
- [RISC](https://developers.google.com/identity/protocols/risc?authuser=48)
- [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies?authuser=4)
- [Calendar auth](https://developers.google.com/calendar/api/auth)
- [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [less secure apps](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth?hl=en)
- [webviews](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)
- [Workspace for Education](https://workspaceupdates.googleblog.com/2023/08/third-party-app-access-enhancements-for-google-workspace-edu.html?m=0)

**Microsoft:**
- [refresh tokens](https://learn.microsoft.com/en-ca/entra/identity-platform/refresh-tokens)
- [access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc)
- [account types](https://learn.microsoft.com/lt-lt/entra/identity-platform/supported-accounts-validation)
- [publisher verification](https://learn.microsoft.com/en-ca/entra/identity-platform/publisher-verification-overview)
- [Nylas guide](https://developer.nylas.com/docs/provider-guides/microsoft/verification-guide.md)
- [MC1097272](https://mc.merill.net/message/MC1097272)
- [user consent](https://learn.microsoft.com/en-gb/entra/identity/enterprise-apps/configure-user-consent)
- [admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)
- Universities: [UO](https://service.uoregon.edu/TDClient/2030/Portal/KB/ArticleDet?ID=141226), [UGA](https://uga.teamdynamix.com/TDClient/3190/eitsclientportal/KB/ArticleDet?ID=169007), [Oakland](https://support.oakland.edu/TDClient/33/Support-Center/KB/ArticleDet?ID=814)
- [subscription](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-beta)
- [overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
- [webhooks](https://learn.microsoft.com/lt-lt/graph/change-notifications-delivery-webhooks)
- [delta](https://learn.microsoft.com/en-us/graph/api/message-delta)
- Permissions: [Mail.Read](https://graphpermissions.merill.net/permission/Mail.Read.html), [Mail.ReadBasic](https://graphpermissions.merill.net/permission/Mail.ReadBasic.html), [Calendars.ReadWrite](https://graphpermissions.merill.net/permission/Calendars.ReadWrite.html)
- [throttling](https://cli.nylas.com/guides/microsoft-graph-mailbox-agent-best-practices)
- [forwarding](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-policies-external-email-forwarding)
- [Outlook.com basic auth](https://support.microsoft.com/en-us/topic/c5d65390-9676-4763-b41f-d7986499a90d)
- [Exchange basic auth](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)

**Credentials:**
- [1Password SAA](https://1password.com/blog/closing-the-credential-risk-gap-for-browser-use-ai-agents)
- [1Password for Claude](https://1password.com/blog/1password-for-claude)
- [1Password Aug 2026](https://www.1password.community/announcements-52/august-2026-at-1password-smarter-sign-ins-secure-ai-agents-and-safer-developer-secrets-25431)
- [1Password on MCP](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)
- [Bitwarden MCP](https://www.helpnetsecurity.com/2025/07/11/bitwarden-mcp-server/)
- [Claude in Chrome](https://support.claude.com/en/articles/12902428)
- [Comet incident](https://the-decoder.com/a-calendar-invite-is-all-it-took-to-hijack-perplexitys-comet-browser-and-steal-1password-credentials/)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [envelope encryption](https://workos.com/blog/envelope-encryption-explained)
- [Apple 5.1.2(i)](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)
- [CPRA](https://presencis.com/regulations/ccpa/definitions/sensitive_personal_information/)
- [OpenAI data](https://developers.openai.com/api/docs/guides/your-data)
- [Telegram encryption](https://tsf.telegram.org/manuals/e2ee-simple)

**Telegram:**
- [LoginUrl](https://docs.aiogram.dev/en/latest/api/types/login_url.html)
- [deleteMessage](https://docs.aiogram.dev/en/latest/api/methods/delete_message.html)
- [initData](https://docs.telegram-mini-apps.com/platform/init-data)
- [openLink](https://docs.telegram-mini-apps.com/packages/telegram-apps-sdk/2-x/utils/links)
- [webview OAuth report](https://feedback.base44.com/p/urgent-google-oauth-403-disalloweduseragent-in-telegram-web-app)

**Job agents:**
- Simplify: [email](https://help.simplify.jobs/articles/0236686-email-integration), [Autopilot](https://help.simplify.jobs/articles/1784339-get-started-with-autopilot), [apply](https://help.simplify.jobs/articles/1787280-apply-to-a-job-with-autopilot), [credits](https://help.simplify.jobs/articles/4455305-autopilot-credits-and-failed-applications), [index](https://help.simplify.jobs/)
- Jobright: [autofill](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/), [agent](https://jobright.ai/blog/jobright-launches-first-ai-agent-to-put-job-search-on-autopilot/), [Trustpilot](https://www.trustpilot.com/review/jobright.ai?page=3), [review](https://atsverification.com/blog/jobright-ai-review-2026/)
- [LazyApply Trustpilot](https://ca.trustpilot.com/review/lazyapply.com?page=3)
- [AIApply aggregator](https://checkthat.ai/brands/aiapply/reviews)
- [Sonara](https://resumly.ai/answers/what-happened-to-sonara-ai)
- [Massive](https://scoutify.com/blog/massive-review/)
- Tsenta: [YC](https://www.ycombinator.com/launches/SBV-tsenta-your-ai-career-agent-that-applies-to-jobs-lands-you-interviews), [YourStory](https://yourstory.com/2026/06/tsenta-wants-to-make-job-applications-faster-smarter-less-manual)
- Pinloop: [site](https://pinloop.ai/), [CLI](https://github.com/pinloop-ai/pinloop-cli)
- JobCopilot: [Trustpilot](https://uk.trustpilot.com/review/jobcopilot.com), [review](https://www.weekday.works/post/jobcopilot-review)
- [Huntr](https://huntr.co/)
- [Teal](https://tooldirectory.ai/tools/teal)
- [Kombo](https://docs.kombo.dev/ai-apply-candidate-account-creation)
- [MyGreenhouse](https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates)
- [Workday candidate accounts](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/career-sites/gtv1538650489786.html)
- LinkedIn: [ToS quotes](https://contentin.io/blog/linkedin-mcp-terms-of-service/), [OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [Proxycurl](https://www.startuphub.ai/ai-news/startup-news/2025/the-1-linkedin-scraping-startup-proxycurl-shuts-down)
- Handshake: [ToS](https://joinhandshake.com/tos), [applying](https://support.joinhandshake.com/hc/en-us/articles/218693418), [extension](https://www.extscope.org/extension/aedegffcgkjmbaefclfjlklommhmeokf)
- [Fingerprint](https://fingerprint.com/blog/job-application-fraud-detection/)
- [JobShinobi](https://jobshinobi.com/blog/how-to-use-email-to-track-job-applications-automatically)

**Fallbacks:**
- [TripIt](https://help.tripit.com/en/support/solutions/articles/103000063275-adding-travel-plans-to-tripit)
- [Expensify](https://community.expensify.com/discussion/2714/where-to-email-receipts-to-to-get-them-into-your-expensify-expenses)
- [LinkedIn export](https://www.technipages.com/download-linkedin-data/)
- [Connections.csv](https://docs.juicebox.ai/help/data-migration/linkedin-connections)
- [Gmail compose URL](https://til.simonwillison.net/google/gmail-compose-url)
- [Calendar template link](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/master/services/google.md)
- [a16z](https://a16z.com/can-agents-use-a-computer-yet-weve-got-the-data/)
- [Online-Mind2Web](https://arxiv.org/html/2504.01382v4)

**Internal repo evidence:**
- `docs/architect/ARCHITECTURE.md`
- `docs/architect/DECISIONS.md` (D-007, D-013, D-021, D-023, D-029)
- `docs/architect/work-orders/WO-038-channels.md`, `WO-048-workday.md`, `WO-096-email-code.md`, `WO-040-mail-accuracy.md`
- `docs/career/mail-tracking.md`
- `supabase/functions/_shared/career_mail_gmail.ts`, `career_email_code.ts`
