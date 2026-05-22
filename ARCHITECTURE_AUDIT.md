# Email Tracker Architecture Audit

## Current State

This repo is already a Manifest V3 browser extension with a lightweight Express tracking API:

- `extension/` injects tracking pixels and rewritten links into Gmail and Outlook compose windows.
- `extension/background/service-worker.js` stores local tracking sessions and syncs with the API.
- `server/server.js` serves tracking pixels, redirects tracked links, and records open/click metadata in memory.

The product direction is valid, but the current implementation is still prototype-grade. It can be loaded locally after replacing the OAuth client ID, but it is not production-ready for real users.

## Critical Gaps

1. **No durable backend storage**
   The server uses an in-memory object, so all tracking data disappears on restart or serverless cold start. Use Postgres, MongoDB, DynamoDB, or Supabase with explicit tables for users, connected accounts, messages, recipients, opens, clicks, and consent state.

2. **No real user authentication on the API**
   `/sync`, `/clear`, and tracking data access are unauthenticated. Add signed user sessions or JWT auth, validate every request, and scope every query by user/account.

3. **Tracking IDs are public bearer secrets**
   Anyone with a tracking URL can generate opens/clicks. Use high-entropy IDs, separate public event IDs from private dashboard IDs, and add bot/image-proxy classification.

4. **Gmail account connection needs production Google OAuth setup**
   The extension now includes Chrome Identity scaffolding. You must create a Google Cloud OAuth client of type “Chrome Extension”, set the final extension ID, replace the placeholder `client_id`, and complete Google verification if adding Gmail API scopes.

5. **Open tracking is inherently approximate**
   Gmail image proxying, Apple Mail Privacy Protection, corporate security scanners, and disabled remote images can cause false positives or missed opens. The UI and docs should say “opened or image loaded,” not guaranteed human read.

6. **Compliance model is incomplete**
   Tracking emails can trigger privacy, consent, and employment-law obligations depending on region and use case. Add consent/disclosure controls, retention enforcement, data export/delete flows backed by real storage, and a public privacy policy.

## Recommended Target Architecture

Use a split architecture:

- **Chrome extension**
  Connect Google account, detect Gmail compose/send, inject pixel and optional tracked links, show local status, and sync with the API.

- **API backend**
  Authenticate extension users, create tracking sessions, serve pixel/link endpoints, classify events, store event data, and expose dashboard APIs.

- **Database**
  Store normalized records. Do not store full email bodies unless absolutely required.

- **Event pipeline**
  Record raw opens/clicks first, then classify into human, bot, image proxy, duplicate, and suspected prefetch events.

- **Dashboard**
  Show delivery/open/click timeline per recipient, but clearly label confidence levels.

## Upgrade Roadmap

### Phase 1: Make the extension coherent

- Replace the OAuth placeholder in `extension/manifest.json`.
- Keep one API base URL in config and support dev/prod environments.
- Add a per-email tracking toggle and link tracking toggle.
- Store connected Gmail account metadata and display it in the popup/options.
- Harden Gmail DOM selectors with tests or manual QA after Gmail UI changes.

### Phase 2: Make tracking reliable enough for beta

- Move server storage to a real database.
- Add authenticated API calls from the extension.
- Add ownership checks for all dashboard/sync endpoints.
- Add event deduplication and bot/proxy detection.
- Add retention jobs.

### Phase 3: Gmail API integration

- Decide whether the extension only augments Gmail web compose or sends through the Gmail API.
- If sending through Gmail API, request the least privileged scope that fits the workflow and expect Google OAuth app verification.
- Prefer `gmail.send` only if the extension constructs and sends messages itself. If the user sends inside Gmail UI, avoid broad mailbox scopes.

### Phase 4: Production hardening

- Add automated tests for server endpoints.
- Add extension smoke tests with Playwright or manual Chrome load checklist.
- Add structured logging, metrics, and alerting.
- Add privacy policy, terms, abuse prevention, and data-processing controls.

## Notes From Official Docs

Chrome’s Identity API is the right integration point for Google OAuth in extensions. It requires the `identity` permission, an `oauth2` manifest section, and a Chrome Extension OAuth client ID. `getAuthToken({ interactive: true })` should be launched from a user action so the consent prompt has context.

Sources:

- Chrome Identity API: https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome OAuth guide: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- Gmail send API: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
