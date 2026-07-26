# PaperTok report API

This Cloudflare Worker protects provider keys and caches trend, related-paper and open-access queries.

```bash
npx wrangler secret put OPENALEX_API_KEY
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
npx wrangler secret put OPENCITATIONS_ACCESS_TOKEN # optional, recommended for production traffic
npx wrangler secret put UNPAYWALL_EMAIL
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put CORE_API_KEY # optional, raises CORE rate limits
npx wrangler secret put NASA_ADS_API_TOKEN # optional; INSPIRE is used until configured
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL # optional after verifying a custom domain
npx wrangler deploy
```

After deployment, set the GitHub Actions repository variable `VITE_PAPER_API_BASE_URL` to:

```text
https://papertok-report-api.<account>.workers.dev
```

Available routes are `/report/trends`, `/related`, `/citation-graph`, `/oa`, `/arxiv`, `/sources/biorxiv`, `/sources/europepmc`, `/sources/core`, `/sources/osti`, `/sources/nasa`, `/sources/physics`, `/ai/explain`, `/notifications/preferences`, `/notifications/test`, `/notifications/unsubscribe`, `/health/email`, and `/health`. The citation graph combines OpenCitations relationships with OpenAlex metadata and caches the result for seven days. The specialist-source routes validate, cache and proxy biology, engineering and physics searches so the browser never depends on public CORS proxies. `/sources/physics` uses NASA ADS when `NASA_ADS_API_TOKEN` is configured and falls back to the public INSPIRE API otherwise. `CORE_API_KEY` is optional; anonymous CORE access remains a best-effort fallback.

The AI route requires a valid PaperTok Firebase ID token and keeps `GEMINI_API_KEY` exclusively in the Worker. It defaults to Gemini 3.5 Flash and can later switch provider through `AI_PROVIDER` without changing the frontend.

The Worker limits AI usage to 5 successful generations per user and 100 globally per UTC day by default. Bind a KV namespace as `AI_USAGE` for persistent distributed counters; without it, the Cloudflare cache provides a best-effort fallback. Keep the Gemini project on its free tier with billing disabled as the hard protection against charges.

Email digests require the `NOTIFICATION_STORE` KV binding and `RESEND_API_KEY`. The Worker verifies the Firebase ID token before storing a subscription, derives the recipient address from Firebase rather than trusting client input, and runs the daily cron at 07:00 UTC. Weekly subscriptions are sent on Mondays. Without a verified Resend domain, `onboarding@resend.dev` is used in test mode and Resend only delivers to the account owner's address; set `RESEND_FROM_EMAIL` after domain verification for general delivery. `EMAIL_DAILY_SEND_LIMIT` defaults to 90 to stop delivery before the free daily allowance is exhausted.
