# TrustFlow AI

Make a deal. Build trust. Pay with confidence.

TrustFlow turns a work description into a reviewable agreement, milestones, and acceptance criteria. Both counterparties sign in to a shared workspace, review the agreement, submit milestone evidence, and track activity. PayPal processes payments directly; TrustFlow is non-custodial and never holds funds or makes payouts.

## Current implementation

- Email/password registration and login with scrypt password hashing, hashed opaque session tokens, HttpOnly cookies, and session expiry.
- Participant-scoped deal and notification APIs. Deal creation uses the signed-in account as buyer and requires an existing provider account email; participant names are never accepted as identity.
- AI-assisted scope analysis, agreement generation/versioning, milestone management, dual-party agreement approval, and activity history.
- Provider evidence submissions with validated public URL references and private file attachments (JPEG, PNG, WebP, PDF, TXT; 4 MB each), immutable submission history, and participant-authorized downloads.
- Groq advisory evidence assessments validated with Zod against the exact approved agreement version and that version's acceptance criteria. Assessments are persisted separately from submissions; missing credentials and failed AI calls leave evidence saved and retryable.
- Buyer revision requests and participant human-review requests; AI cannot approve agreements or authorize payments.
- PayPal REST Orders v2 CAPTURE checkout, OAuth token reuse, hashed PayPal-Request-Id idempotency keys, server-side order/capture reconciliation, exact amount/currency/deal matching, unique capture IDs, and signed/idempotent webhook event processing. Providers configure their PayPal merchant receiving email; orders name that provider as the payee so checkout proceeds are routed directly to the provider account. This requires PayPal account/partner permissions for payee routing. Use Sandbox credentials during development.
- Persistent participant-scoped notifications with unread counts, pagination, mark-read actions, and a deal activity timeline.
- Resend transactional email delivery with React Email templates, idempotent EmailLog records, retry processing, and Svix-verified webhook tracking (sent, delivered, likely opened, clicked, bounced). Open tracking is only a privacy-limited signal, not proof of reading.
- Deal-scoped semantic retrieval with Atlas Vector Search / OpenAI embeddings.
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

Open http://localhost:3000 and create an account at `/register`. The first account can create a deal after the provider has also registered. The provider must set their receiving PayPal merchant email in the deal workspace before the buyer can check out. Sign in at `/login`. The workspace derives the buyer identity from the authenticated session.

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
| `TRUSTFLOW_PRIVATE_UPLOAD_DIR` | Persistent private filesystem directory for evidence attachments; required in production deployments |

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

For Resend, verify the sending domain in the Resend dashboard and publish the DNS records Resend supplies before sending to arbitrary recipients. Configure a Resend webhook pointing to `https://YOUR_APP_HOST/api/resend/webhook` and subscribe to `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, and `email.bounced`; copy its signing secret into `RESEND_WEBHOOK_SECRET`. The email outbox retry endpoint is authenticated and can be invoked by a participant to retry failed deal email logs. Missing email configuration is recorded as a failure and does not roll back the deal, payment, or evidence operation.\n\nSome integrations require credentials and service-side configuration. A successful local compile does not verify live PayPal, Resend, or Atlas Vector Search configuration. For local development, private uploads are stored under `.trustflow-uploads` (ignored by Git). In production, set `TRUSTFLOW_PRIVATE_UPLOAD_DIR` to a persistent private volume; do not point it at `public/`. This adapter is filesystem-backed, not S3/object storage.

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
