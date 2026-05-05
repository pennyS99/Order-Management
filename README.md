# OM Automation (Order Management Hub)

Next.js app for **PO PDF extraction** and **CSV-driven shipment consolidation + routing**.

## What’s inside

- **Planner** (`/planner`): upload CSV inputs and generate routed shipments
- **Saved plans** (`/planner/saved`): persist consolidation results under `data/saved-plans/`
- **Shipments** (`/shipments`): browse shipment stops across saved plans (and map view at `/shipments/map`)
- **PO Extract** (`/extract`): upload PO PDFs and extract line items
- **Configure** (`/configure`): manage masters/settings used by the app

## Prerequisites (Windows)

- **Node.js (LTS)** and **npm**
- **Git**

## Setup (PowerShell)

Install dependencies:

```powershell
npm install
```

Create your local environment file:

- This repo already includes a `.env` with:

```dotenv
DATABASE_URL="file:./dev.db"
```

Start the dev server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```powershell
npm run dev
npm run build
npm run start
npm run lint
npm run test
```

## Project structure

- `src/app/`: Next.js App Router routes (pages live here)
- `src/components/`: UI components (Planner, Shipments, PO Extract, enterprise shell, etc.)
- `src/lib/`: core logic (storage, consolidation helpers, saved plans store)
- `data/`: local JSON-backed storage (e.g. `data/saved-plans/`)
- `public/`: static assets

## Dependencies (high-level)

The source of truth for dependencies is:

- `package.json` (direct deps)
- `package-lock.json` (resolved versions)

Notable runtime dependencies:

- **PDF + OCR**: `pdf-parse`, `tesseract.js` (+ language data)
- **Spreadsheets**: `xlsx`, `xlsx-js-style`
- **Maps**: `leaflet`, `react-leaflet`
- **Images / native modules**: `sharp`, `@napi-rs/canvas`

## Troubleshooting (Windows)

### `npm install` fails on native deps (`sharp`, `@napi-rs/canvas`)

Try a clean reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

Also make sure you’re on **Node.js LTS**.

### Port 3000 is already in use

Run on a different port:

```powershell
$env:PORT=3001
npm run dev
```
