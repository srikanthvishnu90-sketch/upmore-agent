# Applicant ingress — source-only continuation

No existing file-upload ingress was found in the career handler/app/function source. The new standalone `supabase/functions/career-applicant/index.ts` uses verified Supabase Auth identity and the existing backend RPC credentials, without editing agent-chat, onboarding, native conversation or native browser files. Nothing is deployed or credential-bound.

The source API has three distinct steps:

- `POST /uploads`: multipart `threadId`, `requestId`, one original PDF/DOCX `file`. The server validates an authenticated owner before bounded body parsing; it preserves bytes and creates an unconfirmed owned upload. File text never becomes applicant facts.
- `POST /review`: JSON `threadId`, `uploadId`, `fields`. Only explicit supported standard text fields may appear. The response binds owned upload metadata, account version/epoch, thread and exact fields to a server review hash. No field is confirmed by this read.
- `POST /confirm`: JSON `threadId`, `requestId`, `uploadId`, `reviewHash`, `fields`, `message`. Resume-only confirmation requires `use this resume`; confirming any field additionally requires `use this resume and confirm these fields`. Both require the exact owned upload/review reference. A bare phrase without those references, generic yes, extracted page text, or a client owner ID is rejected.

Shared `career_applicant_ingress.js` is used directly by the actual Deno entry. Tests execute that entry graph with synthetic Auth identity and local SQL transport; no fixture handler stands in for it. Request hashes cover the exact typed action and its metadata. Unknown write outcomes are unavailable and tell the client to reuse the same request ID; the handler never retries a write automatically.

`career_applicant_format.js` validates a bounded plain PDF/DOCX container, MIME, extension, filename, size, ZIP structure/CRC and expansion budget. It never rewrites bytes or extracts profile facts. The PDF pilot dialect requires traditional xref tables and refuses encrypted/active-content forms; DOCX refuses encrypted/macro/embedded-object/DTD forms. Unsupported documents return an explicit format refusal. This is container validation, not a full PDF/OOXML semantic validator or malware certification. The file limit is 1 MiB; decompression is bounded. Node-compatible zlib is [documented by Deno](https://docs.deno.com/api/node/zlib/); no Deno binary is installed here, so a real Edge-runtime check remains a deployment gate.

The forward SQL proposal and authenticated-request-to-database tests are in progress at this initial source checkpoint. The endpoint fails closed without those RPCs. The original resume-store proposal remains unapplied. No live user resume, application or employer receipt is represented by these source/unit checks.
