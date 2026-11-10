# TrustFlow AI

Make a deal. Build trust. Pay with confidence.

TrustFlow turns a work description into a reviewable agreement, milestones, and acceptance criteria. Both counterparties sign in to a shared workspace, review the agreement, submit milestone evidence, and track activity. PayPal processes payments directly; TrustFlow is non-custodial and never holds funds or makes payouts.

## Current implementation

- Public animated landing page plus email/password registration and login with scrypt password hashing, hashed opaque session tokens, HttpOnly cookies, session expiry, login rate limits, and protected participant workspaces.
- Participant-scoped deal and notification APIs. Deal creation uses the signed-in account as buyer and can invite a provider by email before they register; participant names are never accepted as identity. The authenticated workspace is available at `/dashboard`.
- AI-assisted scope analysis, agreement generation/versioning, milestone management, dual-party agreement approval, and activity history.
- Provider evidence submissions with validated public URL references and private file attachments (JPEG, PNG, WebP, PDF, TXT; 4 MB each), immutable submission history, and participant-authorized downloads.
- Groq advisory evidence assessments validated with Zod against the exact approved agreement version and that version's acceptance criteria. Assessments are persisted separately from submissions; missing credentials and failed AI calls leave evidence saved and retryable.
- Buyer revision requests and participant human-review requests; AI cannot approve agreements or authorize payments.
- PayPal REST Orders v2 CAPTURE checkout, OAuth token reuse, hashed PayPal-Request-Id idempotency keys, server-side order/capture reconciliation, exact amount/currency/deal matching, unique capture IDs, and signed/idempotent webhook event processing. Providers configure their PayPal merchant receiving email; orders name that provider as the payee so checkout proceeds are routed directly to the provider account. This requires PayPal account/partner permissions for payee routing. Use Sandbox credentials during development.
- Persistent participant-scoped notifications with unread counts, pagination, mark-read actions, and a deal activity timeline.
- Deal discussion messages for participant negotiation, contextual floating Ask AI, neutral AI dispute summaries, dock-style workspace navigation, and drag-and-drop milestone ordering with keyboard controls.
- Gmail SMTP transactional email via Nodemailer with React Email templates, idempotent EmailLog records, and retry processing. Email states record queued, sending, SMTP-accepted, or failed; SMTP acceptance does not confirm inbox delivery. Gmail SMTP does not provide delivery, open, click, or bounce webhooks.
- Deal-scoped semantic retrieval with Atlas Vector Search / OpenAI embeddings.
- Rate limiting and security headers/origin checks are included; verify deployment-specific settings before production.

## Requirements

- Node.js 20+
- MongoDB Atlas (or a MongoDB deployment supporting the Prisma MongoDB connector)
- Optional: Groq for deal analysis/evidence assessment, OpenAI for embeddings, PayPal Sandbox for checkout, and Gmail SMTP for email.

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

Open http://localhost:3000 for the public landing page. Create an account at `/register` and open the authenticated workspace at `/dashboard`. The first account can create a deal after the provider has also registered. The provider must set their receiving PayPal merchant email in the deal workspace before the buyer can check out. Sign in at `/login`. The workspace derives the buyer identity from the authenticated session.

If login or registration returns HTTP 503, open [http://localhost:3000/api/health/database](http://localhost:3000/api/health/database). It reports whether `DATABASE_URL` is missing or MongoDB is unreachable. Confirm the Atlas cluster is running, the current network/IP is allowed in Atlas Network Access, and the username/password in `DATABASE_URL` are correct (URL-encode special characters in the password). Then run `npx prisma db push` and restart `npm run dev`. The auth API also writes the detailed server-side failure to the terminal without logging connection credentials.

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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP server settings; Gmail uses `smtp.gmail.com`, port `587`, and `false` for STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD` | Gmail address and Google App Password; never use your regular Gmail password |
| `EMAIL_FROM` | Sender label and address, such as `TrustFlow AI <your-gmail@gmail.com>` |
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

### Gmail SMTP setup

1. Sign in to the Gmail account that will send TrustFlow notifications.
2. Enable Google 2-Step Verification.
3. Open Google Account → Security → App Passwords and generate an App Password.
4. Copy the generated 16-character password. Do not use the account's regular Gmail password.
5. Add the SMTP settings below to `.env.local` (or `.env` for local development), replacing the placeholders with the Gmail account values:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-gmail@gmail.com
   SMTP_PASSWORD=your-16-character-google-app-password
   EMAIL_FROM=TrustFlow AI <your-gmail@gmail.com>
   ```

6. Restart the development server.

Gmail applies sending limits and may temporarily defer or reject messages. `SENT` means the SMTP server accepted the message; it does not guarantee that it reached the recipient's inbox. Gmail SMTP does not report delivery, opens, clicks, or bounces. Failed transient sends can be retried using the authenticated email outbox endpoint.

### Vercel deployment

Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in Vercel Project Settings → Environment Variables for each environment where email should be sent (Development, Preview, and/or Production). Store the App Password only in Vercel's server-side environment settings. Redeploy after changing environment variables so the new values take effect.

Some integrations require credentials and service-side configuration. A successful local compile does not verify live Gmail SMTP, PayPal, or Atlas Vector Search configuration. For local development, private uploads are stored under `.trustflow-uploads` (ignored by Git). In production, set `TRUSTFLOW_PRIVATE_UPLOAD_DIR` to a persistent private volume; do not point it at `public/`. This adapter is filesystem-backed, not S3/object storage.

## Security and deployment notes

- A 401 from `/api/deals` or `/api/notifications` means there is no valid session cookie for the request. Register or sign in first. If a stale session cookie is present, the server clears it when it detects the missing/expired session; then sign in again.
- Session cookies are HttpOnly. Do not attempt to set them from client-side JavaScript.
- A provider email can be invited before the person registers; the deal is linked when that person creates an account with the invited email address.
- Keep PayPal in Sandbox until webhook handling, capture reconciliation, credentials, and production configuration have been independently verified.
- Configure the Atlas Vector Search index to match the embedding dimensions and the `trustflow_vector_index` name before enabling semantic retrieval.
- TrustFlow is not escrow. Do not describe payments as held, protected, or released by TrustFlow.

## Architecture

- `src/app`: Next.js App Router pages and API routes.
- `src/components`: authentication, notifications, workspace, and PayPal UI.
- `src/lib/auth.ts`, `password.ts`: session and password primitives.
- `src/lib/ai.ts`, `rag.ts`: structured AI analysis and retrieval.
- `src/lib/email.ts`, `mailer.ts`, `email-templates.tsx`: Gmail SMTP transport, idempotent email delivery, and transactional templates.
- `prisma/schema.prisma`: MongoDB data model.

## License

MIT. See [LICENSE](LICENSE).
