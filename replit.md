# Centro Logístico Frimaral V2

## Overview
A Next.js logistics management system for Centro Logístico Frimaral — covering inventory, dispatches, and operational control. Originally built for Vercel, migrated to Replit.

## Architecture
- **Framework**: Next.js 14.2.29 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.x
- **AI**: Google Gemini (`@google/genai`)
- **Database/Auth**: Firebase
- **Charts**: Recharts
- **PDF**: pdfjs-dist
- **Excel**: xlsx, xlsx-js-style
- **Animations**: motion (Framer Motion)

## Project Structure
- `app/` — Next.js App Router pages (layout, page, globals.css)
- `components/` — Shared React components (InventoryView, PdfProcessor, TemperatureMonitor)
- `lib/` — Utilities and Firebase config
- `hooks/` — Custom React hooks
- `src/components/` — Additional component directory

## Environment Variables
- `GEMINI_API_KEY` — Required for Google Gemini AI API calls
- `APP_URL` — The URL where the app is hosted (optional, for self-referential links)

## Running on Replit
- **Dev server**: `npm run dev` → runs on port 5000, host 0.0.0.0
- **Workflow**: "Start application" auto-starts the dev server
- **Config**: `next.config.mjs` (renamed from `.ts` for Next.js 14 compatibility)

## Replit Migration Notes
- Downgraded Next.js from 15.x to 14.2.29 — the Next.js 15 SWC binary was incompatible with the NixOS environment (bus error on startup)
- Renamed `next.config.ts` → `next.config.mjs` — Next.js 14 does not support `.ts` config files
- Dev/start scripts updated to bind on `0.0.0.0:5000` for Replit's proxied preview

## Key Dependencies
```json
{
  "next": "^14.2.29",
  "react": "^19.2.1",
  "firebase": "^12.11.0",
  "@google/genai": "^1.17.0"
}
```
