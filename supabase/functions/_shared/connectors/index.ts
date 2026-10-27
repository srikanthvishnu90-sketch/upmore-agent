// FEATURE NEEDS (2026-10-26): the connectors Trainee has. Microsoft (Outlook) is planned, not built: it is added here.
import type { Connector } from "./types.ts";
import { google } from "./google.ts";

export const CONNECTORS: Record<string, Connector> = { google };
export const connectorOf = (id: string | null | undefined): Connector | null => (id && Object.hasOwn(CONNECTORS, id) ? CONNECTORS[id] : null);
export type { Capability, Connector } from "./types.ts";
