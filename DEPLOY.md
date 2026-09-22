# Deploying to AWS EC2 with Docker

The app runs as two containers:

- **app**: the Next.js server plus the Python/Open3D/PyMeshLab environment that `/api/process` calls.
- **caddy**: a reverse proxy on ports 80 and 443. It gets HTTPS certificates automatically once a domain points at the instance.

Uploaded scans and generated GLB files live in `./uploads` on the host.

## What you need in AWS

| Item | Recommendation |
| --- | --- |
| AMI | Ubuntu Server 24.04 LTS, **x86_64** (the Python 3D wheels are only verified here on x86_64, not ARM/Graviton) |
| Instance type | `m7i.large` or `m6i.large` (2 vCPU, 8 GB RAM). `t3.large` is fine for light use but throttles on long CPU-heavy runs. Don't go below 4 GB RAM: mesh reconstruction and the Docker build both need the memory. |
| Storage | 30 GB gp3 root volume. The image is about 3 to 4 GB, and uploads are capped at 2 GB by the cleanup script. |
| Security group | Inbound 22 (SSH) from your IP only, 80 and 443 from anywhere |
| Elastic IP | Associate one so the address survives restarts |
| DNS (optional) | An `A` record for your domain pointing at the Elastic IP, for HTTPS |

No IAM role or other AWS services are needed.

## First deploy

SSH in as `ubuntu`, then:

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit   # log out and back in so the docker group applies

# App
git clone <your repo url> ~/3d-mesh-creator
cd ~/3d-mesh-creator
mkdir -p uploads            # must exist and be owned by ubuntu (uid 1000) before the first start
cp .env.example .env        # set DOMAIN to your hostname, or keep :80 to test by IP
docker compose up -d --build
```

The first build takes around 10 minutes, mostly for the Python wheels. Check it:

```bash
docker compose ps                        # app should show "healthy"
curl http://localhost/api/health         # {"status":"ok","pythonAvailable":true}
docker compose logs -f app               # processing logs
```

## Clean up old uploads

`cleanup-uploads.sh` removes files older than 7 days and keeps `uploads/` under 2 GB. Schedule it daily:

```bash
chmod +x ~/3d-mesh-creator/cleanup-uploads.sh
(crontab -l 2>/dev/null; echo "0 3 * * * $HOME/3d-mesh-creator/cleanup-uploads.sh") | crontab -
```

It logs to `~/logs/cleanup.log`. Override `UPLOADS_DIR` or `LOG_FILE` if you cloned somewhere else.

## Updating

```bash
cd ~/3d-mesh-creator
git pull
docker compose up -d --build
```

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DOMAIN` | `.env` | `:80` | Hostname Caddy serves. A real hostname turns on HTTPS. |
| `MAX_UPLOAD_MB` | `.env` | `500` | Upload limit, enforced by Caddy and `/api/upload` |
| `UPLOADS_DIR` | image | `/app/uploads` | Where scans and GLBs are stored |
| `PYTHON_BIN` | image | `/opt/venv/bin/python` | Interpreter used for `scripts/process_point_cloud.py` |

## Running the image without Compose

```bash
docker build -t mesh-creator .
docker run -d -p 3000:3000 -v "$PWD/uploads:/app/uploads" mesh-creator
```
