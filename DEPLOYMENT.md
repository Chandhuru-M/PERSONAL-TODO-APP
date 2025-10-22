# Deployment Guide

This project has a React Native app (Expo) and a Node/Express backend that integrates with Supabase.

- Mobile app: Expo (EAS Build)
- Backend: Node/Express (deploy to Render/Railway/Fly/Azure App Service)
- Data: Supabase (Auth, Postgres)

## 1) Supabase setup (once)

1. Create a Supabase project at https://supabase.com
2. Get these values from Project Settings → API:
   - Project URL
   - anon public key (for the app)
   - service role key (for the backend)
3. Apply the SQL schema and policies (RLS) from `backend/supabase/0001_create_tasks.sql` in the Supabase SQL editor.
4. Configure environment:
   - Frontend `.env` (or secrets):
     - `EXPO_PUBLIC_SUPABASE_URL=<your project url>`
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon key>`
   - Backend `backend/.env` (or server env vars):
     - `SUPABASE_URL=<your project url>`
     - `SUPABASE_SERVICE_ROLE_KEY=<your service role key>`
     - `PORT=4000`

Use `.env.example` at the repo root and `backend/.env.example` as references.

## 2) Backend deploy (Render example)

You can use any Node host. Here’s a quick path using Render:

Option A — One-click blueprint

- In Render, choose "New +" → "Blueprint" and point to this repo; it will detect `render.yaml`.
- Create the service. In the created web service, set environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PORT` (e.g., `4000`)
- Deploy. After deploy, verify health:

```
GET https://<your-backend>.onrender.com/health
```

Copy the base URL and set it in the mobile app’s env as `EXPO_PUBLIC_API_URL`.

Option B — Manual web service

- Create a new Web Service pointing to the `backend/` folder in this repo
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Set the same env vars as above

### CI/CD for backend (Render Deploy Hook)

This repo includes `.github/workflows/deploy-backend-render.yml` which triggers a Render deploy via Deploy Hook on push to `main` affecting `backend/**` or `render.yaml`.

Steps:
1. In your Render service → Settings → Deploy Hook, copy the URL
2. In GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
  - Name: `RENDER_DEPLOY_HOOK`
  - Value: the URL from Render
3. Push to `main` (changes in backend) to auto-deploy.

> If you prefer Railway, Fly.io, or Azure App Service, the same commands/envs apply. For Azure App Service, choose Node runtime, configure the same env vars, and use `npm run build && npm run start`.

## 3) Mobile app builds (EAS)

Prereqs:
- Install EAS CLI and log in: `npm i -g eas-cli` → `eas login`
- Ensure `.env` has:
  - `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_API_URL=https://<your-backend-host>`

Configure build profiles are in `eas.json`. To produce an Android APK you can sideload:

```bash
# From repo root
# (Optional) Initialize EAS if first time
# eas init

# Build an Android APK for testing/sideload
eas build -p android --profile preview

# Open the build page and download the APK when finished
```

For iOS, you’ll need Apple credentials. You can run:

```bash
eas build -p ios --profile preview
```

and follow the prompts. For store submissions, use the `production` profile and `eas submit`.

### CI/CD for EAS builds

This repo includes `.github/workflows/eas-build-android-preview.yml` which triggers a cloud build manually (workflow_dispatch). Before running it:

1. Create a GitHub secret `EAS_ACCESS_TOKEN` (from your Expo account → Account → Access Tokens)
2. Set your app runtime environment variables in EAS:
   - In https://expo.dev → Project → Build → Secrets, create:
     - `EXPO_PUBLIC_SUPABASE_URL`
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
     - `EXPO_PUBLIC_API_URL`
   Alternatively, pass `apiBaseUrl` input when starting the workflow to override `EXPO_PUBLIC_API_URL`.
3. Run the workflow from the Actions tab and download the APK from the EAS build page.

## 4) Configure the app to use your backend

The app will read the API base URL from `EXPO_PUBLIC_API_URL` (see `constants/api.ts`). Ensure this is set to your deployed backend URL.

- Example:

```
EXPO_PUBLIC_API_URL=https://your-backend.onrender.com
```

## 5) Smoke test

- Start the backend locally or use the deployed URL and verify `/health` returns 200.
- Run the app in development:

```bash
npm install
npm run start
```

- On the device/simulator, log in (Supabase auth) and create a task. It should:
  - Save to Supabase via backend
  - Appear ordered by its scheduled time (e.g., 4:30–5:00 AM)
  - Respect reminders if enabled

## Troubleshooting

- Auth errors: Verify Supabase URL/keys in `.env` (frontend) and `backend/.env`.
- Network errors on device:
  - For Android emulator, local default base is `http://10.0.2.2:4000`.
  - For on-device testing, you must point `EXPO_PUBLIC_API_URL` to an accessible host (LAN IP or hosted backend).
- Notifications on web are limited—prefer native builds for Expo Notifications.

## What I still need from you

- Your chosen hosting for the backend (Render/Railway/Azure/etc.). If Azure, I can produce an Azure App Service workflow and Bicep/terraform on request.
- Supabase details:
  - Project URL
  - anon key (frontend)
  - service role key (backend)
- Whether you want Android APK only now, or iOS/TestFlight/App Store/Play Store submissions too.
