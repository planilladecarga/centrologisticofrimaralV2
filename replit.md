# Centro Logístico Frimaral - Logistics Dashboard

## Overview
A Next.js 15 logistics dashboard application with Firebase Firestore integration for inventory management. Features Excel file upload for inventory data import and real-time database updates.

## Architecture
- **Framework**: Next.js 15 (App Router)
- **Database**: Firebase Firestore (client-side)
- **Styling**: Tailwind CSS v4
- **Animations**: Motion (Framer Motion)
- **Excel**: xlsx library for file parsing

## Key Files
- `app/page.tsx` - Main logistics dashboard UI
- `app/layout.tsx` - Root layout
- `lib/firebase.ts` - Firebase configuration and Firestore export
- `hooks/use-mobile.ts` - Mobile viewport hook
- `next.config.ts` - Next.js configuration

## Replit Configuration
- Runs on port 5000 (`next dev -p 5000 -H 0.0.0.0`)
- Workflow: "Start application" → `npm run dev`
- `allowedDevOrigins` set for `*.replit.dev` domains

## Firebase
Firebase credentials are hardcoded in `lib/firebase.ts` (public client-side config — this is safe for Firebase as access is controlled via Firestore Security Rules).

## Environment Variables
- `GEMINI_API_KEY` - For Google Gemini AI API (optional, not currently wired up)
- `APP_URL` - App host URL (optional)
