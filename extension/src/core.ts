// The one bundle the extension loads everywhere (service worker, content script, panel): globalThis.TraineeCore.
// Built by `deno run -A extension/build.ts` into extension/lib/trainee-core.js; `--check` fails when the checked-in
// bundle is not what these sources build (tests/architect/wo-031-extension.test.ts runs it). Nothing here is copied: the
// planner, question map, answer keys, payload hash and ask-once helpers are the apply stack's own modules.
import { classifyField, classifyOutcome, fileAlternative, normLabel, planBatch, rowsToAdd } from "../../supabase/functions/_shared/career_apply.ts";
import { answerKey, mapQuestion, NEVER_BY_TEXT } from "../../supabase/functions/_shared/question_map.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { factsWithTextAnswers, jwtRole, questionsToStore } from "../../workers/career-browser/ask-once.ts";
import { bindFields } from "../../scripts/career/form-bind.ts";
import * as core from "./apply_core.ts";
import * as dom from "./dom.ts";

(globalThis as any).TraineeCore = {
  planBatch, rowsToAdd, classifyField, classifyOutcome, fileAlternative, normLabel, answerKey, mapQuestion, NEVER_BY_TEXT, hashApplyPayload,
  factsWithTextAnswers, questionsToStore, jwtRole, bindFields, ...core, dom,
};
