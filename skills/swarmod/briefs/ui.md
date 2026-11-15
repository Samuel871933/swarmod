# UI / design checklist — for the brief of every agent that builds or reviews an interface

Confirm each item (or report it as a finding with path:line) before STATUS: done.
1. Use the project's design tokens, components and spacing scale; no raw hex or off-scale values. A house component beats a native one.
2. Every state handled: loading (skeleton for content), empty, error with a way out, success.
3. Keyboard: every control reachable, focus visible, logical order; `<button>`/`<a>`, never clickable divs.
4. Labels: every input has a label, every icon-only control an aria-label, every image an alt (empty if decorative).
5. Contrast ≥ 4.5:1 (3:1 for large text); colour is never the only signal of a state.
6. Layout holds at 320, 768, 1024 and 1440 px; no horizontal scroll; touch targets ≥ 44 px.
7. Respect `prefers-reduced-motion`, and dark mode if the project has one.
8. Components over ~200 lines split; no prop drilling beyond 3 levels.
9. No generic AI look (purple gradients, rounded-2xl card grids everywhere, heavy shadows) unless the project already uses it.
10. If a browser is available: zero console errors, and a screenshot of the result.
