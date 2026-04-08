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
3. Update `.env.local` with your values:
   - `GEMINI_API_KEY` (server-only secret; do not expose as `NEXT_PUBLIC_*`)
   - `NEXT_PUBLIC_TEMPERATURE_ENDPOINT` (optional; defaults to internal LAN URL)
4. Run the app:
   `npm run dev`

## Environment and secrets

- `.env.local` is ignored by git; do not commit real credentials.
- `.env.example` only contains placeholder values and required variable names.
- The inventory and activity modules now persist locally in the browser (`localStorage`).
- For GitHub Actions deploys, configure repository secrets only for server-side keys such as `GEMINI_API_KEY`.

## Deploy en GitHub Pages (sin Vercel)

Este proyecto ya está preparado para desplegar en GitHub Pages:
- `next.config.mjs` exporta estático cuando corre en GitHub Actions.
- `basePath` se ajusta automáticamente al nombre del repo (`/centrologisticofrimaralV2`).
- `vercel.json` está deshabilitado para evitar despliegue accidental en Vercel.

### Pasos

1. Sube tus cambios a `main`:
   ```bash
   git add .
   git commit -m "Actualizar app"
   git push origin main
   ```

2. En GitHub entra a:
   **Settings → Pages**.

3. En **Build and deployment** selecciona:
   - **Source:** `GitHub Actions`.

4. Asegúrate de tener un workflow de deploy (por ejemplo `.github/workflows/deploy.yml`) que haga:
   - `npm ci`
   - `npm run build`
   - publique la carpeta `out/` a Pages.

5. (Opcional) Si usas funcionalidades server-side, agrega secrets en:
   **Settings → Secrets and variables → Actions**.

6. Espera que termine la acción y abre:
   `https://planilladecarga.github.io/centrologisticofrimaralV2/`
