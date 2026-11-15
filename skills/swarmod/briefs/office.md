# Office files checklist — paste into every agent that reads or writes .docx, .xlsx, .pptx or .pdf

Confirm each item before STATUS: done.
1. Never overwrite the input file: write a new file next to it, and say its full path.
2. Use the library already installed (python-docx, openpyxl, python-pptx, pypdf/pdfplumber, docx/exceljs/pptxgenjs in Node); check before adding one.
3. Reading: extract text and tables with the library, quote one sample row/paragraph; scanned PDF (no text layer) → say OCR is needed, do not guess.
4. Spreadsheets: keep formulas as formulas (not pasted values) unless asked; no hard-coded totals; header row frozen, column types consistent (numbers stored as numbers, dates as dates).
5. Editing an existing document: keep its styles, numbering, headers/footers and tracked changes; change only the requested parts.
6. Decks: one idea per slide, ≤ ~6 lines, the project's template if one exists; speaker notes only when asked.
7. Re-open the output with the library after writing it and quote what it contains (sheet names, page count, slide count); a file that does not re-open is not done.
8. Personal or confidential content stays in the file; never paste it into the report.
