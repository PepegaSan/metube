# PepegaSan fork — custom changes

Upstream: [alexta69/metube](https://github.com/alexta69/metube)  
This fork: [PepegaSan/metube](https://github.com/PepegaSan/metube)

This file lists **commits and changes that exist only in this fork** (not in upstream).  
When you add your own work: append a row to the changelog and note the files you touched.

## Where downloads and state are stored

MeTube does **not** delete finished media for you. After a clip download completes, the files stay on disk until you remove them yourself.

| What | Typical location (Docker) |
| --- | --- |
| **Downloaded video/audio files** (including clip/batch/merged jobs) | Host folder mapped to `DOWNLOAD_DIR` — e.g. `downloads/` next to your `docker-compose.yml` → on Windows often `...\metube-dev\downloads`. Inside the container this is `/downloads`. |
| **Queue / done list / MeTube state** (not the media files) | `DOWNLOAD_DIR/.metube` (e.g. `downloads/.metube` on the host). Clearing entries in the MeTube UI removes them from the queue list but **does not** delete files already written to `downloads/`. |
| **Optional subfolder** | If you pick a custom folder in the web UI (Advanced Options), files go under that directory under `DOWNLOAD_DIR`. |

Clip-related jobs often get an automatic filename prefix such as `clip_1:30-2:00_` or `clipbatch_…` so you can tell them apart from full-video downloads.

The browser extension only stores **time ranges** in Chrome (`chrome.storage.local`) until you send a job to MeTube; it does not store downloaded files.

## Changelog

| Date | Commit | Summary |
| --- | --- | --- |
| 2026-05-22 | [`cfd4d3a`](https://github.com/PepegaSan/metube/commit/cfd4d3a) | **Multiple time clips per video URL:** per-clip `queue_key`; automatic filename prefix `clip_<start>-<end>`; strip `&t=` from the URL when clip fields are set; UI clear/delete uses `queue_key` (fix when clear failed with several clips); tests `test_clip_queue_keys.py`; README time-clips section. |
| 2026-05-22 | [`1e3e502`](https://github.com/PepegaSan/metube/commit/1e3e502) | Add this `FORK.md` and link it from `README.md`. |
| 2026-05-22 | [`52c6ff5`](https://github.com/PepegaSan/metube/commit/52c6ff5) | **Batch clips:** multiple start/end rows for one URL; **Download each clip** or **Download merged** (ffmpeg concat); API `POST /add-batch`; UI table under Advanced Options. |
| 2026-05-22 | [`554f402`](https://github.com/PepegaSan/metube/commit/554f402) | **Extension deep link:** `?url=…&clips=…` prefills URL, single-clip fields, or batch table. |
| 2026-05-22 | [`93fcdf8`](https://github.com/PepegaSan/metube/commit/93fcdf8) | **Clip browser extension** in `extension/` (MV3): generic `<video>`, open MeTube or queue via API; same repo as MeTube. |

### Files touched

**`cfd4d3a`:** `app/ytdl.py`, `app/main.py`, `app/tests/test_clip_queue_keys.py`, `app/tests/test_download_queue.py`, `ui/src/app/services/downloads.service.ts`, `ui/src/app/interfaces/download.ts`, `ui/src/app/app.ts`, `ui/src/app/app.html`, `ui/src/app/services/downloads.service.spec.ts`, `README.md`

**`1e3e502`:** `FORK.md`, `README.md`

**Batch clips (`52c6ff5`):** `app/ytdl.py`, `app/main.py`, `app/tests/test_batch_clips.py`, `ui/src/app/app.ts`, `ui/src/app/app.html`, `ui/src/app/services/downloads.service.ts`, `FORK.md`

**Extension (`extension/`):** `extension/*`, `README.md`
