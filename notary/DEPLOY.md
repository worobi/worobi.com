# Worobi Notary isolated application

**Prepared release candidate only. No publishing or deployment is authorized yet.**

## Verified deployment facts and stop conditions

The current Coolify app `g3iszb07j76qquxweoqlqs6d` is **Worobi Family**, a family hub/personal directory. It serves the shared worobi.com repository using nginx, document root `/usr/share/nginx/html`, on port 80. No standalone Notary app was found among the ten inspected resources.

**Do not replace, reconfigure, or redeploy Worobi Family as this Notary-only Node app.** Do not run the repository's `_server/deploy.sh`; it affects multiple websites.

Parent verification on November 9, 2026 found scoutconsultatory.com and notary.worobi.com resolving to the origin `159.198.39.151`, rather than Cloudflare proxy IPs. The current reverse proxy is Traefik. These facts do not establish the exact Notary host rule, upstream, path rewriting, trusted hop count, or whether the app is reachable without the proxy. Inspect those before cutover.

Do not commit this combined Notary candidate to the existing shared auto-deployed branch yet. The converted forms need a Node API, and the new server/configuration files must not be copied into the family site's public nginx root.

## Required rollout: separate isolated Notary application

The preferred release is a **new, separately approved Notary application with its own source/deployment bundle**, preserving Worobi Family, personal pages, and the shared Formspree account/endpoint. The delivered `notary-isolated-app.zip` contains only the complete `notary/` tree and uses the same Docker build paths below; it can seed a dedicated repository when that action is approved.

Before deploying or changing a hostname, the parent must inspect:
1. The exact current `notary.worobi.com` Traefik router, upstream app, port, and any path mapping.
2. Whether other hostnames or `worobi.com/notary/` paths rely on the same shared app.
3. How the new isolated Notary app will own only the Notary hostname and how the prior rule will be restored on rollback.
4. Any shared-repository auto-deploy behavior. Do not let a code push switch forms before their API exists.

Then create/configure the separate app only with approval. Never reuse the Worobi Family app ID above for this candidate.

### Build settings for the isolated bundle/repository

- Build context: the source bundle/repository root (`/`), containing a `notary/` directory.
- Dockerfile: `notary/Dockerfile`.
- Dockerfile-specific ignore file: `notary/Dockerfile.dockerignore`.
- Container port: `3000`.
- Intended hostname after approved cutover: `https://notary.worobi.com`.
- Health check: `GET /healthz`.
- Production startup: `node server/index.js`.
- Build command from bundle root: `docker build -f notary/Dockerfile .`.

The context must be the bundle/repository root, not `/notary`. This image explicitly copies Notary source and its public pages/assets only. It does not copy family/personal sites, tests, environment files, or legacy deployment scripts. Its Node HTTP server exposes only the three public pages and `assets/`, not backend code or configuration.

The Dockerfile was reviewed but not built here because no Docker engine is available.

## Shared-static-root exposure assessment

The Node application's allowlisted routes protect only requests handled by that Node application. They do not protect files that a different nginx app copies into `/usr/share/nginx/html`.

If the whole shared repository is copied there without exclusions or deny rules, newly committed paths such as these may be downloadable:
- `/notary/server/mail.js` and `/notary/server/app.js`
- `/notary/package.json` and `/notary/package-lock.json`
- `/notary/Dockerfile`, `/notary/.env.example`, tests, and deployment notes

The exact URL may differ if the Notary hostname maps directly to the notary directory. The currently active nginx deny/copy configuration has not been verified, so treat exposure as a release blocker rather than assuming protection.

No credentials are present in the candidate or `.env.example`. Nevertheless, backend-source disclosure is unnecessary and future local environment files could expose secrets if copied. `.gitignore` is not an HTTP access rule, and `notary/Dockerfile.dockerignore` affects only builds using that Dockerfile. It does not change the existing shared nginx build.

**Preferred mitigation:** keep the isolated backend/full app in its own private source repository or deployment bundle, outside all shared static roots. Do not commit the backend to the shared site repository.

**Alternative only after explicit design review:** preserve the shared static app's other pages while changing its build to copy an explicit allowlist of public files; keep backend source outside that output. Add Notary-scoped nginx denial of backend/config/test/environment paths as defense in depth, and verify those exact paths return 403/404. If retaining static frontend hosting, proxy only the Notary host's `/api/requests` to a separate backend, preserving same-origin form behavior. Do not apply a global rule that breaks family/personal pages or repoint their Formspree forms. This alternative is not implemented or authorized by this candidate.

## Runtime configuration and secrets

Configure SMTP-only credentials in the new isolated app's runtime settings. Never place them in static HTML/JS, browser variables, build arguments, committed files, or the shared nginx directory.

Required:
- `SMTP_HOST`: the approved Purelymail SMTP host.
- `SMTP_PORT=587` for required STARTTLS, or `465` for implicit TLS.
- `SMTP_USER=notary@worobi.com`.
- `SMTP_PASS`: the separately approved SMTP-only credential.
- `SITE_URL=https://notary.worobi.com` without a trailing slash.
- `TRUST_PROXY_HOPS`: default 0. Set 1 only after verifying exactly one trusted Traefik hop and preventing direct client access to the app.
- `PORT=3000`.

The Dockerfile sets `PUBLIC_DIR=/app/public` and `NODE_ENV=production`. SMTP values are consumed exclusively by server-side code. No HTTP response or public file contains those values. `/healthz` returns only `{"status":"ok"}`, not SMTP configuration or readiness; it does not verify email delivery.

For a local source checkout, install dependencies and run `npm start` from `notary/`. Explicit page/asset routes safely use that directory.

The rate limit is 5 form requests per IP per hour across sales/support, with process-local memory and one app replica assumed. A restart resets counters. Incorrect proxy configuration can group all visitors under the proxy IP. Do not use unrestricted trust proxy.

No production SMTP credentials are currently configured in Scout, per parent verification. This Notary release does not change Scout configuration.

## Fixed routing and truthful status

- Appointment inquiries: `notary@worobi.com`.
- Help desk requests: `sos@worobi.com`.
- Authenticated From address: `notary@worobi.com`.
- From and Reply-To display names: the visitor's validated name.
- Reply-To address: the visitor's email with case/plus tags preserved.
- No AI classification, attachments, arbitrary recipients, or automatic retry.

Both forms POST JSON to `/api/requests`. The prepared Notary markup no longer uses Formspree, but no shared Formspree configuration or unrelated website has been changed. Submit buttons remain disabled without JavaScript, with direct email alternatives.

A positive UI response means the intended recipient was accepted by SMTP. It does not verify delivery, CRM creation, ticket creation, Business/Team, or an appointment. Errors retain entered data.

## Release checklist

1. Obtain publication/deployment approval and verify the hostname routing, shared app dependencies, and rollback plan.
2. Choose a separate Notary app and isolated source bundle/repository; leave Worobi Family unchanged.
3. Configure approved SMTP-only runtime credentials. Verify mailbox/Frappe routing separately.
4. Run `npm ci --ignore-scripts && npm test` from `notary/`, then build the isolated Docker image.
5. Visually review desktop/mobile pages. Cloud rendering was blocked during preparation; no successful visual QA is claimed.
6. Verify backend/config/environment URLs are inaccessible on both the isolated app and any remaining shared static paths. Verify `/healthz` reveals no configuration.
7. Cut over only the verified Notary host after approval. Deploy its frontend and backend together, never converted forms onto the old static-only host.
8. After separately authorized synthetic sends, verify actual Inbox/CRM/Helpdesk records, visitor identity, Business/Team, and no duplicates. Retain the previous host route/image/config for rollback.
