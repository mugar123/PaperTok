# PaperTok report API

This Cloudflare Worker protects provider keys and caches trend, related-paper and open-access queries.

```bash
npx wrangler secret put OPENALEX_API_KEY
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
npx wrangler secret put OPENCITATIONS_ACCESS_TOKEN # optional, recommended for production traffic
npx wrangler secret put UNPAYWALL_EMAIL
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put MODAL_PROXY_TOKEN_ID
npx wrangler secret put MODAL_PROXY_TOKEN_SECRET
npx wrangler secret put MODAL_KIMI_BASE_URL
npx wrangler secret put CORE_API_KEY # optional, raises CORE rate limits
npx wrangler secret put NASA_ADS_API_TOKEN # optional; INSPIRE is used until configured
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_FROM_EMAIL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL # optional after verifying a custom domain
npx wrangler deploy
```

Brevo is the primary notification provider when `EMAIL_PROVIDER = "brevo"`.
`BREVO_FROM_EMAIL` must match an active sender in the Brevo account. Resend remains
available as a fallback by changing `EMAIL_PROVIDER` to `resend`.

After deployment, set the GitHub Actions repository variable `VITE_PAPER_API_BASE_URL` to:

```text
https://papertok-report-api.<account>.workers.dev
```

Available routes are `/locale`, `/report/trends`, `/related`, `/citation-graph`, `/oa`, `/arxiv`, `/sources/biorxiv`, `/sources/europepmc`, `/sources/core`, `/sources/osti`, `/sources/nasa`, `/sources/physics`, `/ai/explain`, `/notifications/preferences`, `/notifications/test`, `/notifications/unsubscribe`, `/health/email`, and `/health`. `/locale` returns only Cloudflare's country code for the automatic Spanish/English interface choice and is never cached. The citation graph combines OpenCitations relationships with OpenAlex metadata and caches the result for seven days. The specialist-source routes validate, cache and proxy biology, engineering and physics searches so the browser never depends on public CORS proxies. `/sources/physics` uses NASA ADS when `NASA_ADS_API_TOKEN` is configured and falls back to the public INSPIRE API otherwise. `CORE_API_KEY` is optional; anonymous CORE access remains a best-effort fallback.

The AI route requires a valid PaperTok Firebase ID token and keeps provider credentials exclusively in the Worker. Gemini 3.5 Flash remains the primary provider. When Gemini explicitly reports that its daily provider quota is exhausted, `AI_FALLBACK_PROVIDER = "modal-kimi"` routes abstract-based explanations to Modal's OpenAI-compatible Kimi K3 Shared API. Modal authentication requires the complete proxy-token pair (`wk-...` ID plus `ws-...` secret) and the Shared API base URL shown in the Modal dashboard.

The Worker limits AI usage per user and globally per UTC day. It stores those counters in `AI_USAGE` when present, otherwise in `NOTIFICATION_STORE`, and only falls back to the Cloudflare cache if neither KV binding exists. Kimi is protected separately by the `KimiBudgetLedger` Durable Object: every request reserves a conservative maximum before contacting Modal, actual usage is reconciled afterwards, and calls stop at `KIMI_MONTHLY_HARD_CAP_USD`. Production uses a $27 monthly cap, leaving a $3 margin below Modal's $30 monthly free credit.

Email digests require the `NOTIFICATION_STORE` KV binding and `RESEND_API_KEY`. The Worker verifies the Firebase ID token before storing a subscription, derives the recipient address from Firebase rather than trusting client input, and runs the daily cron at 07:00 UTC. Weekly subscriptions are sent on Mondays. Without a verified Resend domain, `onboarding@resend.dev` is used in test mode and Resend only delivers to the account owner's address; set `RESEND_FROM_EMAIL` after domain verification for general delivery. `EMAIL_DAILY_SEND_LIMIT` defaults to 90 to stop delivery before the free daily allowance is exhausted.
