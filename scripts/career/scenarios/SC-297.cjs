"use strict";
// SC-297 (canonical) "Add Kubernetes — I watched a video once" — skill flagged unproven; a real project suggested.
// Uses a FRESH TEST profile: in the canonical persona Kubernetes is genuinely evidenced (DeployBoard),
// so this scenario exercises the video-only basis the canonical line describes.
const { H, Profile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-297", "kubernetes-video-unproven");
  s.user("Add Kubernetes — I watched a video once");
  const p = Profile.createProfile({ basics: { name: "TEST Learner" } });
  const skill = Profile.addFact(p, { kind: "skill", name: "Kubernetes", title: "Kubernetes", text: "Skill: Kubernetes (basis stated by user: watched a video once)", skills: ["Kubernetes"], evidence: [], source: "user-stated" });
  s.tool("CareerProfile.addFact(skill, no evidence)", skill);
  const ev = Profile.skillEvidence(p, "Kubernetes");
  const unproven = Profile.unprovenSkills(p).map((f) => f.name);
  s.tool("CareerProfile.skillEvidence(Kubernetes) + unprovenSkills", { ev, unproven });
  s.agent(`Added — but flagged honestly: Kubernetes is on your profile as UNPROVEN. Watching a video isn't evidence a screener (or my truth audit) can use, so it can't support a tailored resume line yet. The fastest real proof: a small project — deploy one of your own apps on a local Kubernetes cluster (kind or minikube), put the manifests + a README in GitHub, and tell me when it's up. The moment that exists, the skill becomes evidenced and usable.`, { card: { type: "skill_flag", title: "Kubernetes: unproven", skill: "Kubernetes", unproven: true, suggested_project: "Deploy one of your own apps on a local Kubernetes cluster (kind/minikube); publish manifests + README; then it becomes evidenced." } });
  const ok = skill.unproven === true && ev.proven === false && ev.evidenceFactIds.length === 0 && unproven.join() === "Kubernetes";
  s.verify("profile state: the video-basis skill carries unproven=true, skillEvidence reports proven=false with zero evidence facts, and it appears in unprovenSkills — it cannot support a tailored claim", { ok, unproven_flag: skill.unproven, proven: ev.proven, evidence_ids: ev.evidenceFactIds });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Kubernetes was added but flagged UNPROVEN (a watched video is not evidence), so the truth audit cannot use it — and a concrete real project was suggested that would earn the evidence." }
    : { status: "LEARN", outcome: "Unproven flagging failed — a video-only skill would have been claimable.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix skill evidence flags in 122 and rerun SC-297." });
})().catch((e) => { console.error(e); process.exit(1); });
