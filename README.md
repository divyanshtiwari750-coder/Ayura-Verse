# Ayura Verse — backend

A small Node.js + Express API for the Ayura Verse Clinical Trials Dashboard
prototype. It gives the dashboard real persistence (a JSON file on disk)
instead of an in-browser array that resets on every refresh, and serves the
existing frontend from the same server so there's nothing to configure —
one process, one port.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser. That's it — the
frontend is served as a static file from `public/` and talks to the API
under `/api/*` on the same origin, so there's no CORS setup needed.

The first time it runs, it creates `data.json` in this folder, seeded with
the same trial/sites/regulatory docs the prototype used to hard-code.
Everything you add through the UI (participants, adverse events, progress
updates) is written to that file, so it survives restarts. Delete
`data.json` any time to reset the demo to a clean slate.

To use a different port: `PORT=5000 npm start`.

## What changed in the frontend

`public/Ayura_Verse.html` is the same UI as before, with these changes:

- `TRIAL`, `SITES`, `REGULATORY_DOCS`, `participants` and `aes` are no
  longer hard-coded — they're loaded once from `GET /api/bootstrap` before
  the login screen is shown.
- Adding a participant, logging an adverse event, and clicking "+1 week"
  now `POST`/`PATCH` to the API and use the server's response (which
  includes the generated ID) instead of only updating in-memory state.
- The DM/AE domain CSV exports on the Interoperability page now download
  directly from the backend.
- Login is now a real account system (see below) instead of the old
  "any credentials accepted" prototype.
- Everything else — role-based access control, the FHIR preview, the
  anomaly/prediction analytics, the charts — still runs entirely in the
  browser, exactly as before; it just reads data that now happens to have
  come from the server.

## Accounts

There's a "Create an account" link on the login screen. Anyone can sign up
with a name, a user ID, a password (6+ characters), and a role. **Site
Investigator accounts pick their site at signup and are locked to it from
then on** — that site is stored on the account, not asked again at login.
Passwords are hashed with bcrypt before being written to `data.json`; the
frontend never receives a password hash, only `{ name, userId, role, site }`.

To test different roles, just sign up more than once with different user
IDs — there's no limit on how many accounts you create.

### Principal Investigator access code

Signing up as **Principal Investigator** — the role that can see and delete
every account — requires an access code. The default is:

```
AIIA-PI-2026
```

Change it before sharing this with anyone by either editing `PI_ACCESS_CODE`
near the top of `server.js`, or setting an environment variable instead
(no code edit needed):

```bash
PI_ACCESS_CODE=your-own-code npm start
```

Site Investigator, Ethics Committee, and Pharmacovigilance Officer accounts
don't need any code — only Principal Investigator is gated.

### Removing accounts

Two ways to do this:

- **In the app**: sign in as a **Principal Investigator** and open
  **Manage accounts** in the sidebar — it's the one role that can see it.
  It lists every registered account with a Delete button, plus a "Delete
  all accounts" button. There's no *extra* password check beyond being
  signed in as that role (same lightweight auth as the rest of this
  prototype) — fine for a local demo, not something to expose on a shared
  or public deployment without adding a real admin check.
- **Directly**: stop the server, open `data.json`, and edit the `"users"`
  array by hand — remove one entry, or clear the array to remove everyone.
  Restart the server afterwards.

## API reference

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | Body: `name, userId, password, role, site` (site required only for Site Investigator). Returns the created account (no password). |
| POST | `/api/auth/login` | Body: `userId, password`. Returns the account on success, `401` on bad credentials. |
| POST | `/api/auth/reset-password` | Body: `userId, newPassword`. No old-password or email verification — see "Forgot password" note below. |
| GET | `/api/auth/users` | List of registered accounts (no password hashes). Only called by the frontend's Manage Accounts page, which is only reachable as Principal Investigator — but the endpoint itself has no server-side role check, so treat it as dev-only. |
| DELETE | `/api/auth/users/:id` | Delete one account. Same caveat as above. |
| DELETE | `/api/auth/users` | Delete every account. Same caveat as above. |
| GET | `/api/bootstrap` | Everything the frontend needs on load (trial, sites, participants, adverse events, regulatory docs). |
| GET | `/api/trial` | Trial metadata. |
| GET | `/api/sites` | Site list (id, name, target). |
| GET | `/api/participants` | Optional `?site=<name>` filter. |
| POST | `/api/participants` | Body: `site, age, gender, prakriti, vikriti, dosha, agni, ahara, nidra, dose, anupana, duration`. Returns the created record with a generated `id`. |
| PATCH | `/api/participants/:id/progress` | Advances that participant by one week; marks `Completed` when the duration is reached. |
| GET | `/api/adverse-events` | All logged adverse events. |
| POST | `/api/adverse-events` | Body: `participant, event, date, severity, causality, serious`. |
| GET | `/api/regulatory-docs` | Ethics/regulatory document statuses. |
| GET | `/api/interop/fhir/:id` | FHIR `Patient` resource for one participant. |
| GET | `/api/interop/export/dm` | CDISC-style DM domain CSV download. |
| GET | `/api/interop/export/ae` | CDISC-style AE domain CSV download. |
| GET | `/api/health` | Liveness check. |

## Where the data lives

`db.js` is a thin wrapper around a single `data.json` file — no database
server to install, which keeps this easy to run and show to judges. The
read/write logic is isolated in `db.js`, so if you later want real
persistence (SQLite, Postgres, etc.) for a production version, you only
need to swap that one file — `server.js`'s routes don't need to change.

## Known limitations (by design, for a hackathon demo)

- No session/auth tokens — a successful login just tells the browser which
  account it is for that tab; there's no cookie or JWT keeping you signed
  in across a page reload, so refreshing sends you back to the login screen.
- Single-process, single-file storage — fine for a demo, not for concurrent
  production traffic.
- "Forgot your password" doesn't send an email or text — it just lets
  anyone who knows a user ID set a new password for it. That's fine for a
  demo where every account is a test account, but it's not real identity
  verification. A real deployment would need an email-based reset link
  (or similar) before this could be trusted with real accounts.
