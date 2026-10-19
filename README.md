# Call Recon

**Roadside Assistance, Reimagined.** Fast response. Clear pricing. Peace of mind.

Call Recon is an on-demand towing and roadside assistance marketplace. Customers request help, see an itemized price before anything is sent, and track their request; verified independent providers receive offers, accept jobs and update status; Call Recon staff dispatch, verify providers, manage pricing, payments, payouts and support.

> **Status: working MVP in demo mode. Not production-ready.** Every automated test below passes, but real bookings must wait until the items in [Launch checklist](#launch-checklist) are done: live integrations need credentials and live testing, and every policy, fee and business detail needs to be entered and legally reviewed.

---

## Deploying the demo site with Docker

```bash
docker build -t call-recon-demo .
docker run -p 3000:3000 call-recon-demo        # http://localhost:3000
```

The image sets `DEMO_SITE=true`: only `/launch` and `/demo/*` are served (everything else redirects to `/launch`), no database or credentials are needed, and `/healthz` is the health check. Set `PORT` if your host assigns one. Do not set `DEMO_SITE` when you later run the full app with a database.

## Launch page and concept demos

`/launch` is a public vision page and `/demo/*` are click-through walkthroughs (customer, driver, admin, dispatch engine). They are in `src/app/(concept)`, never read or write the database, and keep their sample data in the browser tab only. Dollar amounts and arrival times are left blank on purpose. Covered by `e2e/concept.spec.ts`.

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # DEMO_MODE="true" by default
npm run setup                 # creates the SQLite database and seeds the catalog (+ demo data in demo mode)
npm run dev                   # http://localhost:3000
```

### Demo accounts (demo mode only)

All use the password `CallRecon-demo-2026`. The sign-in page also has one-tap demo buttons.

| Account | Role |
| --- | --- |
| customer@demo.callrecon.test | Customer with a saved vehicle and a completed sample request |
| driver.bayside@demo.callrecon.test | Verified flatbed provider, online, all services |
| driver.harbor@demo.callrecon.test | Verified roadside van, online (jump-start, tire, lockout, fuel) |
| driver.gulf@demo.callrecon.test | Verified motorcycle carrier, offline |
| driver.pending@demo.callrecon.test | Provider awaiting verification |
| admin@demo.callrecon.test | Super admin |
| dispatch@demo.callrecon.test | Dispatcher |
| support@demo.callrecon.test | Support |
| finance@demo.callrecon.test | Finance |

Demo data covers a sample Tampa area (ten downtown-area ZIP codes) with **sample** prices labeled as demo rules. The request form offers three fictional sample addresses so you can try the flow without a mapping key. In demo mode no email, SMS or push is sent, no card is charged (`DEMO_NOT_CHARGED`), payouts are never sent (`DEMO_NOT_PAID`), and live Stripe keys are refused.

### Production setup (outline)

1. Set `DEMO_MODE="false"` and switch Prisma to PostgreSQL (`provider = "postgresql"` in `prisma/schema.prisma`, then `npx prisma db push` or generate migrations).
2. `npm run setup` (seeds only the service catalog when not in demo mode).
3. Create the first super admin: `ADMIN_PASSWORD="12+ characters" npm run create-admin -- you@company.com "Your Name"`.
4. Sign in, open **Admin → Settings** and fill in every section; add service areas and pricing rules.
5. Configure the integrations below, schedule `/api/cron/sweep` every minute, serve over HTTPS (session cookies are `Secure` in production).

---

## What's built

**Public site:** landing page (hero, request card, services, three steps, benefits, service area from configured areas only, FAQ, support, footer), help center with contact form, policy pages, Become a Driver, shareable status links (no addresses, contacts or prices). "Call 911" is shown wherever safety comes up; Call Recon is never presented as an emergency service.

**Accounts:** sign up, sign in, sign out, password reset (link shown on screen only in demo mode), phone verification (when SMS is configured), profile, notification preferences, saved vehicles and places, saved cards (Stripe SetupIntent), location consent, account deletion (anonymizes personal data, keeps financial records).

**Request flow (6 steps):** location (device location, map pin with Mapbox, saved/sample places, address lookup when a mapping provider is configured) → service (only services offered by verified providers at that location) → vehicle → situation and safety → itemized price → review and consent. Requests with photos, landmarks, destination for tows.

**Tracking:** status timeline from recorded history only; price quotes to approve or decline; card authorization step (when Stripe is configured); searching / no-provider-available with retry; provider card; arrival information that is labeled honestly (see below); in-app messaging (no phone numbers shared); cancellation with the fee shown first; completion, review, receipt.

**Provider app:** onboarding (business, truck, winch, services, coverage by ZIPs and/or radius, operating hours), document upload (private storage), verification status, online/offline, location sharing only after consent and only while online or on a job, offers with countdown, accept/decline, job page with directions link, status buttons with the driver's own ETA, price change requests that need customer approval, job documentation upload, release job, earnings and payouts.

**Admin console (role-based):** overview with live counts and integration status; requests and dispatch (confirmed quotes, eligible-provider preview with exclusion reasons, manual assign/reassign, release, status override, price changes, cancel with or without fee, refunds, messages, offer history); providers (document review, verification with per-service authorization, suspend); customers and staff (suspend, roles, create staff); support and disputes; payments, payouts (mark paid, hold, release) and refunds; pricing rules with disclosed surcharges; service catalog; service areas; promotions and referral settings; reports with CSV exports; audit log; settings (business details, policies, dispatch rules, cancellation fee, platform fee, price-change threshold, data retention with purge).

**Roles:** `CUSTOMER`, `PROVIDER`, `ADMIN` with admin roles `SUPER_ADMIN`, `DISPATCHER`, `SUPPORT`, `FINANCE`. The permission matrix is in `src/lib/permissions.ts` and is enforced in every service function, not just in the UI.

### Honesty rules built into the code

- **Prices** come only from configured pricing rules. Without a rule, or when towing distance can't be calculated (no mapping key), the customer is told a dispatcher will send a confirmed quote, and nothing is dispatched until they approve it. Estimates and final totals are stored separately; increases during a job need customer approval.
- **Arrival times:** a live ETA is shown only when the driver shared a location in the last 3 minutes **and** a mapping service computed the route. Otherwise the driver's own estimate is shown and labeled as such, or nothing. Driver location is never simulated.
- **Availability** is never claimed before a provider accepts. Coverage text comes only from configured service areas.
- **Payments:** card data never touches the server (Stripe Elements). A payment becomes authorized/succeeded only from a signature-verified Stripe webhook, never from the browser. Without Stripe, nothing is charged and the UI says so.
- **Business details and policies** are blank by default; public pages show clear `[placeholder]` notices until an admin enters them. No testimonials, ratings, response-time promises or invented contact details anywhere.

### Request lifecycle

`SUBMITTED → SEARCHING → ASSIGNED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED`, plus `CANCELLED` and `NO_PROVIDER_AVAILABLE`. Allowed transitions and who may perform each one are in `src/lib/services/lifecycle.ts`; every change is a compare-and-set update with a history row recording who, when and why.

**Dispatch:** offers go out in rounds (batch size, timeout, rounds and max distance are configurable) to verified, active, online providers who are authorized for the service, have suitable equipment, are inside their hours and coverage, and aren't on another job; ranking uses distance and optionally acceptance rate. Expired offers advance to the next round; exhausted rounds produce `NO_PROVIDER_AVAILABLE` and alert dispatch. Manual assignment is always available as the fallback.

### Revenue model

A disclosed platform fee (percentage of the pre-tax job total, set in **Settings → Payments**) is deducted before provider payout and shown line by line in provider earnings. An optional per-request service fee can be added as its own line in each pricing rule. Payouts stay on hold until the fee is set.

---

## Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript**, server actions for all forms, Tailwind CSS v4.
- **Prisma 6** with SQLite locally (PostgreSQL-ready). Money is stored in integer cents.
- **Custom session auth:** bcrypt (cost 12), random tokens stored as SHA-256 hashes, httpOnly SameSite=Lax cookie, 14-day sliding sessions, rate limiting on sign-in, sign-up, resets, messages and uploads.
- Integrations are plain `fetch` adapters with no SDK lock-in: `src/lib/integrations/{maps,stripe,messaging,storage}.ts`.

```
prisma/              schema.prisma, seed.ts
scripts/             create-admin.ts
src/lib/services/    business logic: requests, lifecycle, dispatch, matching, pricing,
                     payments, notifications, providers, accounts, admin, eta, files
src/lib/             auth, permissions, validation (zod), settings, env, audit, rate limit
src/app/(site)       public pages        src/app/(focus)  request flow
src/app/(app)        customer, provider and admin apps
src/app/api          files, Stripe webhook, cron sweep, reports, provider location, health
tests/               unit/integration tests (Vitest)    e2e/  browser tests (Playwright)
```

---

## Testing and QA results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run build` (production) | Pass |
| `npm test`: 76 Vitest tests across auth, permissions, transition table, pricing, matching, full lifecycle, cancellation, payments (webhook signatures, idempotency, capture/refund handling with a mocked processor) and notifications (dedupe, retries) | **76/76 pass** |
| Repeat runs of `npm test` | 14 of 15 consecutive runs fully green; one run had a single failure that didn't reproduce in the next 14 runs, so one test is likely timing-sensitive. Worth tracking down before launch. |
| `npm run test:e2e`: 18 Playwright browser tests against a production build with demo data | **18/18 pass** |

The browser suite covers: customer registration and validation errors; jump-start request with itemized estimate and tax line; provider accepts the offer and moves the job through en route, arrived, in progress and completed; customer sees completion and receipt; free cancellation before assignment; towing without a mapping key waits for a dispatcher quote; dispatcher sends a confirmed quote, customer approves, dispatcher assigns; signed-out redirects; customers and providers blocked from other areas; dispatcher, support and finance each limited to their permissions (including CSV export); unverified provider uploads a document, admin can't approve until documents are approved, then approves; contact form creates a ticket that support resolves (resolution note required); pricing rule edit shows up in the audit log; and a crawl of every reachable page as visitor, customer, provider and super admin checking for dead links, HTTP errors, console errors, horizontal scrolling at 390 px phone width, and serious/critical WCAG 2 A/AA issues (axe-core).

To run the browser tests: `npm run setup && npm run build && PORT=3100 npm start`, then `npm run test:e2e` (set `E2E_BASE_URL` to point elsewhere, `CHROMIUM_PATH` to use a system Chromium). Run against a freshly seeded database.

**Issues found and fixed during QA:** admin request page crashed when a quote was awaiting confirmation; blank surcharge rows blocked saving pricing rules; Stripe.js was loaded on every page even without keys (now loaded only when a payment form opens); text links failed WCAG link distinction (now underlined); provider hours and admin tables overflowed on phones; the offer countdown caused a hydration error; admin request/provider pages could be wider than the screen; approved documents still showed an Approve button; uploaded PDFs now download instead of rendering inline; staff can't self-delete; staff sign-ins and failed sign-ins are now audited; payouts held for a missing platform fee get the fee applied on release.

**Not covered by automated tests (needs live testing):** real Stripe test-mode payments end to end (authorization, capture, refunds, disputes via webhooks), Mapbox/Google geocoding and routing, real email/SMS/push delivery, real device geolocation, multiple browsers (only Chromium was tested) and screen-reader walkthroughs.

---

## Launch checklist

### 1. External credentials and services

| Integration | Env vars | Without it |
| --- | --- | --- |
| Mapbox (or Google Maps Geocoding + Distance Matrix) | `MAPBOX_TOKEN`, `NEXT_PUBLIC_MAPBOX_TOKEN` or `GOOGLE_MAPS_API_KEY` | No address lookup or map pin; towing prices need a dispatcher-confirmed quote; no live ETA |
| Stripe (**test mode first**) | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | No card collection; nothing charged |
| Stripe webhook endpoint | `https://<your-domain>/api/webhooks/stripe` with events `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created` | Payments never move past "pending" |
| Resend email | `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) | In-app notifications only; password reset emails can't be sent |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (A2P 10DLC registration for US texting) | No SMS updates or phone verification |
| Push gateway | `PUSH_WEBHOOK_URL` | No push (for future mobile apps) |
| Scheduler | `CRON_SECRET` + call `/api/cron/sweep` every minute | Offer timeouts only advance when someone loads a page |
| Production database | PostgreSQL `DATABASE_URL` with backups | SQLite is for development only |
| File storage | Move `src/lib/integrations/storage.ts` to S3-compatible private storage with encryption | Files live on the app server's disk |
| Hosting | HTTPS domain, `APP_URL`, error monitoring, uptime checks | |
| Provider payouts | Stripe Connect (or your bank's payout process) | Payouts are recorded and marked paid manually with a transfer reference |
| Rate limiting at scale | Shared store (e.g. Redis) | In-memory limits reset on restart and aren't shared across servers |

### 2. Business and legal configuration (Admin → Settings)

None of these have defaults; enter only confirmed, attorney-approved text.

- Legal business name, address, support phone, support email, support hours, public service area summary.
- Terms of service, privacy policy, cancellation policy, refund policy, provider requirements, pricing and payment disclosures.
- Cancellation fee and free-cancellation window; platform fee %; price-change approval threshold; location data retention period.
- Pricing rules for every service and area (base fee, included miles, per-mile, service fee, minimum, tax rate, surcharges). Replace or deactivate every rule marked **Demo**, and the demo service area.
- Service areas where verified providers are actually onboarded.

### 3. Florida compliance review (before accepting real bookings)

Verify with a Florida attorney and accountant, at minimum:

- Business registration (Florida Division of Corporations), local business tax receipts, and any county/city towing or wrecker licensing and rate ordinances where you operate (several Florida counties regulate towing rates and require wrecker licenses).
- Florida towing and storage rules (e.g. Fla. Stat. §§ 713.78 and 715.07) and how they apply to a dispatch marketplace versus the tow operators.
- Insurance: general liability, platform/marketplace coverage, and the commercial auto, on-hook/cargo and garage-keepers coverage you'll require from providers (set the minimums in Provider requirements).
- Independent contractor classification for providers and the provider agreement.
- Consumer protection: Florida Deceptive and Unfair Trade Practices Act, clear price disclosure, cancellation and refund terms, receipts.
- Sales tax treatment of towing and roadside services and of your platform fee (Florida Department of Revenue), then set tax rates in pricing rules.
- Payments: Stripe account approval for this business type, PCI scope (Stripe Elements keeps you at SAQ A), chargeback handling.
- Privacy: location data handling, retention period, and SMS consent (TCPA) for text messages.

### 4. Provider onboarding

- Recruit providers in each launch area; each creates an account at **Become a Driver**.
- Review license, insurance certificate and truck registration (check expiry dates, names, coverage amounts); approve documents, then approve the provider and authorize only the services their equipment supports.
- Confirm payout details and sign the provider agreement outside the app (Stripe Connect is not built yet).
- Walk each provider through going online, sharing location, accepting an offer and updating status.

### 5. Live testing before launch

1. Stripe **test mode**: authorize with test cards, complete a job (capture), cancel with and without fee, refund from admin, trigger a dispute; confirm each status arrives through the webhook.
2. Mapping: geocode real addresses, check towing distance and estimates against known routes, confirm the map pin.
3. Email and SMS to real test phones/inboxes; password reset by email.
4. Scheduled sweep running; offer timeouts and no-provider alerts.
5. A full pilot with real providers in one area on real phones (iOS Safari and Android Chrome), with the team watching the admin console.
6. Then switch Stripe to live keys with `DEMO_MODE="false"` and run one real low-value transaction end to end.

---

## Known limitations

- Price increases above the authorized card amount are captured up to the authorized amount; the balance is flagged on the payment ("collect balance") for staff to collect. Re-authorization isn't automated.
- Provider payouts are recorded and reconciled in the app but not sent automatically (no Stripe Connect yet).
- No in-app voice calling or masked phone numbers; customer and provider talk through in-app messages.
- No social sign-in and no native mobile apps (push delivery goes to a webhook ready for a future app).
- Messages and status pages refresh by polling (every 10–30 seconds), not websockets.
- Support replies are sent from your own mailbox; tickets track status and resolution.
- English only.
