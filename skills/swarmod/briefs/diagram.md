# Diagram checklist — paste into every agent that draws an architecture, flow or sequence diagram

Confirm each item before STATUS: done.
1. Draw the real mechanism from the code: every box and arrow maps to a file, service, table or call you can cite (path:line). No invented components.
2. Pick the form: components and dependencies → box-and-arrow; steps over time between actors → sequence; states and transitions → state diagram; data shape → ER.
3. Use the format the project already uses (Mermaid in Markdown, PlantUML, SVG); default to Mermaid when there is none.
4. ≤ ~12 nodes per diagram; split by level (context → container → detail) instead of one giant picture.
5. Every arrow is labelled with what flows (call, event, data) and points the way it flows; one direction of reading (left→right or top→bottom).
6. Same name for the same thing as in the code; a legend only if shapes or colours carry meaning.
7. Readable in light and dark themes (no hard-coded black text on transparent background).
8. Render it once (mermaid-cli, the docs preview or a browser) and quote zero syntax errors.
