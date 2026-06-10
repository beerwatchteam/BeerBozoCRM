# BeerBozo CRM

Internal CRM and team management dashboard for [BeerBozo](https://beerbozo.com.au) — the Australian app for finding the cheapest drink prices at pubs and bars.

## Stack

- **Frontend**: React + Vite + Tailwind CSS (Cloudflare Pages)
- **Backend**: Node.js + Express (any Node host — Railway, Render, VPS)
- **Database**: Cloudflare D1 via Cloudflare Workers
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Auth**: Google OAuth 2.0 + JWT

---

## Project Structure

```
/beerbozo-crm
  /client       React frontend (Vite)
  /server       Express backend
  /worker       Cloudflare Worker (D1 database proxy)
  .env          Environment variables (never commit)
  .gitignore
  README.md
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/beerbozo-crm.git
cd beerbozo-crm
```

### 2. Fill in `.env`

Open `.env` at the root and fill in every value:

```env
GOOGLE_CLIENT_ID=         # From Google Cloud Console
GOOGLE_CLIENT_SECRET=     # From Google Cloud Console
GMAIL_REDIRECT_URI=https://crm.beerbozo.com.au/auth/callback

SESSION_SECRET=           # Any long random string
JWT_SECRET=               # Any long random string (different from SESSION_SECRET)

ANTHROPIC_API_KEY=        # From console.anthropic.com

WORKER_URL=http://localhost:8787   # Local dev; replace with deployed Worker URL in prod
WORKER_SECRET=            # Any secret shared between Express and the Worker

PORT=3001
CLIENT_URL=http://localhost:5173   # Replace with production URL in prod
```

### 3. Set up Cloudflare D1

1. Install Wrangler globally: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Create the D1 database:
   ```bash
   wrangler d1 create beerbozo-crm-db
   ```
4. Copy the `database_id` from the output into `worker/wrangler.toml`
5. Run the schema migration:
   ```bash
   cd worker
   npm run db:init
   # or for remote: wrangler d1 execute beerbozo-crm-db --remote --file=./schema.sql
   ```

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Enable the **Gmail API** and **Google OAuth2 API**
4. Under **Credentials** → **OAuth 2.0 Client IDs**, create a Web client
5. Add authorised redirect URIs:
   - `http://localhost:3001/auth/callback` (local dev)
   - `https://crm.beerbozo.com.au/auth/callback` (production)
6. Copy Client ID and Client Secret into `.env`

### 5. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
cd ../worker && npm install
```

### 6. Run locally

In three separate terminals:

```bash
# Terminal 1 — Cloudflare Worker (D1 database)
cd worker && npm run dev

# Terminal 2 — Express backend
cd server && npm run dev

# Terminal 3 — React frontend
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment

### Frontend (Cloudflare Pages)

1. Push repo to GitHub (`beerbozo-crm`)
2. In Cloudflare Pages dashboard → **Create a project** → connect your GitHub repo
3. Set build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `client`
4. Add environment variable: `VITE_API_URL=https://YOUR_EXPRESS_SERVER_URL`
5. Deploy

### Backend (Express server)

Deploy `server/` to Railway, Render, Fly.io, or any Node.js host. Set all `.env` variables as environment variables on the host. Make sure `CLIENT_URL` points to your Cloudflare Pages URL.

### Cloudflare Worker

```bash
cd worker
wrangler deploy
```

Set `WORKER_SECRET` in the Cloudflare Worker dashboard (Settings → Variables) to match your `.env`.

Update `WORKER_URL` in your Express server environment variables to the deployed Worker URL.

---

## Features

- **Gmail integration**: auto-syncs inbox on load, refreshes every 60 seconds
- **AI email processing**: each email is automatically categorised (collab / investor / advertiser / platform / outreach) and summarised using Claude
- **AI draft reply**: one-click AI-generated reply, editable before sending
- **Compose**: send new emails directly from the CRM
- **Internal team chat**: persistent AI personas (Alex CEO, Mia Marketing, Sam Design, Jordan Commercial)
- **Stats dashboard**: totals, unread count, collab and commercial breakdowns
