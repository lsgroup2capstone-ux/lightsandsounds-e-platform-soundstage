---
tags:
  - feature/spec-approved
  - domain/provider-documents
  - security/personal-data
updated: 2026-10-15
---

# Provider document categories and scan review

Links: [[Feature-Index]] · [[Modules]] · [[Architecture]] · [[Development-Roadmap]]

- SDD state: spec approved revision 2; no plan exists.
- Target: categorize permit versus ID documents, require both for new submissions, and preserve legacy uncategorized documents.
- OCR decision: Tesseract.js in the provider's browser; image scanning is a hint, PDFs are manual, and all confirmed fields remain editable and server-validated.
- Personal-data boundary: details are visible only to the owning provider and Admin.
- Current baseline: provider application documents have no category; the worktree already contains a two-field form, but storage types/server validation and OCR are not implemented as this feature.
- No OCR package is installed; adding it requires an approved plan and dependency review.

Original artifacts: [spec](../../features/20261014-provider-document-categories/spec.md)
