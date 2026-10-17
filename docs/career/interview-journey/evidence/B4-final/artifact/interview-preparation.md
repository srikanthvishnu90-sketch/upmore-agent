# Interview preparation pack

Status: complete

## Target and constraints

Role: Software engineer intern; company: Synthetic Tools; level: early-career; stage: unknown

Resume: resume@1

Available minutes: 90

Interview timing: not supplied

Daily study minutes: null

Unknowns: interview stage

## Role and company brief

The supplied current role capture emphasizes backend review and retry reasoning. The project supports a truthful proposal-and-review story. It does not establish that the candidate implemented the system.
Limits: Fictional development source; no employer prediction, live capture or real quality measurement.
Source refs: \[\{"id":"role-source","version":2\},\{"id":"project","version":1\},\{"id":"target","version":1\},\{"id":"resume","version":1\}\]; checked advisory synthesis, quality unmeasured.

Synthetic intern role — https://example.test/careers/intern — as of 2026-10-16T12:05:00Z (complete\_excerpt, official\_role\_description)
Synthetic current role: review backend changes and reason about retries. Interview is a design discussion; no guaranteed question list.
Capture is evidence of source content, not validated synthesis.

## Prioritized preparation plan

technical: 24 minutes. The captured role names retry behavior; practice invariant and failure recovery reasoning. Evidence: \[\{"id":"role-source","version":2\},\{"id":"target","version":1\},\{"id":"resume","version":1\}\]

project: 20 minutes. Ground a truthful narrative in actual experience. Evidence: \[\{"id":"project","version":1\},\{"id":"target","version":1\},\{"id":"resume","version":1\},\{"id":"role-source","version":2\}\]

behavioral: 20 minutes. Separate personal contribution, team decisions and evidence. Evidence: \[\{"id":"project","version":1\},\{"id":"target","version":1\},\{"id":"resume","version":1\},\{"id":"role-source","version":2\}\]

pack: 10 minutes. Review and save current evidence with unassessed gaps explicit. Evidence: \[\{"id":"project","version":1\},\{"id":"target","version":1\},\{"id":"resume","version":1\},\{"id":"role-source","version":2\}\]

## Truthful story bank

project@1: I proposed duplicate detection for a class import tool; a teammate implemented it. A small test batch stopped duplicating rows; production was not measured. — source \{"source\_id":"resume-v1","span":"synthetic source excerpt"\}

## Original and revised answers

synthetic-journey:attempt:submit\_answer-4 / project-narrative / initial; assistance: none; parent: none
The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.
SHA-256: e4001ac0974f0485fcffa5c20f4b0ab37aa33c2dc91a4b57bcd4fab16347b484

synthetic-journey:attempt:submit\_answer-8 / project-narrative / practice; assistance: coached; parent: synthetic-journey:attempt:submit\_answer-4
My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.
SHA-256: a56ab8acba02455f5cc460a662ca16bb356334fa744233e571214d0ec9d69a64

synthetic-journey:attempt:submit\_answer-12 / project-narrative / revision; assistance: coached; parent: synthetic-journey:attempt:submit\_answer-8
For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.
SHA-256: 29527b6319179e3f7b569a3617e02e61f52482f31ecfb833e453a19871b3f161

synthetic-journey:attempt:submit\_answer-16 / handoff-transfer / transfer; assistance: none; parent: none
In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.
SHA-256: 10736e4fd3724720fee39e0e6f909e566c9cadcc9f54ff930c973623608d0e07

synthetic-journey:attempt:submit\_answer-20 / retry-design / initial; assistance: none; parent: none
Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.
SHA-256: c152cb02decbc505016851da42e9220a6a58a37f4fd9168806d63b0eab49a31a

synthetic-journey:attempt:submit\_answer-24 / team-decision / initial; assistance: none; parent: none
In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.
SHA-256: 911dc314b6e018df8473cb7d2907f36a6dba81ecf8fefed2f99f36c28834dd97

Draft synthetic-journey:draft:model\_candidate-26@1; generated wording, not a canonical fact. Attempts: synthetic-journey:attempt:submit\_answer-24
In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.

## Feedback, practice and transfer

synthetic-journey:assessment:model\_candidate-6; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; project
Separate the action you proposed from work performed by your teammate; describe only the small test observation.
situation: 2. Synthetic boundary response; no real quality judgment. Support: The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.. Uncertainty: Not independently assessed
personal contribution: 2. Synthetic boundary response; no real quality judgment. Support: The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.. Uncertainty: Not independently assessed
outcome evidence: 2. Synthetic boundary response; no real quality judgment. Support: The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.. Uncertainty: Not independently assessed
reflection transfer: 2. Synthetic boundary response; no real quality judgment. Support: The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

synthetic-journey:assessment:model\_candidate-10; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; project
This practice statement separates proposal from implementation and limits the outcome to the observed batch. In the revised story, connect the retry rule to the duplicate-effect risk.
situation: 2. Synthetic boundary response; no real quality judgment. Support: My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.. Uncertainty: Not independently assessed
personal contribution: 2. Synthetic boundary response; no real quality judgment. Support: My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.. Uncertainty: Not independently assessed
outcome evidence: 2. Synthetic boundary response; no real quality judgment. Support: My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.. Uncertainty: Not independently assessed
reflection transfer: 2. Synthetic boundary response; no real quality judgment. Support: My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

synthetic-journey:assessment:model\_candidate-14; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; project
The revision explains the proposed guard and keeps implementation credit and outcome limits explicit. Try the handoff situation without copying the draft.
situation: 2. Synthetic boundary response; no real quality judgment. Support: For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.. Uncertainty: Not independently assessed
personal contribution: 2. Synthetic boundary response; no real quality judgment. Support: For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.. Uncertainty: Not independently assessed
outcome evidence: 2. Synthetic boundary response; no real quality judgment. Support: For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.. Uncertainty: Not independently assessed
reflection transfer: 2. Synthetic boundary response; no real quality judgment. Support: For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

synthetic-journey:assessment:model\_candidate-18; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; behavioral
This hypothetical keeps contribution and measurement claims separate. This is a scripted transfer observation, not proof of mastery.
situation: 2. Synthetic boundary response; no real quality judgment. Support: In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.. Uncertainty: Not independently assessed
personal contribution: 2. Synthetic boundary response; no real quality judgment. Support: In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.. Uncertainty: Not independently assessed
outcome evidence: 2. Synthetic boundary response; no real quality judgment. Support: In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.. Uncertainty: Not independently assessed
reflection transfer: 2. Synthetic boundary response; no real quality judgment. Support: In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

synthetic-journey:assessment:model\_candidate-22; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; technical
The static explanation identifies the atomic boundary and distinguishes local database effects from external delivery. Retention and canonical payload rules still need explicit requirements; no code was executed.
requirements assumptions: 2. Synthetic boundary response; no real quality judgment. Support: Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.. Uncertainty: Not independently assessed
correctness invariant: 2. Synthetic boundary response; no real quality judgment. Support: Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.. Uncertainty: Not independently assessed
validation recovery: 2. Synthetic boundary response; no real quality judgment. Support: Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.. Uncertainty: Not independently assessed
clear approach: 2. Synthetic boundary response; no real quality judgment. Support: Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

synthetic-journey:assessment:model\_candidate-26; provisional practice judgment by SCRIPTED\_CONTRACT\_FIXTURE; behavioral
The account separates your reasoning from teammate implementation and uses a limited observation. It does not claim that the suggested concurrency checks were run.
situation: 2. Synthetic boundary response; no real quality judgment. Support: In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.. Uncertainty: Not independently assessed
personal contribution: 2. Synthetic boundary response; no real quality judgment. Support: In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.. Uncertainty: Not independently assessed
reasoning tradeoffs: 2. Synthetic boundary response; no real quality judgment. Support: In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.. Uncertainty: Not independently assessed
outcome evidence: 2. Synthetic boundary response; no real quality judgment. Support: In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.. Uncertainty: Not independently assessed
reflection transfer: 2. Synthetic boundary response; no real quality judgment. Support: In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.. Uncertainty: Not independently assessed
Priority: Scripted gap: inspect the relevant boundary.; uncertainty: Scripted development only.

initial: personal contribution; assistance: none; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-4)

targeted practice: personal contribution; assistance: coached; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-8)

same question revision: personal contribution; assistance: coached; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-12)

transfer: personal contribution; assistance: none; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-16)

initial: correctness invariant; assistance: none; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-20)

initial: personal contribution; assistance: none; outcome: uncertain. Scripted development only. (Attempt synthetic-journey:attempt:submit\_answer-24)

## Remaining preparation and deferrals

Remaining declared time: 90 minutes. Time spent is user/host reported, never inferred.

technical: extended work deferred to fit the declared remaining time.

Current company research requires an approved source/capture; missing research does not block experience practice.

## Questions to ask the interviewer

Generic, not company-specific: What would a successful first project look like for someone at this level?

Generic, not company-specific: How does the team review design choices and validate changes?

## Day-of checklist

Appointment time, meeting link, interviewer and location have not been supplied. Confirm them from your own invitation.

## Evidence and version appendix

Journey synthetic-journey, revision 22; context 467cdbc990d1c993822674c7314c83ffa064b611971074f394915ee12b448b79; epoch 1.

project@1; user\_supplied; provenance \{"source\_id":"resume-v1","span":"synthetic source excerpt"\}

target@1; user\_supplied; provenance \{"source\_id":"resume-v1","span":"synthetic source excerpt"\}

resume@1; user\_supplied; provenance \{"source\_id":"resume-v1","span":"synthetic source excerpt"\}

role-source@2; host\_capture; provenance \{"source\_id":"resume-v1","span":"synthetic source excerpt"\}

Assisted revision and unassisted transfer are separate observations. No aggregate mastery or hiring score is calculated.
