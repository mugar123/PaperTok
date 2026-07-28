# Manual Diagnostics

This directory contains one-off and historical probes for arXiv, OpenAlex, Elsevier, proxies,
OpenAIRE, Crossref, and related providers.

They are kept for debugging reference but are not part of `npm test` or ESLint. Many call live
services, may depend on CORS proxies, and can consume API quota.

Run scripts from the repository root:

```bash
node scripts/diagnostics/test-openalex.js
```

When a diagnostic becomes a stable regression check, replace its live request with a fixture
and move the behavior into a colocated `*.test.js` file under `src/` or `worker/`.

