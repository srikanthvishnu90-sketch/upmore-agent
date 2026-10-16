// Career-only entry for the agent-chat function (owner decision 2026-10-15:
// the deployed artifact has no financial routes or full domain bundle). Staging
// installs this file as agent-chat/index.ts; its static import graph reaches
// only handler-career.ts, the career bundle (router_core.career.js),
// career_host.js and shared leaves, including optional model gateway helpers. The finance
// entry (index.ts -> handler.ts) remains in the repo, shelved.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { handleChat } from "./handler-career.ts";

serve(handleChat);
