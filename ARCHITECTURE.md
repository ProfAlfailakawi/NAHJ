# NAHJ (نهج) — System Architecture
**Version:** 1.0

## 1. Architectural Layers

```
┌────────────────────────────────────────────────────────┐
│               PRESENTATION LAYER (React 19)            │
│  - Navigation Shell: Today, Learn, Skills, Work,       │
│    Inbox/Sim, Connections, Analytics, Control, Audit   │
│  - Teach Mode Studio & Visual Infographics             │
│  - Executive & Employee Role Perspectives               │
└───────────────────────────┬────────────────────────────┘
                            │ REST / Typed Contracts
┌───────────────────────────▼────────────────────────────┐
│             EXPRESS APPLICATION & DOMAIN LAYER         │
│  - Tenant Isolation Middleware & RBAC Enforcer         │
│  - Learning Engine (Observation & Clarification)       │
│  - Skill Engine (State Machine & Version Management)   │
│  - Evaluation & Practice Engine (Scoring & Evals)      │
│  - Shadow Engine (Discrepancy Analysis)                │
│  - Policy & Risk Engine (Deterministic Thresholds)     │
│  - Approval Engine (Hierarchical & Multi-tier)         │
│  - Action Layer with Idempotency & Post-Verification   │
│  - Immutable Audit Logger & Explainability Engine      │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼───────────────┐ ┌─────────▼──────────────┐
│       AI GATEWAY & LLM      │ │  DATA & REPOSITORY     │
│  - server/gemini.ts wrapper │ │  - Typed Memory Store  │
│  - Structured JSON Schemas  │ │  - Relational Schema   │
│  - Server-Side Gemini API   │ │  - Seed Data Pack:     │
│  - Vision & OCR Checker     │ │    Future Academy      │
└─────────────────────────────┘ └────────────────────────┘
```

## 2. Abstraction Boundaries
- **LLM access (Gemini only, no provider abstraction):** There is no `ModelGateway` class. All model calls go through one thin wrapper, `generateAiResponse()` in `server/gemini.ts`, which calls `@google/genai` directly (model name hard-coded there, key from `GEMINI_API_KEY`). The wrapper enforces the monthly `aiCallsPerMonth` limit and a timeout (`NAHJ_AI_TIMEOUT_MS`), and returns an empty string on no key / limit / error so callers fall back to deterministic logic. Swapping providers means editing that file, not configuring a gateway.
- **Connector Abstraction:** Skills interact with logical actions (`checkAvailability`, `createBooking`, `createInvoice`), never raw vendor APIs directly.
- **Deterministic Policy Separation:** Business thresholds (e.g., Refund > 50 KWD requires Manager) are evaluated deterministically by the `PolicyEngine`, not left to probabilistic LLM judgment.
