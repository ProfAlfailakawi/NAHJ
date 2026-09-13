# NAHJ (نهج) — AI Architecture & Decision Systems

## 1. Core Philosophy: Systemic Learning Over Prompt Hacks
NAHJ rejects the single-god-prompt anti-pattern. Instead, AI processing is divided into deterministic gates and focused models:

1. **Intent & Skill Selection Gate:** Matches incoming conversation or event to candidate verified skills.
2. **Deterministic Policy Evaluator:** Runs before any action proposal. If `fee > 500` or `action == refund`, the deterministic engine flags `requires_approval = true`.
3. **Structured Synthesizer (Teach Mode):** Parses human employee demonstrations into discrete steps, inputs, dependencies, edge cases, and missing clarifications.
4. **Action Grounding & Verification:** AI generates action proposals conforming to strict JSON schema definitions with idempotency keys.
5. **Post-Action Verification:** After an action is triggered (e.g. `createApplication`), an independent verification call (`getApplication`) checks if state matches expected outcome.

## 2. Truth Hierarchy & Provenance
When facts conflict, the engine respects the following strict hierarchy:
```
1. Live Authoritative System (e.g. SIS Billing API / Calendar DB)
2. Approved Institutional Policy (e.g. Admission Policy v2)
3. Approved Structured Data (e.g. Program Catalog)
4. Approved Current Document (e.g. Ministry Directive 2026)
5. Official Website Content
6. Historical Approved Communications
7. Observed / Unverified Employee Behavior (Lowest Authority)
```

## 3. "AI Never Guesses" Protocol
If no verified source exists for a required parameter or edge case:
- AI explicitly emits `NEEDS_CLARIFICATION` or `ESCALATE_TO_HUMAN`.
- It records the question into the **Learn** feed.
- Once a human manager clarifies, the system stores the rule permanently in the Company Brain.
