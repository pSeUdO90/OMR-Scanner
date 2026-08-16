# Deploy OMR Software on a domain

This app is FastAPI + a built React UI. It needs a **Linux VPS** (or any Docker host) with ports 80 and 443. Shared Hostinger `*.hostingersite.com` / `public_html` **cannot** run it: there is no Python, no persistent OMR processing, and no `/api`.

Default login after deploy: **admin** / **admin**. Change the password from Profile immediately.

## 1. Point the domain at the server

In your DNS (GoDaddy, Namecheap, Cloudflare, Hostinger DNS, etc.):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` or `omr` | your VPS public IPv4 |

Examples:

- `omr.gyanavikash.edu` → A record to `203.0.113.10`
- `omr.yourdomain.com` → A record to the same IP

Wait until `ping omr.yourdomain.com` (or a DNS lookup) shows that IP. Open **80** and **443** in the firewall.

If the domain is on Cloudflare, set the record to **DNS only** (grey cloud) until HTTPS works. Orange-cloud proxy can block Let's Encrypt until TLS is already valid.


## 2. Install Docker on the VPS

Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Log out and back in. Clone this repository on the server.

## 3. Configure the domain and start

```bash
cp deploy/env.example .env
```

Edit `.env`:

```
OMR_SITE=omr.yourdomain.com
ACME_EMAIL=you@yourdomain.com
OMR_ALLOWED_HOSTS=omr.yourdomain.com,localhost
```

Use the hostname only (no `https://`). Caddy will request a Let's Encrypt certificate.

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Or:

```bash
docker compose --env-file .env up -d --build
```

Open `https://omr.yourdomain.com`. Sheets, SQLite, and uploads persist in Docker volumes `omr-data` and `omr-uploads`.

## 4. Check it

```bash
curl -sS https://omr.yourdomain.com/api/health
# {"ok":true,"service":"omr-reader"}
```

Logs:

```bash
docker compose logs -f app caddy
```

Update later:

```bash
git pull
docker compose up -d --build
```

## Local preview (no certificate)

`.env`:

```
OMR_SITE=:80
```

Then `docker compose up -d --build` and open http://SERVER_IP/ (port 80).

## What you need to buy / use

| Works | Does not work |
| --- | --- |
| Any VPS: Hostinger KVM, DigitalOcean, Lightsail, Hetzner, a school Linux server | Shared hosting, `public_html` FTP, Hostinger website builder |
| One domain or subdomain you control | A static-only `*.hostingersite.com` site |

RAM: 2 GB is enough. Disk: keep room for scanned OMR images.

## Without Docker

On Ubuntu, after `./scripts/cloud-agent-install.sh`:

```bash
cd frontend && npm run build
cd ../backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers
```

Put Caddy or nginx in front, proxying the domain to `127.0.0.1:8000`, with a 128 MB body size for scan uploads.
