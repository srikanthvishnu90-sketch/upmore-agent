// Career-only entry for the agent-chat function (owner decision 2026-10-15:
// the deployed artifact contains zero finance code). The deploy staging
// installs this file as agent-chat/index.ts; its static import graph reaches
// only handler-career.ts, the career bundle (router_core.career.js),
// career_host.js and the shared leaves the career path uses. The finance
// entry (index.ts -> handler.ts) remains in the repo, shelved.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { handleChat } from "./handler-career.ts";

serve(handleChat);
