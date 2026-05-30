"""Smart HLS clip fallback.

Some video hosters (StreamSB/StreamTV-style iframe players, javclan, …) actively
resist downloading by disguising their MPEG-TS segments as images: every segment
is served as ``…origin.image`` and carries a tiny decoy header (e.g. a 1x1 PNG)
in front of the real Transport-Stream payload. Browsers strip that prefix at
runtime, but ffmpeg refuses the playlist (``Video: png`` / ``not in
allowed_segment_extensions`` -> exit code 183/234) and therefore cannot clip
such streams via ``download_ranges``.

This module provides a robust fallback used when the normal yt-dlp/ffmpeg clip
path fails for an HLS stream:

  1. fetch the (media) playlist,
  2. select only the segments overlapping the requested time range,
  3. download each segment and strip any junk before the first aligned
     MPEG-TS sync byte (``0x47`` on a 188-byte grid),
  4. concatenate the cleaned payload and cut the precise sub-range locally with
     ffmpeg (no remote seeking, no ad/extension issues).

The prefix stripping is generic: for a normal ``.ts`` segment the sync byte is
already at offset 0, so nothing is removed.
"""

import logging
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
from typing import Callable, Optional

log = logging.getLogger('ytdl')

_DEFAULT_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
)

# How many leading bytes to scan when looking for the TS packet alignment.
_PREFIX_SCAN_LIMIT = 8192
_TS_PACKET = 188

# Rough mean segment size for javclan-style hosters (~0.9–1 MB per 10 s segment).
_EST_BYTES_PER_SEGMENT = 950_000
# Encoding phase is reported as the last fraction of the bar.
_ENCODE_FRACTION = 0.12


def _progress_payload(
    *,
    phase: str,
    fraction: float,
    msg: str,
    speed: float = 0.0,
    eta: Optional[float] = None,
) -> dict:
    """Build a status dict understood by ``Download.update_status`` / the UI."""
    fraction = max(0.0, min(1.0, fraction))
    total = 1_000_000
    downloaded = int(fraction * total)
    payload = {
        'status': 'downloading',
        'msg': msg,
        'downloaded_bytes': downloaded,
        'total_bytes_estimate': total,
    }
    if speed > 0:
        payload['speed'] = speed
    if eta is not None and eta >= 0:
        payload['eta'] = eta
    return payload


def is_hls_url(url: Optional[str]) -> bool:
    return bool(url) and bool(re.search(r'\.m3u8(\?|$)', url, re.IGNORECASE))


def _http_get(url: str, headers: Optional[dict], timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _strip_media_prefix(buf: bytes) -> bytes:
    """Drop any decoy/junk before the first 188-byte-aligned MPEG-TS sync run."""
    limit = min(len(buf), _PREFIX_SCAN_LIMIT)
    for i in range(limit):
        if (
            buf[i] == 0x47
            and i + 3 * _TS_PACKET < len(buf)
            and buf[i + _TS_PACKET] == 0x47
            and buf[i + 2 * _TS_PACKET] == 0x47
            and buf[i + 3 * _TS_PACKET] == 0x47
        ):
            return buf[i:]
    # No alignment found (not TS, e.g. fMP4) – return unchanged.
    return buf


def _parse_master_best_variant(text: str, base_url: str) -> Optional[str]:
    """Return the highest-bandwidth variant URL from a master playlist."""
    best_url: Optional[str] = None
    best_bw = -1
    pending_bw: Optional[int] = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith('#EXT-X-STREAM-INF'):
            m = re.search(r'BANDWIDTH=(\d+)', line)
            pending_bw = int(m.group(1)) if m else 0
        elif line and not line.startswith('#'):
            if pending_bw is not None:
                if pending_bw > best_bw:
                    best_bw = pending_bw
                    best_url = urllib.parse.urljoin(base_url, line)
                pending_bw = None
    return best_url


def _parse_media_segments(text: str, base_url: str):
    """Parse a media playlist into ``[(start_time, duration, url), …]``.

    Returns ``(segments, total_duration, encrypted)``.
    """
    segments = []
    t = 0.0
    dur: Optional[float] = None
    encrypted = False
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith('#EXT-X-KEY'):
            if 'METHOD=NONE' not in line.upper():
                encrypted = True
        elif line.startswith('#EXTINF:'):
            try:
                dur = float(line[len('#EXTINF:'):].split(',')[0])
            except ValueError:
                dur = 0.0
        elif line and not line.startswith('#'):
            segments.append((t, dur or 0.0, urllib.parse.urljoin(base_url, line)))
            t += dur or 0.0
            dur = None
    return segments, t, encrypted


def smart_clip_hls(
    url: str,
    headers: Optional[dict],
    start: float,
    end: float,
    raw_ts_path: str,
    out_path: str,
    progress: Optional[Callable[[dict], None]] = None,
    progress_base: float = 0.0,
    progress_scale: float = 1.0,
) -> tuple[bool, str]:
    """Download and clip an HLS stream that ffmpeg cannot handle directly.

    Returns ``(ok, message)``. On success the clip is written to *out_path*.
    """
    req_headers = dict(headers or {})
    req_headers.setdefault('User-Agent', _DEFAULT_UA)

    try:
        text = _http_get(url, req_headers).decode('utf-8', 'ignore')
    except Exception as exc:  # noqa: BLE001 - report any network/parse failure
        return False, f'could not fetch playlist: {exc}'

    if '#EXT-X-STREAM-INF' in text:
        variant = _parse_master_best_variant(text, url)
        if not variant:
            return False, 'master playlist without a usable variant'
        url = variant
        try:
            text = _http_get(url, req_headers).decode('utf-8', 'ignore')
        except Exception as exc:  # noqa: BLE001
            return False, f'could not fetch variant playlist: {exc}'

    segments, total, encrypted = _parse_media_segments(text, url)
    if encrypted:
        return False, 'encrypted HLS segments (EXT-X-KEY) are not supported'
    if not segments:
        return False, 'no segments found in playlist'

    end_eff = end if end != float('inf') else total
    if end_eff <= start:
        return False, f'invalid clip range {start}-{end_eff}'

    # A "full" download wants the whole stream: no seek/trim, just remux.
    is_full = start <= 0.01 and end_eff >= total - 0.5

    selected = [s for s in segments if (s[0] + s[1]) > start and s[0] < end_eff]
    if not selected:
        return False, 'no segments overlap the requested range'

    first_start = selected[0][0]
    total_segs = len(selected)
    log.info(
        'smart-clip: %d/%d segments cover %.1f-%.1fs (first seg @ %.2fs, full=%s)',
        total_segs, len(segments), start, end_eff, first_start, is_full,
    )

    est_total_bytes = max(total_segs * _EST_BYTES_PER_SEGMENT, 1)
    bytes_done = 0
    t0 = time.monotonic()

    def emit(frac: float, message: str, speed: float = 0.0, eta: Optional[float] = None) -> None:
        if progress is None:
            return
        overall = progress_base + progress_scale * max(0.0, min(1.0, frac))
        progress(_progress_payload(
            phase='smart-clip',
            fraction=overall,
            msg=message,
            speed=speed,
            eta=eta,
        ))

    emit(0.0, f'Lade Segmente 0/{total_segs}…')

    try:
        with open(raw_ts_path, 'wb') as out:
            for idx, (_st, _du, seg_url) in enumerate(selected):
                data = _http_get(seg_url, req_headers)
                stripped = _strip_media_prefix(data)
                out.write(stripped)
                bytes_done += len(stripped)
                elapsed = time.monotonic() - t0
                speed = bytes_done / max(elapsed, 0.25)
                seg_frac = (idx + 1) / total_segs
                download_frac = seg_frac * (1.0 - _ENCODE_FRACTION)
                remaining = max(est_total_bytes - bytes_done, 0)
                eta_dl = remaining / speed if speed > 0 else None
                emit(
                    download_frac,
                    f'Segmente {idx + 1}/{total_segs}',
                    speed=speed,
                    eta=eta_dl,
                )
    except Exception as exc:  # noqa: BLE001
        return False, f'segment download failed: {exc}'

    encode_base = 1.0 - _ENCODE_FRACTION
    clip_seconds = max(end_eff - start, 1.0) if not is_full else max(total, 1.0)
    encode_eta_guess = clip_seconds * 0.45
    emit(encode_base, 'Schneide / enkodiere…', eta=encode_eta_guess)

    if is_full:
        # No trimming required – a stream copy keeps it fast and lossless.
        copy_cmd = [
            'ffmpeg', '-y', '-loglevel', 'error',
            '-i', raw_ts_path, '-c', 'copy', '-movflags', '+faststart', out_path,
        ]
        proc = subprocess.run(copy_cmd, capture_output=True, text=True)
        if proc.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            return True, 'ok'
        log.warning('smart-clip: full remux -c copy failed (%s), re-encoding', (proc.stderr or '').strip()[:200])
        reencode_cmd = [
            'ffmpeg', '-y', '-loglevel', 'error', '-i', raw_ts_path,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
            '-c:a', 'aac', '-movflags', '+faststart', out_path,
        ]
        proc = subprocess.run(reencode_cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            return False, f'ffmpeg remux failed: {(proc.stderr or "").strip()[:300]}'
        emit(1.0, 'Fertig')
        return True, 'ok'

    # Precise clip: re-encode so the cut is frame-accurate and the first
    # seconds are clean. Stream-copy would start at the preceding keyframe and
    # show broken/white frames until the next one.
    seek = max(0.0, start - first_start)
    length = end_eff - start
    reencode_cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-ss', f'{seek:.3f}', '-i', raw_ts_path, '-t', f'{length:.3f}',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-c:a', 'aac', '-movflags', '+faststart', out_path,
    ]
    proc = subprocess.run(reencode_cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        return False, f'ffmpeg clip failed: {(proc.stderr or "").strip()[:300]}'

    emit(1.0, 'Fertig')
    return True, 'ok'
