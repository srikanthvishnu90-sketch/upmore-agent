# Actual directed connections and effects

| From → to | Access and source time | Allowed effect | Forbidden/unsupported effect |
| --- | --- | --- | --- |
| Browser → Supabase Auth | Established session; cached JWT refreshed through Auth callbacks | Authenticate actual owner | Body `user_id` as authority; viewer becomes payer |
| Browser → agent-workflows | Auth JWT; server extracts identity; bill facts carry observed_at/revision | Read owner's records; explicitly save user assertions; exact proposal review via protected RPC | Connection equals blanket money authority; inferred recurring charge equals verified debt |
| Ledger review → review RPCs | Auth-bound transaction hash/current posted record; linked candidates are suggestions | Immutable explicit classification; atomic reciprocal pair; capped linked refund | Rewrite source bank facts; silently select a transfer partner; approve money through classification |
| Finance service → simplefin-proxy | User-context invocation; owner-namespaced Vault reference; balance_as_of/fetched_at preserved | Supported authorized account reads | Trade, transfer, card lock or token disclosure |
| Finance service → normalized ledger | Immutable revision/hash and ingestion timestamps; removals/corrections explicit | Retain/reconcile records and regenerate deterministic totals | Missing amount treated as zero; stale source as current; claimed original raw provider payload |
| Chat → ten financial tools | Minimum owner-bound context; computed result/date/coverage fields | Interpret, calculate, prepare and explain | Create approval, widen access, choose unsupported provider or fabricate receipt |
| Biller service → adapter registry | `BILLER_ADAPTERS=[]` | Return unsupported; retain candidate/research state | Fake live rent/Affirm account access |
| Payment service → adapter registry | `EXECUTION_ADAPTERS=[]`; registered verified adapter required | Preserve safe preparation; block unsupported production submission | Read-token payment; blind resend after uncertain network result |
| Payment worker → provider status | Synthetic contract only in this checkout; original idempotency key/receipt | Query existing submission; distinguish pending, settled, applied and returned | Accepted receipt becomes paid bill; settle on model wording |
| Inbound provider → inbox | Provider signature/time/replay and tenant/channel binding contracts | Deduplicate supported authenticated event; durable turn/outbox | Provider callback creates owner approval; malicious message changes payee |
| Outbox → transport | `MESSAGE_TRANSPORTS=[]`; LoopMessage factory unregistered/unverified | Keep unsupported delivery visible | Claim an iMessage was delivered; contact user/vendor during development |
| Build → generated static files | Local builder/CSP/service-worker cache version | Rebuild reviewable artifacts | Automatic push, merge or Vercel deployment |

No connector supplies universal bank-app parity. Cards, deposit custody, check/cash deposit, credit reports, EBT security, wallet tokenization, private offerings, reward attribution and brokerage trading need separate supported capability/permission records. Manual/import/history, synthetic adapters, partner sandbox and production must remain different modes.
