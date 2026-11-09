# TrustFlow AI

Make a deal. Build trust. Pay with confidence.

TrustFlow turns a work description into a reviewable agreement, milestones, and acceptance criteria. Both counterparties sign in to a shared workspace, review the agreement, submit milestone evidence, and track activity. PayPal processes payments directly; TrustFlow is non-custodial and never holds funds or makes payouts.

## Current implementation

- Email/password registration and login with scrypt password hashing, hashed opaque session tokens, HttpOnly cookies, and session expiry.
- Participant-scoped deal and notification APIs. Deal creation uses the signed-in account as buyer and requires an existing provider account email; participant names are never accepted as identity.
- AI-assisted scope analysis, agreement generation/versioning, milestone management, dual-party agreement approval, and activity history.
- Provider evidence submissions, AI assessment against approved milestone criteria, and revision history.
- PayPal Orders v2 checkout and server-side capture amount/currency verification. Use Sandbox credentials during development.
- Notification records, email delivery logging/idempotency, optional Resend integration, and deal-scoped semantic retrieval with Atlas Vector Search / OpenAI embeddings.
- Rate limiting and security headers/origin checks are included; verify deployment-specific settings before production.

## Requirements

- Node.js 20+
- MongoDB Atlas (or a MongoDB deployment supporting the Prisma MongoDB connector)
- Optional: Groq for deal analysis/evidence assessment, OpenAI for embeddings, PayPal Sandbox for checkout, and Resend for email.

## Local setup

```bash
npm install
Copy-Item .env.example .env
# Set DATABASE_URL to your MongoDB connection string.
npx prisma validate
npx prisma generate
npx prisma db push
npm run dev
```

Open http://localhost:3000 and create an account at `/register`. The first account can create a deal after the provider has also registered. Sign in at `/login`. The workspace derives the buyer identity from the authenticated session.

The optional development seed is available with `npm run db:seed` where configured. Do not use demo credentials in production.

## Environment

Copy `.env.example` to `.env` and configure only the integrations you intend to use:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string |
| `NEXT_PUBLIC_APP_URL` | Exact origin used for same-origin mutation checks |
| `GROQ_API_KEY`, `GROQ_MODEL` | Server-side AI analysis and evidence assessment |
| `OPENAI_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | Embeddings and semantic retrieval |
| `PAYPAL_ENV` | `sandbox` for development; `live` only after production review |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Server-side PayPal credentials |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook configuration, if webhook processing is enabled |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | PayPal browser SDK client ID |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional email delivery |
| `RESEND_WEBHOOK_SECRET` | Resend webhook verification configuration |
| `AUTH_SECRET` | Reserved for deployment-specific auth integrations; never expose secrets with a `NEXT_PUBLIC_` prefix |

Never commit `.env`, API keys, database credentials, or PayPal secrets.

## Verification

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Some integrations require credentials and service-side configuration. A successful local compile does not verify live PayPal, Resend, or Atlas Vector Search configuration.

## Security and deployment notes

- A 401 from `/api/deals` or `/api/notifications` means there is no valid session cookie for the request. Register or sign in first. If a stale session cookie is present, the server clears it when it detects the missing/expired session; then sign in again.
- Session cookies are HttpOnly. Do not attempt to set them from client-side JavaScript.
- A provider must register before the buyer can invite them by email.
- Keep PayPal in Sandbox until webhook handling, capture reconciliation, credentials, and production configuration have been independently verified.
- Configure the Atlas Vector Search index to match the embedding dimensions and the `trustflow_vector_index` name before enabling semantic retrieval.
- TrustFlow is not escrow. Do not describe payments as held, protected, or released by TrustFlow.

## Architecture

- `src/app`: Next.js App Router pages and API routes.
- `src/components`: authentication, notifications, workspace, and PayPal UI.
- `src/lib/auth.ts`, `password.ts`: session and password primitives.
- `src/lib/ai.ts`, `rag.ts`: structured AI analysis and retrieval.
- `src/lib/mailer.ts`, `events.ts`: email and activity/notification workflows.
- `prisma/schema.prisma`: MongoDB data model.

## License

MIT. See [LICENSE](LICENSE).
