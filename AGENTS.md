# PaperTok Agent Guide

This file applies to the whole repository. More specific guidance lives in
`src/AGENTS.md` and `worker/AGENTS.md`; the nearest file takes precedence.

## Project Map

- `src/`: React application, recommendation logic, scientific providers, and tests.
- `worker/`: Cloudflare Worker routes, protected provider calls, AI, and email delivery.
- `public/`: static assets copied by Vite.
- `docs/`: architecture and development documentation.
- `scripts/diagnostics/`: manual provider experiments. These are not part of the test suite.
- `.github/workflows/`: GitHub Pages deployment.

Do not place temporary API probes, generated reports, or lint output in the repository root.

## Commands

Run from the repository root:

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
npm run check
```

`npm run check` is the expected pre-commit verification. For a narrow change, run the
closest tests first, then the full command before publishing.

## Cross-Cutting Invariants

1. Never expose provider secrets in frontend code or `VITE_*` variables. Browser-visible
   variables are public by definition; protected calls belong in the Worker.
2. Keep user data isolated by Firebase user ID. Do not reintroduce shared browser keys for
   preferences, interactions, follows, seen papers, or reading history.
3. Preserve metadata provenance. Missing citations, abstracts, peer-review status, concepts,
   and open-access links must remain missing rather than being guessed.
4. The interface supports Spanish and English. New user-facing copy must work in both
   languages, including Worker-generated content and cache keys.
5. Provider failure must degrade gracefully. One unavailable scientific API must not leave
   the feed loading forever when another source has usable papers.
6. Paper identity and deduplication should prefer stable DOI, arXiv, OpenAlex, or provider
   identifiers before normalized title fallbacks.
7. Enrichment must not make a paper visibly change because the user liked or saved it.
   Metadata needed for the card should be merged before display or introduced explicitly as
   asynchronous enrichment.

## Change Discipline

- Follow existing React, service, adapter, and utility patterns before adding abstractions.
- Keep tests beside the module they exercise using `*.test.js`.
- Update documentation when adding routes, environment variables, providers, or persistence.
- Do not edit generated `dist/`, `.wrangler/`, local `.env*`, `.claude/`, or dependency files
  except through their normal generators.
- Keep manual API investigations in `scripts/diagnostics/` and label destructive or
  quota-consuming behavior clearly.

## Publishing

- GitHub Pages deploys the frontend from `main`.
- `npx wrangler deploy` publishes the Worker separately.
- A frontend change that depends on a Worker contract is incomplete until both sides are
  compatible and the relevant deployment path has been verified.

