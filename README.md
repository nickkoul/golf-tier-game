# Golf Tier Game

React Router v7 application running on Cloudflare Workers with D1 persistence.

## Local development

1. Run `npm install`.
2. Apply the local schema with `npx wrangler d1 migrations apply DB --local`.
3. Start the Workers-compatible runtime with `npm run dev`.

## Production configuration

Set the `database_id` in `wrangler.deploy.jsonc` to the production D1 database
ID before deploying. Store production credentials only as Worker secrets, for
example:

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put VERIFICATION_TOKEN
```

Keep local credentials in `.dev.vars`, which is ignored by Git. Do not add
credential values, email links, auth tokens, or Lineup details to logs; application
logs use structured non-PII event names.

Deployments run from pushes to `main` through GitHub Actions. The workflow requires
the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
