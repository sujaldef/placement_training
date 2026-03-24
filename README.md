# Placement Training Planner

Next.js app with:

- Encoding-fixed planner content in [planner-data.js](planner-data.js)
- Signup/Login using name + password
- Secure password hashing with bcrypt
- User-specific progress tracking (`todo`, `review`, `done`)
- MongoDB persistence (preferred)
- Local JSON fallback storage for demo mode

## Tech Stack

- Next.js (App Router)
- React
- MongoDB + Mongoose
- JWT (HTTP-only cookie session)
- bcryptjs

## Environment Variables

Copy [.env.example](.env.example) to `.env` and configure:

```env
MONGODB_URI=
JWT_SECRET=change-this-to-a-strong-random-secret
```

Notes:

- In local development, if `MONGODB_URI` is empty or MongoDB is unreachable, app falls back to local JSON at `data/auth-progress.json`.
- In production (Vercel), MongoDB is required and the API returns `503` until `MONGODB_URI` is configured and reachable.

## Local Development

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

3. Open:

`http://localhost:3000`

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/planner`
- `GET /api/progress` (protected)
- `PUT /api/progress` (protected)

## Deploy To Vercel

1. Push project to GitHub.
2. Import repository in Vercel.
3. Add environment variables in Vercel Project Settings:
   - `MONGODB_URI`
   - `JWT_SECRET`
4. Deploy.

This repo includes [vercel.json](vercel.json) configured for Next.js.

## Project Structure

```text
app/
   api/
      auth/
         login/route.js
         logout/route.js
         me/route.js
         signup/route.js
      planner/route.js
      progress/route.js
   dashboard/page.js
   globals.css
   layout.js
   page.js
components/
   DashboardClient.js
lib/
   auth.js
   db.js
   models.js
   planner.js
   storage.js
data/
planner-data.js
middleware.js
next.config.js
vercel.json
```
