# Written by Ants

A minimal poetry publishing platform built with:

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase Auth (passwordless email code) + Postgres + RLS
- TipTap rich text editor (text buttons only)

## Features

- Passwordless login (`/login` -> email code verification)
- First-login onboarding (`/onboarding`) for poet name + bio
- Public homepage feed in chronological order
- Protected writing flow with draft + publish + unpublish + delete
- Public poem page with draft privacy for author only
- Like/Unlike with unique user reaction per poem
- Profile management + user settings (`public_profile`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy env file and fill values:

```bash
cp .env.local.example .env.local
```

3. Run development server:

```bash
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. Keep Auth Email provider enabled.
3. Run SQL from `supabase/schema.sql` in Supabase SQL Editor.
4. In Supabase Auth email template for sign-in, use `{{ .Token }}` (and avoid `{{ .ConfirmationURL }}`) so users receive a code instead of a link.
5. Keep OTP length in sync with `OTP_LENGTH` in `src/components/login-form.tsx` (currently `8`).
6. In Supabase Auth URL settings, add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_PRODUCTION_DOMAIN/auth/callback`
   - `https://*.vercel.app/auth/callback` (preview deployments)
7. Set Site URL:
   - Local: `http://localhost:3000`
   - Production: `https://YOUR_PRODUCTION_DOMAIN`

## Environment Variables

Set these locally and in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Deploying to Vercel

1. Push this project to a Git provider.
2. Import the repo in Vercel.
3. Add environment variables listed above.
4. Confirm Supabase redirect URLs include your Vercel production URL and preview wildcard.
5. Deploy.

## Build Notes

- This app uses dynamic server rendering where auth is required.
- It does not use `next export`.
- Session handling uses `@supabase/ssr` with App Router cookies.
