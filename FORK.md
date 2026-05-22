# PepegaSan Fork — eigene Änderungen & Sync

Upstream: [alexta69/metube](https://github.com/alexta69/metube)  
Dieser Fork: [PepegaSan/metube](https://github.com/PepegaSan/metube)

Diese Datei ist nur für **deine Fork-Commits** gedacht. Bei jedem eigenen Change: **neue Zeile in der Changelog-Tabelle** + kurz welche Dateien.

---

## Changelog (nur dieser Fork)

| Datum | Commit | Was wurde geändert? |
| --- | --- | --- |
| 2026-05-22 | [`cfd4d3a`](https://github.com/PepegaSan/metube/commit/cfd4d3a) | Mehrere **Zeit-Clips pro gleicher Video-URL**: eigener `queue_key` pro Start/Ende; Dateinamen-Prefix `clip_<start>-<end>`; `&t=` in der URL wird ignoriert, wenn Clip-Felder gesetzt sind; **Clear/Delete** in der UI nutzt `queue_key` (Fix wenn Clear nicht ging); Tests `test_clip_queue_keys.py`; README Abschnitt Time clips. |

**Dateien (cfd4d3a):** `app/ytdl.py`, `app/main.py`, `app/tests/test_clip_queue_keys.py`, `app/tests/test_download_queue.py`, `ui/src/app/services/downloads.service.ts`, `ui/src/app/interfaces/download.ts`, `ui/src/app/app.ts`, `ui/src/app/app.html`, `ui/src/app/services/downloads.service.spec.ts`, `README.md`

---

## Sync mit dem Original (upstream) — gehen meine Änderungen verloren?

**Nein**, wenn du normal synchronisierst. Deine Commits bleiben in der History deines Forks. Upstream liefert nur **neue** Commits vom Originalautor; du holst sie rein und verbindest sie mit deinen.

### Empfohlen: Merge (am einfachsten)

```powershell
cd pfad\zu\metube
git remote add upstream https://github.com/alexta69/metube.git
git fetch upstream
git checkout master
git merge upstream/master
```

- Wenn **keine Konflikte**: `git push origin master`
- Wenn **Konflikte**: Git markiert Dateien (oft `app/ytdl.py`, UI). Inhalt anpassen, `<<<<<<<` entfernen, `git add .`, `git commit`, `git push`

### Alternative: Rebase (linearere History)

```powershell
git fetch upstream
git rebase upstream/master
git push origin master
```

Deine Änderungen bleiben, aber **Commit-Hashes können sich ändern**. Nur `--force` pushen, wenn du weißt, dass niemand sonst deinen `master` nutzt.

### GitHub-Button „Sync fork“

Entspricht meist einem **Merge** von `alexta69/metube` → dein `master`. Deine Commits bleiben; bei Konflikten musst du lokal oder in der Web-UI lösen.

### Was du vermeiden solltest

| Aktion | Risiko |
| --- | --- |
| Fork **löschen** und neu forken | Alte Commit-History auf GitHub weg (lokal evtl. noch da) |
| `git push --force` auf `master` | Überschreibt Remote-History |
| Bei Konflikten „theirs“ für alles nehmen | Kann **deine** Fork-Logik überschreiben |

### Nach dem Sync

- Docker-Image neu bauen: `docker compose build` (in deinem `metube-dev`-Setup)
- Prüfen: mehrere Clips, Clear completed — ob deine Fork-Features noch funktionieren

---

## Lokales Setup (optional, außerhalb dieses Repos)

Unter `metube-dev/` (Geschwisterordner): `docker-compose.yml` + `Dockerfile` baut **diesen Fork** mit optionalem **yt-dlp**-Fork. Siehe `README-SETUP.md` dort — nicht Teil von `PepegaSan/metube` auf GitHub.
