# ByteBrief Deployment Guide

Production deployment guide for ByteBrief tech news backend.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Infrastructure Setup](#infrastructure-setup)
- [Deployment Options](#deployment-options)
- [Environment Variables](#environment-variables)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ByteBrief Backend                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   Express    │───▶│   MongoDB    │    │    Redis     │     │
│   │   Node.js    │    │   Atlas      │    │   (Cache)    │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │  Pipeline    │───▶│   OpenAI     │    │   Firebase   │     │
│   │  Scheduler   │    │   (AI)       │    │   (FCM)      │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Required Accounts

1. **MongoDB Atlas** - Free tier available
   - [Create account](https://cloud.mongodb.com)
   - Create M0 (free) cluster
   - Whitelist IP: `0.0.0.0/0` for cloud deployments

2. **Redis** (Choose one):
   - [Upstash](https://upstash.com) - Free tier, serverless
   - [Redis Labs](https://redis.com/try-free/) - 30MB free
   - Render built-in Redis

3. **OpenAI API**
   - [Get API key](https://platform.openai.com/api-keys)

4. **Firebase** (for push notifications)
   - [Firebase Console](https://console.firebase.google.com)
   - Create project → Project Settings → Service Accounts

5. **News APIs** (optional but recommended):
   - [NewsAPI](https://newsapi.org) - 100 requests/day free
   - [GNews](https://gnews.io) - 100 requests/day free

---

## Infrastructure Setup

### MongoDB Atlas Setup

```bash
# 1. Create cluster in MongoDB Atlas
# 2. Create database user
# 3. Get connection string:
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/bytebrief?retryWrites=true&w=majority
```

### Redis Setup (Upstash)

```bash
# 1. Create database in Upstash
# 2. Get Redis URL:
REDIS_URL=rediss://default:<password>@<region>.upstash.io:6379
```

### Firebase Setup

```bash
# 1. Create Firebase project
# 2. Enable Cloud Messaging
# 3. Generate service account key (JSON)
# 4. Extract values:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Deployment Options

### Option 1: Fly.io (Recommended)

**Pros:** Fast deployments, global edge network, generous free tier
**Cost:** Free tier includes 3 shared-cpu VMs

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Create app (first time only)
flyctl apps create bytebrief

# Set secrets
flyctl secrets set MONGODB_URI="mongodb+srv://..."
flyctl secrets set REDIS_URL="rediss://..."
flyctl secrets set JWT_SECRET="your-secret-key-min-32-chars"
flyctl secrets set OPENAI_API_KEY="sk-proj-..."
flyctl secrets set NEWSAPI_KEY="..."
flyctl secrets set GNEWS_API_KEY="..."
flyctl secrets set FIREBASE_PROJECT_ID="..."
flyctl secrets set FIREBASE_CLIENT_EMAIL="..."
flyctl secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."

# Deploy
flyctl deploy

# Check status
flyctl status
flyctl logs
```

### Option 2: Render

**Pros:** Simple setup, auto-scaling, native GitHub integration
**Cost:** Free tier available (spins down after inactivity)

```bash
# 1. Connect GitHub repo to Render
# 2. Create new Web Service
# 3. Select "Docker" runtime
# 4. Add environment variables in dashboard
# 5. Deploy from render.yaml blueprint
```

### Option 3: Docker (Self-hosted)

```bash
# Build image
docker build -t bytebrief:latest .

# Run with docker-compose
docker-compose up -d

# Or run standalone
docker run -d \
  --name bytebrief \
  -p 3000:3000 \
  -e MONGODB_URI="..." \
  -e REDIS_URL="..." \
  -e JWT_SECRET="..." \
  bytebrief:latest
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `REDIS_URL` | Redis connection URL | `redis://...` |
| `JWT_SECRET` | JWT signing key (32+ chars) | `your-secret-key` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | AI service (openai/anthropic) | `openai` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `NEWSAPI_KEY` | NewsAPI key | - |
| `GNEWS_API_KEY` | GNews API key | - |
| `FIREBASE_PROJECT_ID` | Firebase project | - |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account | - |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | - |
| `INGESTION_CRON` | Ingestion schedule | `0 */6 * * *` |
| `LOG_LEVEL` | Logging level | `info` |

---

## CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline (`.github/workflows/ci-cd.yml`) includes:

1. **Lint & Type Check** - ESLint + TypeScript
2. **Tests** - Jest with MongoDB/Redis services
3. **Build** - Docker image build
4. **Security Scan** - Trivy vulnerability scanner
5. **Deploy** - Auto-deploy to Fly.io on main branch

### Required GitHub Secrets

```bash
# For Fly.io deployment
FLY_API_TOKEN=your-fly-api-token

# For Render deployment (optional)
RENDER_DEPLOY_HOOK_URL=https://api.render.com/deploy/...

# For code coverage (optional)
CODECOV_TOKEN=your-codecov-token
```

### Getting Fly.io API Token

```bash
flyctl auth token
# Copy the token and add to GitHub Secrets as FLY_API_TOKEN
```

---

## Monitoring & Health Checks

### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /api/health` | Basic health (load balancer) | `200` or `503` |
| `GET /api/health/live` | Liveness probe (K8s) | `200` |
| `GET /api/health/ready` | Readiness probe (K8s) | `200` or `503` |
| `GET /api/health/detailed` | Full status with dependencies | JSON |
| `GET /api/health/metrics` | Prometheus metrics | Text |

### Example Health Check Response

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "1.0.0",
    "uptime": 3600,
    "environment": "production",
    "checks": {
      "database": { "status": "up", "latency": 5 },
      "cache": { "status": "up", "latency": 2 },
      "pipeline": { "status": "up" }
    }
  }
}
```

### Prometheus Metrics

```
bytebrief_uptime_seconds 3600
bytebrief_memory_heap_used_bytes 50000000
bytebrief_pipeline_runs_total 10
bytebrief_pipeline_successful_total 9
bytebrief_pipeline_failed_total 1
bytebrief_mongodb_connected 1
```

### Setting Up Monitoring (Optional)

**Fly.io Metrics:**
```bash
# Metrics are automatically collected
# View in Fly.io dashboard or Grafana Cloud
```

**External Monitoring:**
- [Uptime Robot](https://uptimerobot.com) - Free uptime monitoring
- [Better Stack](https://betterstack.com) - Logs + monitoring
- [Grafana Cloud](https://grafana.com/products/cloud/) - Free tier

---

## Troubleshooting

### Common Issues

**1. Database Connection Failed**
```bash
# Check MongoDB Atlas whitelist
# Ensure 0.0.0.0/0 is allowed for cloud deployments

# Test connection
mongosh "mongodb+srv://..."
```

**2. Redis Connection Failed**
```bash
# For Upstash, ensure using rediss:// (with TLS)
# Check firewall rules
```

**3. Pipeline Not Running**
```bash
# Check cron schedule (UTC timezone)
# Manually trigger pipeline:
curl -X POST https://your-app.fly.dev/api/admin/pipeline/run
```

**4. AI Summarization Failing**
```bash
# Check OpenAI API key
# Verify billing is enabled
# Check rate limits
```

### Useful Commands

```bash
# Fly.io
flyctl status              # Check app status
flyctl logs                # View logs
flyctl ssh console         # SSH into container
flyctl secrets list        # List secrets

# Docker
docker logs bytebrief-api  # View logs
docker exec -it bytebrief-api sh  # Shell access

# Health checks
curl https://your-app.fly.dev/api/health
curl https://your-app.fly.dev/api/health/detailed
```

### Log Levels

Set `LOG_LEVEL` environment variable:
- `error` - Errors only
- `warn` - Warnings and errors
- `info` - General info (default)
- `debug` - Detailed debugging

---

## Scaling

### Fly.io Scaling

```bash
# Scale horizontally
flyctl scale count 2

# Scale vertically
flyctl scale vm shared-cpu-2x

# Auto-scaling is configured in fly.toml
```

### Performance Tips

1. **Use Redis caching** for frequent queries
2. **Configure connection pooling** in MongoDB
3. **Enable compression** (already configured)
4. **Use CDN** for static assets

---

## Security Checklist

- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Enable HTTPS (automatic on Fly.io/Render)
- [ ] Restrict MongoDB Atlas IP whitelist in production
- [ ] Rotate API keys regularly
- [ ] Enable rate limiting (already configured)
- [ ] Keep dependencies updated
- [ ] Review Trivy security scans

---

## Support

- **Issues:** [GitHub Issues](https://github.com/Arjun-Walia/ByteBrief/issues)
- **Fly.io Docs:** [fly.io/docs](https://fly.io/docs)
- **Render Docs:** [render.com/docs](https://render.com/docs)
