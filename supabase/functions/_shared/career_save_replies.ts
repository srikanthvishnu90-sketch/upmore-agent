// What a refused save can truthfully say. A tool that writes the person's own data (a standing instruction, an
// application queued, a profile fact) writes before the turn is committed, so a refused commit does NOT undo it: the
// reply says the answer was not saved and that anything it had already changed stays, and that nothing was sent or
// submitted (nothing external happens without the person's approval of the exact payload). "Nothing new was started"
// is kept as a sentence because tests/architect/flow-account-memory.test.ts pins it for a stale commit.
const KEPT = "Nothing new was started, and nothing was sent or submitted. If this message had already saved something (a standing instruction, or applications in your queue), that stays saved.";
export const CONFLICT_REPLIES: Record<string, string> = {
  revision_conflict: `I couldn't save my answer to that message because your conversation moved on while I was answering it. ${KEPT} Send it again and I'll answer it.`,
  turn_key_conflict: `I couldn't save my answer because this message looks like a repeat of an earlier one that had different content. ${KEPT} Send it again as a new message.`,
  task_event_conflict: `I couldn't save my answer because the job it was about changed while I was answering. ${KEPT} Send it again and I'll answer it from where things stand now.`,
  watch_profile_conflict: `I couldn't save my answer because your job alerts changed while I was answering. ${KEPT} Send it again and I'll answer it from your alerts as they are now.`,
  privacy_epoch_changed: "I couldn't save my answer because your saved career data was removed while I was answering, so nothing from this message was kept. Nothing new was started, and nothing was sent or submitted. Send it again if you want to carry on.",
};
export const CONFLICT_REPLY = CONFLICT_REPLIES.revision_conflict;
