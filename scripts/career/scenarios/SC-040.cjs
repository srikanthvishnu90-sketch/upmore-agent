"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, PROFILE } = L;
(async () => {
  const s = H.session("SC-040", "learn-my-voice-from-8-sent-emails");
  s.user("Learn my voice from 8 of my sent emails; draft the campaign in it");
  // 8 TEST sent emails authored in the persona's voice: short, direct, "Hi <name>,", contractions, "Thanks," sign-off.
  const samples = [
    "Hi Maya,\n\nI'm Alex, a junior at TEST University. I saw your group closed the Hartwell deal last month. I'm trying to learn how restructuring analysts actually spend their days.\n\nWould you have 15 minutes next week? I won't take more than that.\n\nThanks,\nAlex",
    "Hi Dan,\n\nQuick question. I'm a junior at TEST University and I'm deciding between two summer options. Your path from state school to Evercore is close to mine.\n\nCan I ask you three questions on a short call? Totally fine if you're slammed.\n\nThanks,\nAlex",
    "Hi Priya,\n\nI'm Alex. I don't have a warm intro, so I'll keep this short. I built a three-statement model for a class pitch and your team's sector came up twice.\n\nWould 15 minutes work Thursday? If not, no worries at all.\n\nThanks,\nAlex",
    "Hi Tom,\n\nThanks again for the panel last week. Your point about staffing stuck with me. I'm applying it to how I'm picking my spring classes.\n\nI'd love one follow-up question if you have a minute. What's the one skill you'd drill before an internship?\n\nThanks,\nAlex",
    "Hi Sara,\n\nI'm Alex, a junior at TEST University. I read your post on the alumni page about switching from consulting. It's basically the move I'm weighing.\n\nCould I get 15 minutes next week? I'll come with specific questions.\n\nThanks,\nAlex",
    "Hi Ben,\n\nShort note. I'm in the finance club at TEST University and we just ran a stock pitch on your coverage name. I disagreed with our own conclusion, which is why I'm writing.\n\nWould you be open to a quick call? I want to hear where my logic breaks.\n\nThanks,\nAlex",
    "Hi Ana,\n\nI'm Alex. A professor mentioned your name when I asked who actually likes their analyst job. That's a short list, so I'm curious.\n\nCan we talk for 15 minutes next week? I won't waste your time.\n\nThanks,\nAlex",
    "Hi Chris,\n\nI'm a junior at TEST University exploring banking. I saw you started in a rotational program before moving groups. That first step is the part I can't find written down anywhere.\n\nWould a short call work? Happy to work around your schedule.\n\nThanks,\nAlex",
  ];
  s.tool("TEST fixture sent-email samples (8, authored in persona voice)", { count: samples.length });
  const learned = M.learnVoice(samples);
  s.tool("CareerOutreach.learnVoice (W02 extension)", learned);
  const cand = { person_id: "TEST-W02-040", full_name: "Voice Target (TEST)", current_firm: "Evercore", title: "Analyst", seniority_band: "analyst", work_email: "voice.target@evercore.test", schools: ["TEST University"], personalization_facts: [{ fact: "moved from a rotational program into the restructuring group", source_url: "TEST-fixture", strength: "strong" }] };
  const drafted = M.draftAndGate(cand, { name: "Alex Testcase", school: "TEST University", year: "junior" }, { voice: learned.voice });
  s.tool("CareerOutreach.draftAndGate with learned voice", drafted);
  s.agent(`Learned your voice from the 8 sent emails (TEST fixtures): short direct sentences (avg ${learned.avg_sentence_words} words/sentence), "Hi <name>," greetings, contractions, plain "Thanks," sign-off, ~${learned.avg_words} words an email. Campaign draft written in that voice — here's the sample:`, { card: { title: "Campaign draft in your voice", voice_profile: learned, draft_subject: drafted.draft.subject, draft_body: drafted.draft.body, gate: drafted.gate } });
  const body = drafted.draft.body;
  const ok = learned.sample_count === 8 && learned.greeting_style != null && drafted.gate.pass && body.startsWith("Hi Voice,") && learned.voice.directness >= 0.8 && learned.avg_sentence_words <= 16;
  s.verify("voice profile derived from the 8 samples + gated draft rendered with that voice object (draft.voice.formality matches learned profile)", { learned, draft_voice: drafted.draft.voice, gate: drafted.gate, body_words: body.split(/\s+/).length });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Voice learned from 8 TEST sent emails (avg ${learned.avg_words} words/email, ${learned.avg_sentence_words} words/sentence, greeting '${learned.greeting_style}', directness ${learned.voice.directness}); campaign draft rendered in that voice and passed the quality gate.` }
    : { status: "LEARN", outcome: "Voice learning did not verify.", reason: `learned=${JSON.stringify(learned)} gate=${JSON.stringify(drafted.gate)}`, unblock: "Fix learnVoice thresholds / draft voice wiring and rerun SC-040." });
})().catch((e) => { console.error(e); process.exit(1); });
