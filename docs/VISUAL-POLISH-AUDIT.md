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

---

# Round 2

Scope: presentation only. Two new CSS layers loaded last (`src/polish.css`, `src/motion.css`, imported in `src/main.tsx` after `elevation.css`) plus one additive, aria-hidden markup block in `OrgSetupView.tsx`. `index.css` is untouched (the accessibility tests regex-match it). The Survey Chart layer (`elevation.css`), the DNA kit draw-ins and `beauty-pass.css` are built on, not duplicated: existing one-shot draw-ins (rings, bars, lens, orb, trend line, count-up) already reach their real value and were left as they are.

## Per screen

| Screen | Changed | Left alone and why |
|---|---|---|
| Login | Graticule paper backdrop, 3px moss-to-brass hairline on the card, elevated brand tile, calmer hint, soft focus ring, taller submit button | All text, fields, handlers, links unchanged |
| First-run setup (OrgSetup) | New decorative three-station path (name, sector, start) lit from the real form state (aria-hidden); sector descriptions clamped to two lines and lightened; card elevation and hairline; staggered sector tiles | Sector text, validation, submit, owner-console button untouched |
| Partner portal | Hero gets stronger elevation, tabular figures, rounder bar; client rows and empty state restyled; entrance stagger | Money, status and commission text untouched; the commission statement table has no motion |
| Owner console, Partners admin | Calmer block elevation, ruled section titles, lighter hints, input focus ring, staggered first 8 blocks | Dense ledgers and forms: layout, labels and wording unchanged (billing and payment disclosures) |
| Modals / sheets / palette | Softer scrim, consistent radius, fade and rise on open | Dialog.tsx and ApprovalModal.tsx unchanged (a11y tests); no exit animation (needs unmount control in JS) |
| All views | Press scale on buttons, icon nudge, hover lift on stat tiles and cards, active-nav marker grow-in, details and tabpanel fade | Reading text, tables, inputs, Quran/exam/checkout amounts: no motion |

## Motion inventory

Tokens: `--m-ease: cubic-bezier(.2,.7,.2,1)`, `--m-fast/base/slow: 120/180/260ms`, `--m-step: 40ms`.

| What | Motion | Duration | Trigger |
|---|---|---|---|
| First 8 cards, tiles, partner rows, sector tiles, owner blocks | opacity + translateY 8px to 0, 40ms stagger | 260ms | on mount, once |
| Modal / palette backdrop | opacity | 180ms | on open |
| Modal sheet, palette, mobile sheet | opacity + translateY 10px + scale .985 | 260ms | on open |
| Open details, tab panels | opacity + translateY | 180ms | on open |
| Active nav marker | scaleY + opacity | 260ms | when it becomes active |
| Buttons | scale .98 | 120ms | press |
| Stat tiles, partner rows, sector tiles | translateY -1px and soft shadow | 180ms | hover (pointer devices only) |

Entrances use fill-mode `backwards`, so nothing remains applied after the end and the final state is the static design. All of it sits inside `@media (prefers-reduced-motion: no-preference)`; with reduce, none of these animations or transitions exist. No JS is involved, so nothing can stay hidden. No infinite loops were added.

## Not done / not verified
- No exit animations (modal, toast, drawer): they unmount immediately and need JS state changes.
- Active-nav marker fades in rather than sliding between items (a slide needs a measured, JS-driven shared element).
- Demo-mode owner/partner views were checked on seeded local data (1100 accounts), not production. Dark mode, English (LTR) and tablet widths were not screenshotted.
- Step connectors and meters keep their existing DNA-kit draw-ins.
