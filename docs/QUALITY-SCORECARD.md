# Quality scorecard, round 3

Scope: presentation and accessibility markup only. No logic, server, data, AI-workflow, approval or test change; no new dependency.
Harness: Playwright + axe-core scorecard (hard criteria H1 axe, H2 overflow, H3 clipped text, H5 CLS, H6 focus indicator, H7 stuck-hidden, H8 reduced-motion animations, H9 contrast), run against the production build served from a copy of a seeded local database (demo mode, first-run owner setup, owner console), at 320 / 390 / 768 / 1280, light and dark, normal and reduced motion.

## Before / after (same screen-states, label-matched)

The "before" run (main at `bcfaf92`) and "after" run cover 402 identical screen-states (the earlier run stopped part-way through some viewports; only states present in both are compared). Public server-rendered pages (landing, pricing, terms, privacy) are included in "all" and excluded in "app only".

| | Before | After |
|---|---|---|
| App screen-states passing every hard criterion (338) | 0 | 36 |
| App states passing everything except H6 (see below) | 113 | 270 |
| axe violations in app states (rule x states) | landmark-one-main 58, page-has-heading-one 44, region 58, heading-order 98, complementary-top-level 42, landmark-unique 9, scrollable-region-focusable 36 | scrollable-region-focusable 4 |
| H1 (axe) failing app states | 187 | 4 |
| H3 clipped text | 8 | 0 |
| H9 contrast failing app states | 108 | 64 (all but a few are disabled buttons, see below) |
| Touch targets under 44px (all states, strict count) | 1867 (app) | 1203 (app) |
| Infinite animations | 0 (app) | 0 (app) |
| All 402 states incl. public pages: passing everything | 12 | 48 |

## Changed
- `src/finish.css` (new, loaded last): one keyboard focus ring that beats per-component `outline:0`; dimmed supporting text (org-setup sector captions, autonomy badge level, eval timings, owner hints, account meta, login brand subtitle, unmeasured shadow pairs) no longer fades under 4.5:1; 44px minimum height/width for buttons, selects, inputs on phones/tablets/touch; people-matrix header floor widened; owner date tile wraps instead of scrolling.
- Landmarks: login and first-run setup are now `<main>`; the login brand name is exposed as the level-1 heading; four in-page `<aside>` blocks (Learn radar, Skills inspector, Simulator trace, App hub focus) became `<div>` so they are not nested complementary landmarks (same class names, same look).
- Heading order: `aria-level` added where a heading skipped a level (App hub, Accounts, Billing plans, Owner sub-forms, Connections header).
- Scrollable regions made keyboard-reachable: people matrix, owner event log, skill version timeline (`tabIndex=0`, labelled region).
- Motion: unchanged. Round-2 tokens already satisfy transform/opacity only, 120-260ms, once, none under reduced motion; no infinite loops in app screens (H8 passes).

## Left alone, on purpose
The Today atlas, Learn lens, Teach stage, Skills lanes, Practice rings, Work river, Simulator phone, Connections constellation, Analytics, Control and Audit were judged by eye at 390 and 1280 and are already icon/infographic-led with clear hierarchy, so they were not redesigned. "Text wall" counts from the harness are whole-section text blocks, not paragraphs, and were not treated as defects.

## Findings not fixed, and why
- H6 (focus indicator) still shows as failing on nearly every state. The harness calls `element.focus()` after mouse activity, and Chromium then does not match `:focus-visible`, so no ring is computed. Real keyboard Tab walks (30 stops, 390 and 1280, Today screen) showed a ring on every stop after the fix; before the fix `decision-card` and `work-mini` had none. Treat H6 as a harness artifact, not a verified pass.
- H9 on disabled controls ("تغيير", "ارفض الطلب", "احفظ", "انقل", "ابدأ التشغيل", owner danger/primary buttons while disabled): WCAG exempts disabled controls; left at their disabled opacity.
- Landing, pricing, terms, privacy are server-rendered (`server/*Pages.ts`); their contrast (eyebrow 4.29:1, list 4.43:1, state tags 3.2:1), list/role markup and scroll-reveal sections (H7 stuck-invisible in a non-scrolled full-page capture) were not touched because the brief excludes server changes.
- Simulator: one scrollable region still reported in 4 states; not located.
- Touch targets: still above zero on desktop widths (44px is not applied to fine pointers) and some inline controls.
- A small contrast item (`small` "3" in Accounts, 3.69:1) was not located.

## Not viewed
Screenshots were judged for 390 and 1280 light mode on Today, Learn, Teach, Skills, Practice, Work, Simulator, Connections, Login, Org setup, Owner console, Accounts, People, Billing (before-state images). After-state images were not re-inspected by eye; after-state evidence is the metrics. Dark mode, 320 and 768 were scored but not viewed. English (LTR) was scored for Today only. Real partner portal data, production data and real payments were not exercised. The last `finish.css` tweak (unmeasured opacity .9) was verified by a computed-style probe only, not by a full re-run.

## Commands
- `npm run lint` (tsc --noEmit): clean
- `npm test`: 310 tests, 310 pass, 0 fail
- `npm run build`: succeeds
