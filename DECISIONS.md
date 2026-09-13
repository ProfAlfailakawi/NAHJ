# Architectural & Engineering Decisions Log (DECISIONS.md)

### Decision 001: Server-Side Express Full-Stack Architecture
- **Date:** 2026-09-13
- **Context:** The application needs a durable, multi-tenant backend with REST APIs, deterministic policy engines, fake connector adapters, audit immutability, and server-side Gemini API invocation without exposing secrets.
- **Decision:** Full-stack Express server mounted with Vite middleware in development, bundled to CommonJS via esbuild for production.
- **Trade-offs:** Ensures robust enterprise-grade domain services, background evals, and security guards.

### Decision 002: Deterministic Policy Engine vs LLM Decision-Making
- **Date:** 2026-09-13
- **Context:** Financial limits and role approvals must not rely on probabilistic LLM completions.
- **Decision:** Hardcoded deterministic logic gates for risk scoring and approval requirements; LLM only extracts entities and generates conversational replies.

### Decision 003: Bilingual First-Class RTL & LTR Architecture
- **Date:** 2026-09-13
- **Context:** The prompt emphasizes Arabic language excellence, Gulf/Kuwaiti idioms, and clean infographic visual beauty without cognitive pollution.
- **Decision:** Dual-language toggle (Arabic RTL primary, English LTR), typography powered by Cairo and Plus Jakarta Sans with crisp micro-interactions.
