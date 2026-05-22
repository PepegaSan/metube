# MeTube Clip Sender (PepegaSan)

Chrome extension (Manifest V3) in this repo (`extension/`) — mark clip times on **any page with a `<video>` element** and send them to your MeTube instance via the API.

## Requirements

- This MeTube fork (clips + batch clips)
- `CORS_ALLOWED_ORIGINS=*` so the extension can `POST` to `/add` and `/add-batch`

## Install (unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`extension/` in the metube repo)
4. Open **Extension options** → set your MeTube URL (default `http://localhost:8081/`)

## Usage

1. Open a page with a video player and reload the tab once after installing/updating the extension.
2. Use the **floating bar** at the bottom-right of the page (**Start** / **Ende**).
3. Open the extension popup → **In Queue (einzeln)** or **In Queue (merged)**.

Clip times are stored per page URL in the session until you remove them or close the browser.
