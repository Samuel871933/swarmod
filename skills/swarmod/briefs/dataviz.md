# Dataviz checklist — for every agent that makes a chart, dashboard or stat tile

Confirm each item before STATUS: done.
1. One question per chart, written as its title ("Revenue fell 12% in Q3"), not a label ("Revenue").
2. Form from the data: change over time → line; compare categories → sorted horizontal bars; part of whole (≤ 5 parts) → stacked bar; distribution → histogram; two measures → scatter. No pie beyond 5 slices, no 3D, no dual y-axes.
3. Bars start at zero; lines may not, but say so. Units and time zone on the axis; numbers formatted (1.2k, 34%, no float noise).
4. Colour: one hue for one series, grey for context, a highlight colour only for what the title talks about; ≤ 7 categorical colours; sequential palette for ordered values, diverging only around a meaningful midpoint.
5. Never colour alone: labels, patterns or direct series labels instead of a legend when ≤ 5 series. Contrast ≥ 3:1 for marks, 4.5:1 for text; check dark mode if the project has one.
6. Check the numbers drawn against the source: one hand-computed point quoted in the report (row count, total, max).
7. Empty, single-point and huge-value data render without breaking; tooltips show the exact value with its unit.
8. A screenshot or rendered file of the result.
