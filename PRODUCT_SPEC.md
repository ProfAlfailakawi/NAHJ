# NAHJ (نهج) — Product Specification
**Version:** 1.0 — Build-Ready Master Product Specification  
**Codename:** NAHJ / نهج  
**Core Motto:** *"Don't make companies configure AI. Let AI learn the company."*  
**Secondary Rule:** *"AI must earn the right to act."*

---

## 1. Product Identity & Definition
NAHJ is **not** a chatbot, CRM, workflow builder, or generic AI agent platform.  
NAHJ is an **Operational Intelligence & Learning Platform**:  
> **"AI that learns how an organization actually works, turns that knowledge into verified operational skills, practices those skills, and gradually earns the right to perform the work."**

### Differentiation & Anti-Patterns
- **Company Brain first, Agents second:** The core system codifies and governs the organizational operating model. Any internal or external agent can consume these verified skills.
- **No Node-Dragging or Raw Prompts:** Users do not assemble DAG nodes or write system prompts. They demonstrate real work (Teach Mode) or connect existing systems.
- **Institutional Memory & Process Intelligence:** Even if an organization runs zero automations, NAHJ provides immediate value by detecting undocumented processes, single-employee dependencies, conflicting practices, process drift, and optimization bottlenecks.

---

## 2. Core Functional Loop
```
Observe → Understand → Clarify → Verify → Codify → Practice → Shadow → Suggest → Approve → Execute → Measure → Improve
```

1. **Observe:** Ingest events from connected tools, historical records, and explicit demonstrations.
2. **Understand:** Extract intent, steps, parameters, decision branches, prerequisites, and outcomes.
3. **Clarify:** Formulate targeted questions for organizational ambiguity (e.g. *"Is supervisor approval required for all refunds or only those over 50 KWD?"*).
4. **Verify & Codify:** Human managers review and approve the structured Skill schema (versioned, typed).
5. **Practice:** Run synthetic and historical evaluation suites. Score accuracy and safety before any real-world exposure.
6. **Shadow:** In live scenarios, the AI formulates internal decisions in parallel with human employees without external impact, measuring match rates.
7. **Suggest & Approve:** AI prepares drafted actions; human signs off with 1-click authorization.
8. **Execute & Verify:** Safe execution via idempotency-guaranteed connectors with post-action verification.
9. **Measure & Improve:** Track time saved, error rates, process duration, and recommend continuous improvements.

---

## 3. Autonomy Ladder
| Level | Name | Description |
|---|---|---|
| **L0** | **Observe** | Passive monitoring only. No outputs generated. |
| **L1** | **Practice** | Executes against sandbox/historical datasets only. |
| **L2** | **Shadow** | Generates real-time parallel internal decisions; zero customer impact. |
| **L3** | **Suggest** | Delivers proactive suggestions and contextual briefings to staff. |
| **L4** | **Prepare** | Stages complete payloads and actions awaiting 1-click employee execution. |
| **L5** | **Approval-to-Execute** | Auto-stages execution; pauses until explicit authorized approval is granted. |
| **L6** | **Autopilot** | Autonomous execution strictly bounded by risk thresholds and circuit-breakers. |

---

## 4. Key Personas & Views
1. **Executive / CEO View:** High-level operational impact, time saved, compliance health, institutional memory coverage, ROI metrics.
2. **Operational Manager View:** Skill reviews, clarification resolutions, conflict reconciliations, autonomy promotions, approval queues.
3. **Employee View:** Teach AI sessions, daily work items, contextual assistance, 1-click approvals, feedback and corrections.
4. **Simulated External Customer:** Interactive portal/chat (e.g., Guardian enrolling child in Future Academy).
