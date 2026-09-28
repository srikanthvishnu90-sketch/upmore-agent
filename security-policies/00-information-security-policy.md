# Upmore Information Security Policy (Master)

- **Owner:** Vishnu Srikanth, Founder (sole owner — every control below names him explicitly)
- **Security contact:** Vishnu Srikanth, Founder — vishnusrikanth8@gmail.com
- **Version:** 1.0 — 2026-09-27
- **Adoption:** ADOPTED 2026-09-27 by the Founder, Vishnu Srikanth, who commissioned this suite and directed it be put into force. This suite (00–10) is Upmore's official information security policy from this date forward. The Founder may amend or revoke any part at any time; amendments are versioned with a new date above.
- **Review cadence:** annually, and after any incident or material architecture change
- **Status convention used across this suite:** `[IN PLACE]` = true in production today · `[PARTIAL]` = partly true · `[TO IMPLEMENT]` = not yet true (founder checklist item)

## 1. Objective

Protect the confidentiality, integrity, and availability of Upmore's systems and user data, with a bias toward **not holding sensitive data at all** — the cheapest breach is the one with nothing to steal. Structure follows NIST Cybersecurity Framework / ISO 27001 Annex A, scaled to a one-person company: no theater, every control has an owner, a cadence, and a concrete procedure.

## 2. Scope

Everything Upmore runs or touches: the Vercel-hosted web app, the Supabase project `mrwngntwmnaqrqhupvlt` (Postgres + RLS, Vault, Edge Functions, Auth), third-party processors (Anthropic API, SimpleFIN, Plaid once approved, Stripe once live), the GitHub repo, and the founder's admin workstations/accounts.

## 3. Roles

| Role | Person | Responsibility |
|---|---|---|
| Information security owner | Vishnu Srikanth, Founder | All of it: approves these policies, runs every procedure, responds to incidents |
| Data protection contact | Vishnu Srikanth, Founder — vishnusrikanth8@gmail.com | User data requests (export/delete), regulator/partner contact |

There are no employees or contractors. If that ever changes, 02-access-control.md defines the onboarding/deprovisioning procedure. `[IN PLACE]`

## 4. Guiding principles

1. **Data minimization first.** If we don't need it, we don't collect it. If we don't need to keep it, we delete it. Financial data is processed transiently and never stockpiled. (See 01.)
2. **Least privilege.** Every component gets the minimum access it needs: RLS-scoped user data, service_role confined to Edge Functions, secrets confined to Vault/env. (See 02.)
3. **Defense in depth.** TLS everywhere, encryption at rest, no secrets in code, CSP, JWT-verified functions. No single layer is trusted alone. (See 03, 07.)
4. **Honesty over posture.** Controls are tagged `[IN PLACE]` / `[PARTIAL]` / `[TO IMPLEMENT]`. We never claim a control exists until it does.
5. **User control.** Read-only banking/investments — Upmore can never move money. Users can export or delete everything on request. (See 01.)

## 5. Policy suite index

| # | Document | Covers |
|---|---|---|
| 01 | Data minimization, retention & deletion | What we collect, where it lives, how long, how it's deleted |
| 02 | Access control | Roles, RLS, service_role, admin access, reviews |
| 03 | Encryption standard | TLS 1.2+, at-rest encryption, Vault |
| 04 | Authentication standard | Consumer auth, admin MFA, roadmap |
| 05 | Vulnerability management | Patching cadence, dependency hygiene, EOL monitoring |
| 06 | Incident response | Detection → containment → notification → post-mortem |
| 07 | Secure development | No secrets in repo, CSP, self-review checklist |
| 08 | AI data handling | agent-chat → Anthropic data flow, retention, no training use |
| 09 | Product boundaries & regulatory avoidance | Read-only money, no advice, no guarantees/contests — the licensing-avoidance controls |

## 6. Exceptions

Any deviation from these policies requires a written note by the Founder stating what, why, for how long, and the compensating control. Exceptions expire after 90 days unless renewed. `[TO IMPLEMENT]` — template to be added to this file when first needed.

## 7. Enforcement

Violation by any future employee/contractor = access revoked pending review. For the founder, enforcement is the annual self-review checklist in 02-access-control.md. `[IN PLACE]`
