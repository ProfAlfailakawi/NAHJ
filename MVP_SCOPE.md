# NAHJ (نهج) — MVP Scope & Verification Scenario

## 1. Golden Scenario: Future Academy Admission (أكاديمية المستقبل)
The end-to-end loop must execute:
1. **Teach Phase:** Staff teaches the New Student Admission process via Teach Mode.
2. **Synthesize & Clarify:** AI discovers steps, rules, and missing conditions, then generates a Skill Proposal.
3. **Approve & Codify:** Manager approves `New Student Admission v1`.
4. **Practice & Evals:** AI runs 10 evaluation test cases, scores 95%, passes.
5. **Shadow Run:** Comparison between Human decision and AI decision demonstrates safety.
6. **Live Customer Interaction:** Simulated Guardian ("السلام عليكم أبي أسجل ولدي") inputs child info (Yousef Ahmad, age 5, KG2).
7. **Document Verification:** Civil ID uploaded, verified via OCR/Vision check.
8. **Live Data Integration:** Seat checked via fake SIS connector, approved fee (1,500 KD) retrieved from authoritative source.
9. **Approval Gate:** Creation of application and payment invoice triggers Manager Approval card due to financial risk policy.
10. **Execution & Verification:** Manager approves with 1 click; booking is confirmed (Thursday 4:30 PM) and post-action verified.
11. **Immutable Audit:** Complete trace visible with actor, latency, policy, and explainability.
12. **Continuous Learning:** System observes that previous school reports were missing in 42% of applicants, proposing an automated document reminder improvement in the Learn tab.
