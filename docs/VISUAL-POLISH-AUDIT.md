# Visual polish audit

Scope: visual layer only (markup for presentation, CSS, icons, microcopy). No logic, API, data, routes, tests or deps touched.
Method: source review of every UI file plus Playwright screenshots (390px and 1280px) of the 18 demo-mode shell screens, before and after. No horizontal overflow found at either width.
Constraint found: several tests regex-match UI source (accessibility, integrity), and several strings are honesty/legal disclosures (billing, demo), so those were restyled, never reworded.

## Screens and components

| Screen / component | File | Findings | Action |
|---|---|---|---|
| Page header (all views) | Primitives.tsx, index.css:40 | Sub-headline was 15px, 650px wide: reads as a paragraph on every page | Made 14px / 560px max (beauty-pass.css) |
| Today (atlas, stat tiles, signals) | views/TodayView.tsx | Already infographic-led (orbit atlas, journey dots, tiles) | Left alone |
| Learn | views/LearnView.tsx | Lens ring + four mini stats + signal cards, already compact | Left alone |
| Teach | views/TeachView.tsx | Capture stage, already visual | Left alone |
| Skills | views/SkillsView.tsx | Lanes + ladder, already infographic | Left alone |
| Practice | views/PracticeView.tsx | Stepper + rings + dot matrices | Left alone |
| Work | views/WorkView.tsx | Journey river | Left alone |
| Simulator | views/SimulatorView.tsx:35 | Side note was a two-sentence paragraph duplicating the header hint and the approval button label | Shortened to one line, centred caption style; button unchanged |
| Connections | views/ConnectionsView.tsx | Constellation; text tests bind to its source | Left alone |
| Analytics | views/AnalyticsView.tsx | Stat tiles + charts | Left alone |
| Control | views/ControlView.tsx | Shield, tiles, ladder bars; risk notice is a safety statement | Left alone |
| Audit | views/AuditView.tsx | Timeline | Left alone |
| People / Accounts / Sectors | views/PeopleView, AccountsView, SectorsView | Forms with test-bound labels | Left alone |
| Billing | views/BillingView.tsx | Plan cards listed limits as text-only rows; footnotes at body size competed with content | Added icons (Users, Sparkles, Workflow, Gauge, aria-hidden) to plan limits; footnotes smaller and lighter. Text unchanged (payment/audit disclosures) |
| Owner, Partners, Partner portal, Demo preview, Owner sales | views/Owner*, Partner*, DemoOwnerPreview | Owner-only, dense by nature (ledgers) | Not rendered here (needs owner role); left alone |
| Shell, Brand, Dialog, ApprovalModal, CommandPalette, Explain, EmergencyPause, banners, LoginScreen, OrgSetupView | components/ | a11y tests bind to these | Left alone |
| DNA kit and theme | components/dna | Shared primitives, already consistent | Left alone |
| Static pitch pages | docs/pitch*.html | Docs, not product UI | Left alone |

## Not verified
Owner/partner screens, login, org setup, and modals were not screenshotted. Mobile screens were reached by programmatic nav click because the dock sheet was not driven.
