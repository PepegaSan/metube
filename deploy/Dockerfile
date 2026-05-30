# PepegaSan MeTube image: UI + app from this repo, yt-dlp from PepegaSan/yt-dlp.
# Build context must be the metube repository root (parent of deploy/).
#
#   docker compose -f deploy/docker-compose.yml build

FROM node:lts-alpine AS builder

WORKDIR /metube
COPY ui ./
RUN corepack enable && corepack prepare pnpm --activate
RUN CI=true pnpm install && pnpm run build

FROM python:3.13-slim

WORKDIR /app

ARG YTDLP_REPO=https://github.com/PepegaSan/yt-dlp.git
ARG YTDLP_REF=master

# Bake git commits into /etc/metube (read by app/main.py /version).
COPY .git /tmp/repo-meta/metube/.git
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    mkdir -p /etc/metube && \
    (git -C /tmp/repo-meta/metube rev-parse --short HEAD 2>/dev/null || echo unknown) > /etc/metube/metube-commit && \
    git clone --depth 1 --branch "${YTDLP_REF}" "${YTDLP_REPO}" /tmp/repo-meta/yt-dlp && \
    (git -C /tmp/repo-meta/yt-dlp rev-parse --short HEAD 2>/dev/null || echo unknown) > /etc/metube/ytdlp-commit && \
    date -u +%Y-%m-%d > /etc/metube/build-date && \
    rm -rf /tmp/repo-meta/metube/.git && \
    apt-get purge -y --auto-remove git && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock docker-entrypoint.sh ./

RUN sed -i 's/\r$//g' docker-entrypoint.sh && \
    chmod +x docker-entrypoint.sh && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      ffmpeg \
      unzip \
      aria2 \
      coreutils \
      gosu \
      curl \
      tini \
      build-essential \
      git && \
    curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh && \
    UV_PROJECT_ENVIRONMENT=/usr/local uv sync --frozen --no-dev --compile-bytecode && \
    uv cache clean && \
    rm -f /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/uvw && \
    curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y && \
    apt-get purge -y --auto-remove build-essential && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir /.cache && chmod 777 /.cache

ARG TARGETARCH=amd64

RUN BGUTIL_TAG="$(curl -Ls -o /dev/null -w '%{url_effective}' https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest | sed 's#.*/tag/##')" && \
    case "$TARGETARCH" in \
      amd64) BGUTIL_ARCH="x86_64" ;; \
      arm64) BGUTIL_ARCH="aarch64" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    curl -L -o /usr/local/bin/bgutil-pot \
      "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/${BGUTIL_TAG}/bgutil-pot-linux-${BGUTIL_ARCH}" && \
    chmod +x /usr/local/bin/bgutil-pot && \
    PLUGIN_DIR="$(python3 -c 'import site; print(site.getsitepackages()[0])')" && \
    curl -L -o /tmp/bgutil-ytdlp-pot-provider-rs.zip \
      "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/${BGUTIL_TAG}/bgutil-ytdlp-pot-provider-rs.zip" && \
    unzip -q /tmp/bgutil-ytdlp-pot-provider-rs.zip -d "${PLUGIN_DIR}" && \
    rm /tmp/bgutil-ytdlp-pot-provider-rs.zip

# Install yt-dlp from PepegaSan fork (cloned above; re-clone if metadata step removed tree).
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    git clone --depth 1 --branch "${YTDLP_REF}" "${YTDLP_REPO}" /tmp/yt-dlp-src && \
    curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh && \
    UV_PROJECT_ENVIRONMENT=/usr/local uv pip install --python /usr/local/bin/python3 "/tmp/yt-dlp-src[default,curl-cffi,deno]" && \
    rm -rf /tmp/yt-dlp-src && \
    rm -f /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/uvw && \
    apt-get purge -y --auto-remove git && \
    rm -rf /var/lib/apt/lists/* && \
    yt-dlp --version

COPY app ./app
COPY --from=builder /metube/dist/metube ./ui/dist/metube

ENV PUID=1000
ENV PGID=1000
ENV UMASK=022
ENV DOWNLOAD_DIR=/downloads
ENV STATE_DIR=/downloads/.metube
ENV TEMP_DIR=/downloads
ENV PORT=8081
VOLUME /downloads
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS "http://localhost:${PORT}/" || exit 1

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "./docker-entrypoint.sh"]
