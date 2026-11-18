# NAHJ PR #142 — WebKit visual evidence

- Branch: `fix/duo-nahj-mobile-apphub-2026-11-18`
- Commit under review: `ef0407af8225842de3b22e25c784fe5e06dc484b`
- Engine: cached Playwright WebKit 2370 executable (not the pinned Playwright 1.56.1 browser build)
- Viewport: 382 × 580 CSS px
- Route: isolated local preview `/app` (synthetic app data; Firebase sync disabled; in-memory database)
- Scroll position: 305 CSS px
- Horizontal overflow: none (`scrollWidth === clientWidth === 382`)
- App-hub map bounds: x=27, y=201.55, width=328, height=260 CSS px
- Fixed navigation bounds: x=72, y=502, width=291, height=66 CSS px
- Result: map and navigation are visible; stage clears the dock; lower detail card is reachable by vertical scroll.

This is browser-engine evidence for the web layer. It is not a physical iPhone Duo, iOS Simulator, Safari app, or native WKWebView test. Those remain unverified.
