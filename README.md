# Command Centre

An internal executive intelligence dashboard for Young Driver Insurance. Built with Next.js 14, deployed on Netlify, and authenticated via Microsoft Entra ID (Azure AD).

---

## Overview

Command Centre gives the Young Driver Insurance management team a single place to monitor renewals performance, call-centre activity, HR data, and Microsoft 365 communications. An embedded AI assistant (OD1N) can answer questions about business data, send SMS messages, and generate reports.

---

## Features

| Section | Description |
|---|---|
| **Renewals** | Live KPIs from OpenGI (premium, commission, earn), AI insights, advisor performance, revenue trend charts |
| **Calls** | FusionPBX call-centre analytics — volume, duration, queue stats |
| **HR** | Sage HR employee data — headcount, absence, org chart |
| **Email** | Microsoft Graph inbox (Outlook) |
| **Calendar** | Microsoft Graph calendar — next 7 days, Teams join links |
| **Teams** | Microsoft Teams chat list |
| **OD1N** | AI assistant (Claude) — voice/text, SMS dispatch, stats reports |
| **AI Query** | Freeform natural language questions answered by Claude with live data |
| **Admin** | User management — create accounts, assign roles and section access |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (dark theme, custom design tokens) |
| Auth | next-auth v5 — Microsoft Entra ID SSO + local credentials |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) |
| Charts | Recharts |
| Deployment | Netlify (`@netlify/plugin-nextjs`) |
| Icons | Lucide React |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Netlify (Production)                  │
│                                                         │
│  Next.js App Router                                     │
│  ├── app/(dashboard)/          Protected pages          │
│  ├── app/api/                  Server-side API routes   │
│  ├── lib/data/connectors/      External API wrappers    │
│  └── components/               React UI components     │
│                                                         │
│  Auth: next-auth JWT  ──► Microsoft Entra ID (SSO)     │
│                       └──► Local credentials (dev)      │
└──────────────────────────────┬──────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          │                    │                      │
          ▼                    ▼                      ▼
   OpenGI SOAP          Microsoft Graph        Anthropic API
   (via VM proxy)       Mail / Calendar        Claude (AI)
          │             Teams
          ▼
   Windows Server VM (78.157.192.42)
   soap-proxy :3001  ──► OpenGI InfoService
   (whitelisted IP)
```

### Why the SOAP proxy?

OpenGI's InfoService only accepts requests from whitelisted IPs. Netlify serverless functions have no fixed outbound IP. The solution is a lightweight Node.js proxy (`soap-proxy/server.js`) running on a Windows Server VM whose IP is already whitelisted by OpenGI. Netlify posts SOAP envelopes to the proxy with a shared secret; the proxy forwards them to OpenGI over HTTPS.

---

## Project Structure

```
CommandCentre/
├── app/
│   ├── (dashboard)/            Dashboard shell + protected routes
│   │   ├── layout.tsx          Sidebar, topbar, auth check
│   │   └── dashboard/
│   │       ├── home/           OD1N AI assistant
│   │       ├── stats/          Renewals KPI dashboard
│   │       ├── renewals/       Renewals detail
│   │       ├── calls/          Call-centre analytics
│   │       ├── hr/             HR / workforce
│   │       ├── email/          Outlook inbox
│   │       ├── calendar/       Calendar
│   │       ├── teams/          Teams chats
│   │       ├── ai-query/       Natural language query
│   │       ├── admin/          User management
│   │       └── settings/       User settings
│   ├── api/
│   │   ├── auth/[...nextauth]/ NextAuth handler
│   │   ├── renewals/           OpenGI renewals data + AI insights
│   │   ├── calls/              FusionPBX call data
│   │   ├── hr/                 Sage HR data
│   │   ├── ms/                 Microsoft Graph (mail, calendar, teams)
│   │   ├── odin/               OD1N command execution + stats reports
│   │   ├── sms/                FireText SMS dispatch
│   │   ├── ai-query/           Streaming Claude AI chat
│   │   ├── contacts/           Contact directory
│   │   ├── admin/users/        Admin user CRUD
│   │   ├── register/           Self-registration
│   │   └── tts/piper/          Piper TTS (OD1N voice)
│   ├── login/                  Login page
│   └── layout.tsx              Root layout
├── components/
│   ├── odin/                   OD1N voice/text interface
│   ├── ai-query/               Chat interface
│   ├── auth/                   Login panel
│   ├── admin/                  User management panel
│   ├── dashboards/
│   │   ├── renewals/           KPI cards, charts, AI insights
│   │   ├── calls/              Call metrics
│   │   ├── hr/                 HR overview
│   │   ├── email/              Inbox list
│   │   ├── calendar/           Event list
│   │   └── teams/              Chat list
│   ├── sidebar.tsx
│   ├── topbar.tsx
│   └── status-bar.tsx
├── lib/
│   ├── auth.ts                 NextAuth config, JWT callbacks, token refresh
│   ├── access-control.ts       RBAC — roles and section permissions
│   ├── security.ts             Rate limiting, CSRF, URL validation
│   ├── local-users.ts          Local user store (file-based, /tmp on Netlify)
│   ├── users.ts                Executive user registry
│   ├── contacts.ts             Contact directory
│   ├── microsoft-graph.ts      Graph API client (mail, calendar, teams, send)
│   ├── odin/command-engine.ts  OD1N intent parsing and action dispatch
│   └── data/connectors/
│       ├── opengi-soap.ts      OpenGI SOAP (via proxy)
│       ├── pbx-api.ts          FusionPBX REST API
│       ├── renewals-api.ts     Renewals aggregation + AI insights
│       └── sage-hr.ts          Sage HR REST API
├── data/
│   ├── users.json              Local user store (auto-created, git-ignored)
│   └── contacts.json           Contact directory
├── scripts/
│   └── security-smoke.mjs      API security smoke tests
├── netlify.toml                Netlify build + function timeout config
├── next.config.mjs             Next.js config, webpack alias, security headers
├── tailwind.config.ts          Design tokens and custom animations
└── .env.example                Environment variable reference
```

---

## Access Control

Three roles control what sections a user can see:

| Role | Access |
|---|---|
| `global_admin` | All sections + admin panel |
| `admin` | Configured sections (no admin panel) |
| `user` | Home only by default; admins can grant additional sections |

Sections: `home`, `renewals`, `calls`, `hr`, `ai-query`, `email`, `teams`, `calendar`, `admin`, `notifications`, `settings`

The account whose email matches `GLOBAL_ADMIN_EMAIL` (set in `lib/access-control.ts`) is automatically promoted to `global_admin` on first registration.

---

## Local Development

### Prerequisites

- Node.js 20+
- A `.env.local` file (copy from `.env.example`)

### Setup

```bash
git clone https://github.com/Grima-git/CommandCentre.git
cd CommandCentre
npm install
cp .env.example .env.local
# Edit .env.local — see Environment Variables section below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev auth bypass

Set `DEV_AUTH_BYPASS=1` in `.env.local` to enable local credential login without Microsoft Entra ID. Create your first account at `/login` → **Create login**. The first account whose email matches `GLOBAL_ADMIN_EMAIL` becomes Global Admin automatically.

> `DEV_AUTH_BYPASS` is forced to `0` in production by `netlify.toml`.

---

## Environment Variables

Copy `.env.example` to `.env.local` for development, or set in **Netlify → Site → Environment variables** for production.

### Auth

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Random secret for JWT signing. Generate: `openssl rand -base64 32` |
| `AUTH_URL` | Full production URL, e.g. `https://command-centre-myfirst.netlify.app`. Required to prevent Entra ID redirect URI mismatches on Netlify. |
| `DEV_AUTH_BYPASS` | Set to `1` to enable local credential login (dev only; auto-disabled in production) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Azure App Registration — Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Azure App Registration — Client secret |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |

### AI

| Variable | Description |
|---|---|
| `YDI_ANTHROPIC_KEY` | Anthropic API key — [console.anthropic.com](https://console.anthropic.com/account/keys) |

### OpenGI SOAP (via proxy)

| Variable | Description |
|---|---|
| `SOAP_PROXY_URL` | URL of the SOAP proxy on the Windows VM, e.g. `http://78.157.192.42:3001` |
| `SOAP_PROXY_SECRET` | Shared secret — must match `SECRET` in `soap-proxy/server.js` on the VM |

### PBX (FusionPBX)

| Variable | Description |
|---|---|
| `PBX_API_BASE_URL` | FusionPBX base URL |
| `PBX_DOMAIN_UUID` | Domain UUID from FusionPBX |
| `PBX_API_KEY` | FusionPBX API key |

### SMS (FireText)

| Variable | Description |
|---|---|
| `FIRETEXT_API_KEY` | FireText API key |
| `FIRETEXT_SENDER_ID` | Sender name shown on SMS (default: `YoungDriver`) |

### HR (Sage HR)

| Variable | Description |
|---|---|
| `SAGE_HR_BASE_URL` | Sage HR instance URL |
| `SAGE_HR_API_KEY` | Sage HR API key |

### TTS (optional — OD1N voice)

| Variable | Description |
|---|---|
| `PIPER_TTS_URL` | HTTPS URL of a self-hosted [Piper HTTP](https://github.com/rhasspy/piper) service. If unset, OD1N runs text-only. |
| `PIPER_TTS_VOICE` | Override voice model name |
| `PIPER_TTS_LENGTH_SCALE` | Speech rate (default `1.02`) |

---

## Deployment (Netlify)

The app is deployed at **https://command-centre-myfirst.netlify.app**.

Netlify is connected to this GitHub repository — every push to `main` triggers an automatic redeploy.

Key `netlify.toml` settings:
- Node.js 20 runtime
- `DEV_AUTH_BYPASS = "0"` forced in production
- Extended function timeouts: AI query and renewals routes get 26 seconds; calls gets 20 seconds

### Manual deploy trigger

Go to **Netlify → Site → Deploys → Trigger deploy**.

---

## Microsoft Entra ID (Azure AD) Setup

The app is registered in Azure under:

- **Application ID:** `dd1e2a2d-5f91-458a-bba2-7359699ff884`
- **Directory (Tenant) ID:** `04e25c52-b6ac-4993-8e8b-37c6d92d9b25`
- **Client secret expiry:** 12/05/2028

### Required API permissions (Microsoft Graph, Delegated)

- `openid`, `profile`, `email`, `offline_access`
- `User.Read`
- `Mail.Read`, `Mail.Send`
- `Calendars.Read`
- `Chat.Read`
- `Presence.Read`

### Redirect URI

Add this in Azure Portal → App registrations → Authentication → Redirect URIs:

```
https://command-centre-myfirst.netlify.app/api/auth/callback/microsoft-entra-id
```

---

## SOAP Proxy (Windows Server VM)

Because Netlify serverless functions have no fixed outbound IP, OpenGI SOAP requests are proxied through a Windows Server VM (`78.157.192.42`) whose IP is whitelisted by OpenGI.

### Proxy server location

```
C:\System\Websites\soap-proxy\server.js
```

### Managing the proxy (on the VM)

```cmd
# Check status
"C:\Users\thomas.wilson\AppData\Roaming\npm\pm2.cmd" list

# Restart after editing server.js
"C:\Users\thomas.wilson\AppData\Roaming\npm\pm2.cmd" restart soap-proxy

# View logs
"C:\Users\thomas.wilson\AppData\Roaming\npm\pm2.cmd" logs soap-proxy
```

The proxy listens on port 3001 (TCP inbound rule added to Windows Firewall). It validates the `x-proxy-secret` header on every request and rejects anything that doesn't match.

---

## User Management

Users are stored in `data/users.json` (locally) or `/tmp/cc-data/users.json` (on Netlify — ephemeral, resets on container restart).

### Creating users

- Users can self-register at `/login` → **Create login**
- Admins can manage roles and section access in the **Admin** panel (`/dashboard/admin`)

### Roles

- The first account registered with the `GLOBAL_ADMIN_EMAIL` address is automatically promoted to `global_admin`
- Global admins can promote other users to `admin` and configure which sections they can access

---

## OD1N — AI Assistant

OD1N is the Command Centre's built-in AI assistant, powered by Anthropic Claude.

**Capabilities:**
- Answer natural language questions about renewals, calls, and HR data
- Send SMS messages via FireText (`send sms to [name] ...`)
- Generate summary stats reports
- Voice output via Piper TTS (if `PIPER_TTS_URL` is configured)

**Command examples:**
- *"What were today's renewals?"*
- *"Send SMS to George: can you check the renewal for policy YDI-12345"*
- *"How many calls came in this week?"*

---

## Security

- All API routes require an authenticated session (`requireApiAccess`)
- Rate limiting is applied per-IP on public-facing endpoints
- CSRF protection on all mutating requests (POST/PUT/PATCH/DELETE)
- Security headers set in `next.config.mjs`: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`
- The SOAP proxy validates a shared secret on every request
- `DEV_AUTH_BYPASS` is automatically disabled in production
