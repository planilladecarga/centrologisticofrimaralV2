<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3abf5ecb-9ee8-48ad-8b0a-91988df9bf53

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create your local environment file from the example:
   `cp .env.example .env.local`
3. Update `.env.local` with your Firebase and Gemini values:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
   - `GEMINI_API_KEY` (server-only secret; do not expose as `NEXT_PUBLIC_*`)
   - `NEXT_PUBLIC_TEMPERATURE_ENDPOINT` (optional; defaults to internal LAN URL)
4. Run the app:
   `npm run dev`

## Environment and secrets

- `.env.local` is ignored by git; do not commit real credentials.
- `.env.example` only contains placeholder values and required variable names.
- Firebase `NEXT_PUBLIC_*` values are public client config, but still keep project-specific real values out of version control.

- For GitHub Actions deploys, configure repository secrets for all Firebase variables and `GEMINI_API_KEY`.
