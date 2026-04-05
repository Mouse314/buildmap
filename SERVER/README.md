# Server

Backend part of the project.

This directory is intentionally kept in the monorepo and is pushed to GitHub together with the CLIENT app.

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

### Endpoints

- `GET /health`
- `GET /api/plans/manifest`
- `GET /api/plans/:buildId/:floorId/rooms`
- `GET /api/plans/:buildId/:floorId/rooms.csv`
- `GET /api/plans/:buildId/:floorId/graph`
- `POST /api/admin/rooms/update`

`buildId` and `floorId` are sanitized server-side to avoid path traversal.

### IDs (`buildId`, `floorId`)

- IDs are taken from `CLIENT/public/room_data_manifest.json`.
- They must match folder names in `CLIENT/public/<buildId>/<floorId>/`.
- Example IDs from current dataset: `build14`, `build16`, `floor1`, `floor2`, ...
