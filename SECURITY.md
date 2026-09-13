# NAHJ (نهج) — Security & Safety Architecture

## 1. Multi-Tenant Isolation
- Every query, storage lookup, and action execution is strictly scoped by `organization_id`.
- Cross-tenant data leakage is strictly prohibited at both repository and API levels.

## 2. Prompt Injection Defense
- External user input (messages, uploaded OCR text) is treated strictly as untrusted data payload, never executable instructions.
- Tool selection and execution is gated by the backend engine using pre-approved allowlists on a per-skill basis.

## 3. Human-in-the-Loop & Circuit Breakers (Kill Switches)
- **Global Kill Switch:** Ability to instantly suspend all AI executions across the organization.
- **Skill-Level Kill Switch:** Pause any specific skill experiencing drift or anomalies.
- **Auto-Downgrade:** If a skill's error rate exceeds configured threshold (e.g. > 5%) or shadow match drops below 85%, autonomy automatically downgrades from Autopilot to Approval-Required.
- **Human Takeover:** Instant handoff mechanism in any conversation or work item, locking out AI execution until explicitly released.
