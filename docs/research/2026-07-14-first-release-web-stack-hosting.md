# First-release web stack and hosting research

Research date: 2026-07-14
Scope: facts for issue #10 only. This report compares implementation-shaped options; it does not select an architecture or resolve issue #11.

## Product constraints assessed

- A private PGA Tour tiers game with server-side Contest authorization, passwordless email sign-in, invitations, and a relational data model.
- One managed production environment and local development; no required staging environment.
- Best-effort availability, no recovery or support commitment, and a $0-$25/month operating target excluding the domain and email delivery.
- Poll ESPN every 60 seconds only while a Tournament is in active play. The map already fixes ESPN, through the `gstat`-based adapter, as the live-data source; this report does not revisit that decision.

## Cross-cutting findings

### Transactional email

- Resend offers SMTP relay and requires an API key and verified domain to use it. Its free transactional tier includes 3,000 emails/month, capped at 100/day; the next tier is $20/month for 50,000 emails/month. [Resend SMTP documentation](https://resend.com/docs/send-with-smtp) and [pricing](https://resend.com/pricing)
- Supabase Auth's default SMTP service is not suitable for a production friends app: it sends only to pre-authorized team addresses, currently limits sending to two messages/hour, and has no delivery or uptime SLA. Supabase requires custom SMTP for passwordless email to other users; it supports SMTP providers including Resend. [Supabase custom SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
- Therefore, the stated budget excludes a required production dependency: the domain is needed to verify the email sender, even if the expected first-release email volume remains in Resend's free allowance.

### External availability and scheduled-work monitoring

- Better Stack's free tier includes 10 monitors and heartbeats, email and Slack alerts, and an uptime check frequency of up to 30 seconds. A monitor can check the public application and a heartbeat can detect a missing poller run. [Better Stack pricing](https://betterstack.com/uptime/pricing)
- This covers minimal best-effort alerting at $0, but it is monitoring rather than a recovery, backup, or availability guarantee.

## Option A: Next.js, Vercel Pro, and Supabase

| Concern | Officially documented fit | Limit or operational constraint |
| --- | --- | --- |
| Full stack and local development | Next.js' default project setup includes TypeScript and App Router. Supabase publishes a Next.js quickstart and its CLI can run local Postgres, Auth, Storage, and related services using a Docker-compatible runtime. [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Supabase local development](https://supabase.com/docs/guides/local-development) | Local Supabase requires Docker-compatible container software. |
| Passwordless email auth | Supabase Auth provides magic links and email OTP. Magic-link/OTP requests are rate-limited to one per 60 seconds by default and expire after one hour by default. [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless) | Configure custom SMTP/Resend before inviting real Participants; the default sender is not production-capable. |
| Relational database | Supabase Free includes a dedicated Postgres database with 500 MB; it also includes 50,000 MAUs. [Supabase pricing](https://supabase.com/pricing) | Free projects pause after one week of inactivity, have no automatic backups, retain platform logs for one day, and are limited to two active projects. A production poller should normally prevent inactivity, but that is not a substitute for an availability guarantee. |
| ESPN polling every 60 seconds | Vercel Pro cron supports a one-minute minimum interval and per-minute scheduling precision; cron invokes a Vercel Function. [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) | Vercel Hobby cannot deploy a cron schedule more frequent than daily and has hourly precision. The poll handler must itself decide whether a Tournament is active; the scheduler is not an active-play filter. |
| Hosting and deploy | Vercel can automatically create preview deployments for branch pushes and production deployments from the configured production branch. [Vercel Git deployments](https://vercel.com/docs/git) | Vercel Pro is required for the schedule. It includes one deploying seat; each additional deploying member is $20/month. |
| Secrets | Vercel environment variables are encrypted at rest, can be scoped to Production, Preview, and Development, and are available during builds and Function execution. [Vercel environment variables](https://vercel.com/docs/environment-variables) | Project users with access can view the values. Changes apply only to new deployments. |
| Logs | Vercel exposes real-time Function runtime logs, including `console` output. Pro retains those logs for one day; Vercel log drains require Pro or Enterprise. [Vercel runtime logs](https://vercel.com/docs/logs/runtime), [Vercel Function logs](https://vercel.com/docs/functions/logs) | Retention is deliberately minimal at this price point. Supabase's Logs Explorer covers its API, Postgres, Auth, and Edge Function logs; Free retention is one day. [Supabase logging](https://supabase.com/docs/guides/platform/logs), [Supabase pricing](https://supabase.com/pricing) |
| Uptime monitoring | Use the shared Better Stack monitor plus heartbeat. | No platform SLA follows from the selected plans. |

**Known baseline:** Vercel Pro has a $20/month platform fee, which includes $20/month usage credit, 1 TB Fast Data Transfer, and 10 million Edge Requests. Supabase Free, Resend Free, and Better Stack Free make the nominal baseline $20/month. Infrastructure usage after Vercel's included allocation is billed on demand, so this is not a hard $25 ceiling. [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan), [Supabase pricing](https://supabase.com/pricing), [Resend pricing](https://resend.com/pricing), [Better Stack pricing](https://betterstack.com/uptime/pricing)

**Feasibility:** Meets the minute-polling requirement only on Vercel Pro and nominally fits the budget, but leaves at most $5/month before domain cost, paid email delivery, or usage overages. Supabase Pro starts at $25/month, so pairing it with Vercel Pro exceeds the ceiling before email and monitoring.

## Option B: React Router on Cloudflare Workers, D1, and Cloudflare Access OTP

| Concern | Officially documented fit | Limit or operational constraint |
| --- | --- | --- |
| Full stack and local development | Cloudflare documents React Router as a full-stack React framework on Workers. Its generated configuration uses SSR and the Cloudflare Vite plugin, which runs server code in the Workers runtime during local development. [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/react-router/) | The application must be compatible with the Workers runtime rather than assuming Node.js server APIs. SPA mode and prerendering are not supported by the Cloudflare Vite plugin for this setup. |
| Passwordless email auth | Cloudflare Access can send a single-use OTP to email addresses allowed by an Access policy. The PIN expires after 10 minutes. The Worker must validate the `Cf-Access-Jwt-Assertion` JWT, including issuer and application audience, before treating its email claim as the User identity. [Cloudflare Access OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) | Access sends the login code only after its policy allows the email. That makes Access-policy provisioning/removal part of the app's invitation/access lifecycle, in addition to Contest-level authorization in D1. Each authenticated Access user consumes a seat until removed; an email-address rule supports at most 1,000 addresses. Email security scanners may consume a code. [Cloudflare seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/), [Access account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/) |
| Relational database | Cloudflare D1 is its serverless SQL database. On the Workers Paid plan it includes 25 billion rows read/month, 50 million rows written/month, and 5 GB storage; it charges by rows read/written and stored GB rather than capacity hours. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) | On the Free plan, daily limits are 5 million rows read, 100,000 rows written, and 5 GB total storage; exceeding a daily read/write limit makes D1 queries fail until reset. Indexes reduce rows scanned but add indexed-write cost. |
| Transactional email | Use Resend independently for invitation, cancellation, and other application email; it can use SMTP or its API. | Access OTP is sent by Cloudflare, whereas product email comes from Resend. The two email flows, sender identities, and operational controls are separate. |
| ESPN polling every 60 seconds | Workers Cron Triggers support `* * * * *` for every minute and invoke a `scheduled()` handler. Cloudflare documents this use specifically for periodically calling third-party APIs. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) | Cron Trigger changes can take up to 15 minutes to propagate; schedules run in UTC. Retain poll-run state in D1 and make the operation idempotent because scheduling alone is not a data-consistency guarantee. |
| Hosting and deploy | Workers Paid has a $5/month minimum and includes 10 million requests/month and 30 million CPU milliseconds/month; scheduled invocations can use up to 15 minutes CPU time each. Workers Builds can deploy automatically from GitHub or GitLab pushes. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) | Usage above included Workers/D1 limits is metered. The reported $5 is the Workers plan minimum, not an all-inclusive maximum. |
| Secrets | Worker secrets are encrypted bindings, are unavailable for display in the dashboard and Wrangler after creation, and can be separate per environment. Local secrets belong in ignored `.dev.vars` or `.env` files. [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) | Do not put secret values in Wrangler `vars`; do not commit local secret files. |
| Logs | Workers Logs records invocation and custom logs, including cron invocation logs. Paid Workers includes 20 million log events/month with seven-day retention; overage is $0.60/million events. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) | Use structured logs and avoid PII. Cron Events retains only the most recent 100 scheduled invocations. |
| Uptime monitoring | Use the shared Better Stack monitor plus heartbeat. | No platform SLA follows from this plan. |

**Known baseline:** Workers Paid is $5/month minimum. Its paid-plan allowance contains the D1, Workers Logs, and Worker limits above; Resend Free and Better Stack Free are $0 at their published allowances. Cloudflare's official pricing page advertises a Zero Trust free plan but does not state its current Access seat allowance in the public material reviewed here; its seat documentation confirms that each authenticating user consumes one seat until removed. Confirm the current Access plan allowance and price before treating this option as within the $25 ceiling. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/), [Cloudflare seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Resend pricing](https://resend.com/pricing), [Better Stack pricing](https://betterstack.com/uptime/pricing)

**Feasibility:** The compute, database, scheduler, logs, secrets, deployment, application email, and monitoring components have a low published baseline. The authentication choice is feasible only if Access's policy lifecycle can be intentionally incorporated into private invitations and its current account terms fit the expected Participant count. It does not eliminate the need for the application to enforce Contest-scoped authorization after identity is established.

## Constraints that rule out apparent free variants

- Vercel Hobby cannot run a cron more frequently than daily, so it cannot provide the 60-second ESPN poll. [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Supabase's supplied email service cannot send passwordless messages to ordinary Participants and is explicitly not for production use. [Supabase custom SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
- A Supabase Pro production project starts at $25/month before a separate web host, email delivery, and uptime monitoring, so it cannot coexist with Vercel Pro inside the stated cap. [Supabase pricing](https://supabase.com/pricing)
- Cloudflare scheduled work is not instantly reconfigured: Cron Trigger changes may take up to 15 minutes to propagate. The app must tolerate that operational delay and use active-play checks in the handler. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Open decision inputs, intentionally not decided here

- Whether a $20 Vercel baseline with usage-overage exposure is acceptable versus a Workers-runtime stack with Access-policy coupling.
- Whether Access OTP's operational model and current account allowance suit the expected friends-only Participant count.
- The concrete data-access policy, schema, invitation integration, polling idempotency strategy, and deployment configuration. These are architecture/specification work, not research conclusions.
