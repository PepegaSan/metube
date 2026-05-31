# Docker setup (PepegaSan fork)

Runs MeTube with your forked **yt-dlp** baked in at build time, extension-friendly
`ALLOW_YTDL_OPTIONS_OVERRIDES`, and Git/build metadata in the footer.

## Quick start

**Requires:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```powershell
git clone https://github.com/PepegaSan/metube.git
cd metube
.\deploy\start-metube.ps1
```

Or manually:

```powershell
cd metube
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

- Web UI: **http://localhost:8081**
- Downloads: `metube/downloads/` (created automatically)

Stop:

```powershell
docker compose -f deploy/docker-compose.yml down
```

Logs:

```powershell
docker compose -f deploy/docker-compose.yml logs -f metube
```

## Local yt-dlp checkout (optional)

The image clones **https://github.com/PepegaSan/yt-dlp** during build. To pin another
branch or use a sibling folder, pass build args:

```powershell
docker compose -f deploy/docker-compose.yml build --build-arg YTDLP_REF=my-branch
```

## Legacy layout (`metube-dev/` with sibling clones)

If you still use a parent folder with `metube/` and `yt-dlp/` side by side, keep using
the Dockerfile in the parent `metube-dev` directory (not in this repo). The `deploy/`
files here are intended for a **single-repo** clone of `PepegaSan/metube`.

## Chrome extension

Load `extension/` unpacked from this repo (`chrome://extensions`). Reload after updates.
Sniffed streams need `ALLOW_YTDL_OPTIONS_OVERRIDES=true` (set in compose above).

Clearing completed downloads can also delete files from disk (`DELETE_FILE_ON_TRASHCAN=true`,
toggle in the UI under **Completed**).
