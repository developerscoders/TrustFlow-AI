# TrustFlow AI

Make a deal. Build trust. Pay with confidence.

TrustFlow helps counterparties turn an informal work description into a reviewable agreement, milestones, and acceptance criteria. Later stages of the product can compare submitted evidence to those same criteria. It is a non-custodial transaction management tool: PayPal processes payments directly; TrustFlow does not hold funds or make payouts.

## Current build

This repository starts the Day 1 foundation: responsive workspace UI, SQLite persistence through Prisma, deal creation with structured AI analysis, generated agreement text, milestone creation, activity logging, and party approval endpoints. If Groq is not configured, the analyzer returns a clearly labeled setup fallback so the local workflow remains demonstrable; add real credentials for actual model analysis.

Authentication, user/participant authorization, payment checkout, evidence review, notifications, and production deployment are not implemented in this initial slice. Do not expose this build publicly until identity and route authorization are added.

## Setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
Copy-Item .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000. SQLite stores data in `prisma/dev.db` (configured by `DATABASE_URL`). The optional seed creates the Nova Marketing Studio / PixelCraft Studio $500 demo deal.

## AI configuration

Set `GROQ_API_KEY` in `.env`; the server calls Groq's OpenAI-compatible API. Optionally set `GROQ_MODEL`. The key is used only by server route handlers and must never be added to a `NEXT_PUBLIC_` variable.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma SQLite connection (default `file:./dev.db`) |
| `GROQ_API_KEY` | Optional server-side Groq API key |
| `GROQ_MODEL` | Optional Groq model name |
| `NEXT_PUBLIC_APP_URL` | Local or deployed application URL |

## Architecture

- `src/app`: Next.js App Router UI and route handlers.
- `src/lib/ai.ts`: Groq-compatible structured JSON analysis and local fallback.
- `src/lib/schemas.ts`: Zod request and response validation.
- `prisma/schema.prisma`: SQLite records for deals, agreements, milestones, and activity.
- `prisma/seed.ts`: repeatable demo fixture.

The deal description is analyzed into missing information, risks, acceptance criteria, and proposed milestone amounts. The generated agreement stores the criteria that future delivery review should reuse. Provider output is schema validated, and milestone totals are checked server-side against the requested deal amount.

## Known limitations

- The current workspace is an early Day 1 slice, not the complete master prompt.
- There is no login or real participant identity model yet; approval routes are not safe for public deployment.
- PayPal Orders v2, capture verification and webhook verification are not implemented yet.
- Evidence submissions, AI verification, email, disputes, rate limiting, security headers, and tests remain future work.
- SQLite is suitable for local development and demos, but a persistent production deployment needs a durable volume or migration to a managed database.

## License

MIT. See [LICENSE](LICENSE).
