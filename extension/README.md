# MeTube Clip Sender (PepegaSan)

Chrome extension (Manifest V3) in this repo (`extension/`) — mark clip times on **any page with a `<video>` element** and send them to your MeTube instance.

## Requirements

- This MeTube fork (clips + batch clips + deep-link import)
- `CORS_ALLOWED_ORIGINS=*` so the extension can `POST` to `/add` and `/add-batch`

## Install (unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`extension/` in the metube repo)
4. Open **Extension options** → set your MeTube URL (default `http://localhost:8081/`)

## Usage

1. Open a page with a video player.
2. Click the extension icon.
3. **Start setzen** at the in-point (the popup may close while you scrub the video — reopen it), then **Ende setzen** at the out-point. The saved start is kept until you finish or click **Start verwerfen**.
4. Either:
   - **In MeTube öffnen** — opens MeTube with URL and times prefilled, or
   - **In Queue (einzeln)** / **In Queue (merged)** — sends directly to the API.

Clip times are stored per page URL in the session until you remove them or close the browser.

## How times map in MeTube

| Clips marked | MeTube UI |
| --- | --- |
| 1 range | **Clip start** / **Clip end** |
| 2+ ranges | **Batch clips** table |

## Deep link format (“In MeTube öffnen”)

```
http://localhost:8081/?url=<encoded>&clips=<json>
```

Optional: `&merge=1` hints at a merged batch download in the UI.
