# Server

Backend part of the project.

This directory is intentionally kept in the monorepo and is pushed to GitHub together with the CLIENT app.

## Schedule Parser

Parser scripts are stored in `SERVER/schedule_parser`.

### What It Does

- Downloads current schedule PDF files from VyatSU into `SERVER/schedule_parser/schedule`.
- Clears the PDF folder before each download run to keep it clean.
- Parses downloaded PDFs into CSV files in `SERVER/schedule_parser/parsed_schedule`.
- Keeps old CSV files (no automatic cleanup for parsed CSV).

### First-Time Setup

PowerShell (from repository root):

```powershell
Set-Location .\SERVER\schedule_parser
.\run_parser.ps1
```

`run_parser.ps1` creates local venv (`SERVER/schedule_parser/.venv`) if needed and runs parser.

### Main Run Commands

PowerShell (from `SERVER/schedule_parser`):

```powershell
# Parse only existing local PDFs (default mode, no download)
.\run_parser.ps1

# Full pipeline with download + parse (explicit mode)
.\run_parser.ps1 -Download

# Full pipeline for explicit date
.\run_parser.ps1 -Download -Date 2026-04-16

# Direct parser call (parse only existing local PDFs)
.\.venv\Scripts\python.exe .\parser.py --skip-download --pdf-dir .\schedule
```

### Useful Options

- `--date YYYY-MM-DD` or `--date DD.MM.YYYY` - target date for selecting schedule PDFs.
- `--pdf-dir <path>` - directory where PDFs are downloaded/read from.
- `--output-dir <path>` - directory root where CSV files are saved.
- `--skip-download` - do not download PDFs, parse only local files in `--pdf-dir`.
- `--min-delay` and `--max-delay` - delay range between HTTP requests.

### Failure Behavior

- If download fails for all files (`downloaded = 0` and `failed > 0`), parsing is not started.
- If at least one PDF is downloaded, parsing is executed for downloaded files.

## Plans API

This server exposes floor plan data so the client can load a selected building and floor from backend endpoints.

### Run

```bash
cd SERVER
npm install
npm run dev
```

By default, server starts on `http://localhost:3001` and serves files from `../CLIENT/public`.

### Environment variables

- `PORT` - server port (default: `3001`)
- `HOST` - bind host (default: `0.0.0.0`)
- `PLANS_PUBLIC_DIR` - optional custom path to public plans directory
- `SCHEDULE_PARSED_DIR` - optional path to parsed schedule folder (default: `SERVER/schedule_parser/parsed_schedule`)

### Endpoints

- `GET /health`
- `GET /api/plans/manifest`
- `GET /api/plans/:buildId/:floorId/rooms`
- `GET /api/plans/:buildId/:floorId/rooms.csv`
- `GET /api/plans/:buildId/:floorId/graph`
- `GET /api/schedule/manifest`
- `GET /api/schedule/file?date=DD.MM.YY&name=<group.csv>`
- `GET /api/admin/health`
- `POST /api/admin/rooms/update`
- `POST /api/admin/graphics/presets`

`buildId` and `floorId` are sanitized server-side to avoid path traversal.

### IDs (`buildId`, `floorId`)

- IDs are taken from `CLIENT/public/room_data_manifest.json`.
- They must match folder names in `CLIENT/public/<buildId>/<floorId>/`.
- Example IDs from current dataset: `build14`, `build16`, `floor1`, `floor2`, ...

### Persistent room edits

`POST /api/admin/rooms/update` no longer mutates `room_data.json`.

Instead, it saves admin edits into build-level file:

- `CLIENT/public/<buildId>/room_overrides.json`

Missing `room_overrides.json` files are auto-created on server startup for discovered builds.

Graphic presets are stored in:

- `CLIENT/public/graphics_presets.json`

`graphics_presets.json` is also auto-created on server startup if it does not exist.

This allows re-generating `room_data.json` from CSV without losing manual admin corrections.

Current `room_overrides.json` format:

```json
{
	"version": 1,
	"buildId": "build14",
	"updatedAt": "2026-04-09T10:20:30.000Z",
	"floors": {
		"floor1": {
			"room-key": {
				"roomNo": "101",
				"category": "Кафедра",
				"description": "Текст",
				"areClosed": false,
				"areaM2": 23.4,
				"build": null,
				"floor": null,
				"updatedAt": "2026-04-09T10:20:30.000Z"
			}
		}
	}
}
```
