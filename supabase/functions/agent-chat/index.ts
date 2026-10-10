import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { handleChat } from "./handler.ts";

serve(handleChat);
