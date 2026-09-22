# syntax=docker/dockerfile:1

# ---- Node dependencies ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10.13.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Next.js build (standalone server) ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10.13.1
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- Python environment for scripts/process_point_cloud.py ----
# Same base image as the runtime so the venv's interpreter path and Python version match.
FROM node:22-bookworm-slim AS python
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
COPY scripts/requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

# ---- Runtime ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# python3 for the venv, plus the shared libraries Open3D and PyMeshLab load at import time
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 libgl1 libglu1-mesa libegl1 libopengl0 libglib2.0-0 libgomp1 \
       libx11-6 libxext6 libxrender1 libsm6 libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python /opt/venv /opt/venv
# Fail the image build if the 3D libraries can't load, rather than on the first upload
RUN /opt/venv/bin/python -c "import open3d, pymeshlab, trimesh, sklearn, skimage, scipy"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PYTHON_BIN=/opt/venv/bin/python \
    SCRIPTS_DIR=/app/scripts \
    UPLOADS_DIR=/app/uploads

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node scripts/process_point_cloud.py ./scripts/
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# The node user is uid 1000, the same as the default ubuntu user on EC2, so a bind-mounted ./uploads stays writable
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
