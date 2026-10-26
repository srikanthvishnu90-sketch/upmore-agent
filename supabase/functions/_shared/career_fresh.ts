// Whether a posting is news when Trainee first sees it (WO-017). Its own module, with no imports, so what checks alerts
// at delivery (channel_store.ts, through career_alerts.ts) does not load the posting ingest and the router bundle it
// needs. career_ingest.ts re-exports both names.
// ------------------------------------------------------------------------------------------------ news vs backlog
// A board read for the first time brings its whole backlog in at once, every posting "first seen" now. A posting its
// employer published more than BACKLOG_MS before Trainee first saw it is a discovery, not news: searchable, never an
// alert or a "new in the last day". No publish time, or one that does not parse, keeps the old behavior (news).
export const BACKLOG_MS = 3 * 86400000;
export function freshWhenSeen(p: { posted_at?: string | null; first_seen_at: string }): boolean {
  const posted = Date.parse(String(p.posted_at ?? "")), seen = Date.parse(p.first_seen_at);
  return !Number.isFinite(posted) || !Number.isFinite(seen) || posted >= seen - BACKLOG_MS;
}
