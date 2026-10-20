# WO-064: the panel's questions drafted from confirmed facts; the person reviews, not types

## Why: the census (VERIFIED-S, 2026-10-20)
Prepare (WO-054) asks every open question once, in the panel. Each one is still typed or chosen by the person. Every
required question left open on samples A to H was counted: 574 postings, each planned with the complete synthetic TEST
persona (`PERSONA` in `evals/apply/fill-coverage.ts`). That is the best case: a person who has told Trainee everything
the rules can use.

**1,849 required questions are left open**, a median of 2 per posting that has any.

| What is open | Count | Example |
|---|---|---|
| The rules don't understand the question | 681 (37%) | "What is your most recent company?", "Desired salary per month (in your local currency)", "When do you anticipate completing your PhD?", "If residing in the U.S., please provide State" |
| A fact Trainee holds, but the options or the free text don't fit it | 330 (18%) | "Will you now or in the future require sponsorship? If so, please explain"; "Select your anticipated master's graduation date" (01/2027 …); "Undergraduate GPA" (3.5–4.0 …) |
| Essays | 291 (16%) | drafted on the card already (WO-049), on the person's tap |
| This posting's office schedule or place | 234 (13%) | "This role requires in-office presence 3 days per week in Austin. Are you comfortable?" |
| Experience with a named thing | 193 (10%) | "Do you have experience with SQL?", "How many years of experience with Terraform?" |
| Referral, relative, worked here before | 35 (2%) | "Were you referred by a current employee? If yes, who?" |
| Agreements, consents, files | 26 | stay with the person |

Even after the person answers every panel question, only 49 of 99 (A) and 44 of 100 (B) cards are fully ready.
The bottleneck to volume is the person's typing, not the browser.

The model reads meaning; the rules don't. A model can propose an answer from the person's confirmed facts, and code can
refuse any answer it cannot trace. The person then **reviews a list of drafted answers** in the panel and confirms them
with one tap. Nothing is drafted that the facts don't carry (D-007), and nothing reaches an employer before the person
approves the card's exact payload (unchanged).

## What to build

### 1. `supabase/functions/_shared/answer_draft.ts` (pure, with injected model and facts)
```ts
export interface ShortQuestion { key: string; label: string; type: string; options: string[]; company: string; location?: string | null }
export type ShortDraft =
  | { key: string; ok: true; answer: string; fact_ids: string[]; from: string[] }        // from: fact labels shown on the panel
  | { key: string; ok: false; why: ShortWhy };
export type ShortWhy = "never" | "no_fact" | "not_an_option" | "unverified" | "negative_from_absence" | "model" | "cap";
export const BATCH = 25;          // questions per model call
export function neverDraft(label: string): string | null;              // the reason, or null
export function vetoDraft(q: ShortQuestion, p: { answer: unknown; fact_ids: unknown }, facts: unknown[]): ShortDraft;
export async function draftShortAnswers(qs: ShortQuestion[], deps: { model: ModelFn; facts: () => Promise<unknown[]> | unknown[] }): Promise<ShortDraft[]>;
```
- **Never drafted, never sent to the model** (`neverDraft`):
  - criminal history, convictions, background checks, drug tests;
  - a government's question about the person: security clearance held, renounced citizenship, export control or sanctions
    status, debarment, public trust suitability;
  - EEO, self-identification, disability, veteran status, race, gender, age, pronouns;
  - identity numbers, signatures, dates of birth;
  - consent and attestation wording ("I certify", "I agree", "I consent", "I acknowledge").

  The panel already leaves files, essays and agreements on the card (`leftForCard`). `neverDraft` is a second, server-side
  wall, because the request comes from a browser.
- **Only confirmed facts** reach the model: `confirmedFacts` from `essay_draft.ts`. Never a fact waiting for the
  person's yes, and never a fact sent in the request.
- **The veto** (code decides; the model only proposes):
  - Each `fact_ids` entry must name a confirmed fact. With none named: `no_fact`.
  - A question with options gets one of its own options, matched by `norm` and returned in the option's own spelling.
    Otherwise `not_an_option`. A multi-select answer is a `; `-joined list of its own options.
  - Free text passes `factLock(answer, [cited facts' text, label, company, location, options])`. Otherwise `unverified`.
  - **A "no" is never drafted from the absence of a fact.** On an experience, referral, relative or worked-here
    question, a negative answer ("No", "None", "0", "No experience", "N/A") needs a cited fact that states the
    negative. Otherwise `negative_from_absence`: the person answers it.
  - A "yes" to an experience question needs a cited fact whose text names the thing asked about.
- **One model call per 25 questions.** The response is JSON, `{"drafts":[{"key","answer","fact_ids"}]}`, and a missing
  key is `no_fact`. A model failure is `model` for every question in that batch; it never throws.

### 2. The edge: `career-answer-draft` (the essay card's pattern)
- `supabase/functions/_shared/career_answer_card.ts`: `readShortRequest`, `answerCardDrafts`, `handleAnswerDraft`.
  - The signed-in person's own JWT only; the role must be `authenticated`.
  - POST `{ questions: ShortQuestion[] }`, at most 200 questions. Every other key is ignored: a `facts` key never reaches
    the model.
  - Facts come from `supabaseFacts` (the essay card's, reused).
  - OpenAI only: `essayModelConfig`.
- **At most 600 drafted questions a person in 24 hours**, counted in `career_events` (source `answer_card`, one row per
  model call carrying its question count). Past the cap, every question is `cap`.
- `supabase/functions/career-answer-draft/index.ts` (verify_jwt true in `supabase/config.toml`), and the go-live
  script's function list.

### 3. The extension's panel
- Prepare's panel (WO-054) gets **Draft from my facts**. On the person's tap, the background sends the panel's open
  questions to `career-answer-draft`, at most 200, in one call. Each question goes with its first posting's label,
  options and company, and with `own_words` when a posting's form asks for the person's own words (the survey reads
  the form's AI policy: `ownWordsAsked`).
- Under each drafted question the panel shows "Trainee's draft: <answer> (from your facts: <fact labels>)".
  **Nothing is chosen.** WO-054's rule stands: every choice starts empty.
- **Use these drafts** puts each draft into its choice, only on the person's tap, only into an empty choice (never over
  one they made), and only when the answer is one of that question's own options. The person checks them, changes any,
  and presses **Save my answers**. That is the existing save (answerOnceRows → saved answers).
- No draft is ever filled on a form directly.

### 4. Measure (`evals/apply/answer-draft.ts`, CI `answer-draft-eval.yml` on `ci/answer-draft`, $5 cap)
- **The persona.** The TEST persona as confirmed facts, plus a synthetic TEST work history (3 jobs, 1 school, 12
  skills, each with evidence). Synthetic, never the owner's (privacy rule).
- **Samples A–H:**
  - questions drafted;
  - each veto reason;
  - cards fully ready after the panel's drafts are saved (and with the rest answered);
  - **stops per posting**: open required questions with no draft, mean and median.
- **Sample I** is captured fresh (seed 9, no employer from A–H) and scored **once**. Two independent reviewers read every
  drafted answer against the persona and the posting.
- **Targets:**
  - wrong drafted answers **≤ 0.5%**;
  - stops per posting (mean) **≤ 1**;
  - cards fully ready once the drafts are saved **≥ 70%**.

## Acceptance tests (written first; `tests/architect/wo-064-short-drafts.test.ts`, and the browser test "answer once drafts")
1. `neverDraft` refuses each class above and passes ordinary questions.
2. A never-drafted question is never in the model's payload. An unconfirmed fact's text is never in it.
3. An option answer comes back in the option's own spelling; an answer outside the options is `not_an_option`.
4. A free-text answer naming an employer, number or tool not in the cited facts is `unverified`.
5. "No" to "Do you have experience with SQL?" with no fact stating it is `negative_from_absence`. "Yes" with a cited
   SQL fact passes. "Yes" citing a fact that never names SQL is `unverified`.
6. A cited fact id that is not a confirmed fact is `no_fact`.
7. 60 questions take 3 model calls; a failing model gives `model` for its batch only, and nothing throws.
8. The handler: no JWT gives 401; a service-role JWT gives 403; `facts` in the body is ignored; past the cap every
   question is `cap`, and the model is not called.

## Demo (owner)
1. Sign in on the extension, add 10 postings and press Prepare.
2. Press **Draft from my facts**. Under most questions: "Trainee's draft: …" and the facts it came from. Nothing is
   chosen yet.
3. Press **Use these drafts**, change one, then press **Save my answers**. Open a card: the answers are there, and the card
   still waits for Approve.

## Out of scope
- Essays (WO-049).
- Office-schedule questions: a standing answer is the person's choice, offered in WO-074 after this order measures.
- Files.
- Agreements.
- Anything filled without the person's tap.

## Size cap
About 900 lines of code and tests, excluding fixtures and the eval's output.
