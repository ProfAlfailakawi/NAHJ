# NAHJ (نهج) — Evaluation, Practice & Shadow Framework

## 1. Practice Mode (Synthetic & Historical Evals)
Before any skill is allowed to graduate up the Autonomy Ladder, it must pass automated test suites:
- **Happy Path Cases:** Standard admission or refund procedure.
- **Edge Cases:** Missing civil ID, age cutoff boundary, full class capacity.
- **Adversarial / Injection Cases:** Attempted unauthorized discounts or role bypasses.
- **Failure Conditions:** Downstream connector timeouts or simulated system errors.

## 2. Shadow Mode
In live shadow mode:
- Live customer requests are received.
- A human staff member reviews and acts on the case.
- Simultaneously, the AI formulates an internal plan (`proposedAction`, `selectedPolicy`, `extractedData`).
- The system computes the **Shadow Match Score**:
  - Exact match on action & parameters.
  - Deviations are flagged as either AI mistakes or human process drift.
  - If a consistent pattern of divergence appears across staff, a **Process Drift Alert** is generated in the Learn tab.

## 3. Reliability Scoring Formula
Reliability is calculated from real empirical evidence, never hallucinated confidence percentages:
```
Reliability = (0.3 * PracticePassRate) + (0.3 * ShadowMatchRate) + (0.2 * ProvenanceAuthorityWeight) + (0.2 * (1 - HumanTakeoverRate))
```
Tiers:
- **Low (0 - 49%)**: Observe & Practice only
- **Medium (50 - 74%)**: Suggest mode
- **High (75 - 89%)**: Approval-to-Execute
- **Verified (90 - 100%)**: Eligible for Autopilot for low-risk actions
