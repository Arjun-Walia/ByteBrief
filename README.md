# ByteBrief

A minimalist tech news backend that delivers curated, high-signal technology updates with AI-generated summaries and daily push notifications. Built for developers and tech enthusiasts who want essential tech news without the noise.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Automation Pipeline](#automation-pipeline)
- [Deployment](#deployment)
- [Future Improvements](#future-improvements)

## Project Overview

ByteBrief is a backend service that powers a mobile application for tech news consumption. The system automatically ingests articles from multiple tech news sources, deduplicates and clusters related stories, generates concise AI summaries, ranks articles by relevance, and delivers daily notifications with top stories.

The primary goals are:

- **Reduce information overload** by surfacing only high-value tech news
- **Save reading time** through AI-generated summaries
- **Ensure relevance** via smart ranking algorithms
- **Enable passive consumption** with daily push notifications

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ByteBrief Backend                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   Ingestion     │───▶│  Deduplication  │───▶│  Summarization  │         │
│  │   Service       │    │  & Clustering   │    │  Pipeline       │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│          │                                              │                   │
│          ▼                                              ▼                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   News Sources  │    │    MongoDB      │◀───│   Ranking       │         │
│  │   (RSS/APIs)    │    │    Database     │    │   System        │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                │                        │                   │
│                                ▼                        ▼                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   Redis Cache   │◀───│   REST API      │───▶│  Notification   │         │
│  │   Layer         │    │   Server        │    │  Service (FCM)  │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                │                                            │
│                                ▼                                            │
│                        ┌─────────────────┐                                  │
│                        │  Mobile App     │                                  │
│                        │  (Consumer)     │                                  │
│                        └─────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

| Component | Responsibility |
|-----------|----------------|
| **Ingestion Service** | Fetches articles from RSS feeds and news APIs on a scheduled basis |
| **Deduplication & Clustering** | Identifies duplicate articles and groups related stories |
| **Summarization Pipeline** | Generates concise AI summaries using OpenAI or Claude |
| **Ranking System** | Scores articles based on recency, source authority, and engagement signals |
| **Notification Service** | Sends daily push notifications via Firebase Cloud Messaging |
| **REST API Server** | Exposes endpoints for the mobile application |
| **Redis Cache** | Caches frequently accessed data to reduce database load |

## Features

- **Multi-source News Ingestion**: Aggregates articles from configurable RSS feeds and news APIs
- **Article Deduplication**: Prevents duplicate stories using content fingerprinting
- **Story Clustering**: Groups related articles covering the same topic
- **AI Summarization**: Generates 2-3 sentence summaries for quick consumption
- **Smart Ranking**: Surfaces top stories using a weighted scoring algorithm
- **Push Notifications**: Delivers daily digest via Firebase Cloud Messaging
- **Redis Caching**: Improves response times for high-traffic endpoints
- **Category Filtering**: Organizes articles by tech categories
- **Bookmark Support**: Allows users to save articles for later reading
- **Read History Tracking**: Tracks user reading progress

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime environment |
| **TypeScript** | Type-safe JavaScript |
| **Express** | HTTP server framework |
| **MongoDB** | Primary database for articles and users |
| **Redis** | Caching layer and job queue |
| **Firebase Cloud Messaging** | Push notification delivery |
| **OpenAI / Claude** | AI-powered article summarization |
| **node-cron** | Scheduled task execution |
| **Mongoose** | MongoDB object modeling |
| **ioredis** | Redis client |

## Project Structure

```
bytebrief/
├── src/
│   ├── config/
│   │   ├── database.ts        # MongoDB connection configuration
│   │   ├── redis.ts           # Redis client configuration
│   │   ├── firebase.ts        # FCM initialization
│   │   └── env.ts             # Environment variable validation
│   │
│   ├── models/
│   │   ├── Article.ts         # Article schema
│   │   ├── User.ts            # User schema
│   │   ├── Category.ts        # Category schema
│   │   └── Notification.ts    # Notification log schema
│   │
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── feedParser.ts  # RSS feed parser
│   │   │   ├── sources.ts     # News source definitions
│   │   │   └── index.ts       # Ingestion orchestrator
│   │   │
│   │   ├── processing/
│   │   │   ├── deduplication.ts   # Duplicate detection
│   │   │   ├── clustering.ts      # Story clustering
│   │   │   └── summarization.ts   # AI summary generation
│   │   │
│   │   ├── ranking/
│   │   │   └── ranker.ts      # Article ranking algorithm
│   │   │
│   │   ├── notification/
│   │   │   └── pushService.ts # FCM notification sender
│   │   │
│   │   └── cache/
│   │       └── cacheService.ts # Redis caching utilities
│   │
│   ├── controllers/
│   │   ├── articleController.ts   # Article endpoints
│   │   ├── categoryController.ts  # Category endpoints
│   │   ├── userController.ts      # User endpoints
│   │   └── notificationController.ts # Notification endpoints
│   │
│   ├── routes/
│   │   ├── articles.ts        # Article routes
│   │   ├── categories.ts      # Category routes
│   │   ├── users.ts           # User routes
│   │   └── index.ts           # Route aggregator
│   │
│   ├── middleware/
│   │   ├── auth.ts            # Authentication middleware
│   │   ├── rateLimit.ts       # Rate limiting
│   │   └── errorHandler.ts    # Global error handler
│   │
│   ├── jobs/
│   │   ├── scheduler.ts       # Cron job definitions
│   │   ├── ingestJob.ts       # News ingestion job
│   │   ├── summarizeJob.ts    # Summarization job
│   │   ├── rankJob.ts         # Ranking job
│   │   └── notifyJob.ts       # Notification job
│   │
│   ├── utils/
│   │   ├── logger.ts          # Logging utility
│   │   ├── fingerprint.ts     # Content fingerprinting
│   │   └── helpers.ts         # General utilities
│   │
│   ├── types/
│   │   └── index.ts           # TypeScript type definitions
│   │
│   └── app.ts                 # Express app entry point
│
├── stitch/                    # UI component references
│   ├── article_detail_view/
│   ├── category_tabs/
│   └── home_dashboard/
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
├── docker-compose.yml
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- MongoDB 6+
- Redis 7+
- Firebase project with Cloud Messaging enabled
- OpenAI or Anthropic API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/bytebrief.git
   cd bytebrief
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB and Redis**

   Using Docker:

   ```bash
   docker-compose up -d mongodb redis
   ```

   Or ensure local instances are running.

5. **Run database migrations/seeds (if applicable)**

   ```bash
   npm run seed
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

   The server will start at `http://localhost:3000`.

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/bytebrief` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for JWT signing | `your-secret-key` |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Claude) | `sk-ant-...` |
| `AI_PROVIDER` | AI provider selection | `openai` or `anthropic` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `bytebrief-12345` |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key | `-----BEGIN PRIVATE KEY-----...` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | `firebase-adminsdk@...` |
| `CACHE_TTL` | Default cache TTL in seconds | `3600` |
| `INGESTION_CRON` | Cron schedule for ingestion | `0 */2 * * *` |
| `NOTIFICATION_CRON` | Cron schedule for notifications | `0 8 * * *` |

## API Endpoints

### Articles

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/articles` | Get paginated articles |
| `GET` | `/api/articles/top` | Get today's top ranked articles |
| `GET` | `/api/articles/:id` | Get article by ID |
| `GET` | `/api/articles/category/:slug` | Get articles by category |
| `GET` | `/api/articles/search` | Search articles |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/categories` | Get all categories |
| `GET` | `/api/categories/:slug` | Get category details |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users/register` | Register new user |
| `POST` | `/api/users/login` | User login |
| `GET` | `/api/users/profile` | Get user profile |
| `PUT` | `/api/users/preferences` | Update notification preferences |
| `GET` | `/api/users/bookmarks` | Get user bookmarks |
| `POST` | `/api/users/bookmarks/:articleId` | Add bookmark |
| `DELETE` | `/api/users/bookmarks/:articleId` | Remove bookmark |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/notifications/register` | Register device token |
| `DELETE` | `/api/notifications/unregister` | Unregister device token |

### Example Response

```json
GET /api/articles/top

{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "65f1a2b3c4d5e6f7g8h9i0j1",
        "title": "OpenAI Releases GPT-5",
        "summary": "OpenAI announced GPT-5 with significant improvements in reasoning and multimodal capabilities. The model shows 40% better performance on complex tasks.",
        "source": "TechCrunch",
        "sourceUrl": "https://techcrunch.com/...",
        "category": "ai",
        "publishedAt": "2026-03-11T08:00:00Z",
        "score": 95.4,
        "readTime": 4
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42
    }
  }
}
```

## Automation Pipeline

The backend runs several scheduled jobs to maintain fresh content:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Daily Pipeline Schedule                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Every 2 hours:                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Ingest     │───▶│  Deduplicate │───▶│  Summarize   │       │
│  │   Articles   │    │  & Cluster   │    │  New Items   │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│  Every 6 hours:                                                  │
│  ┌──────────────┐                                                │
│  │   Recompute  │                                                │
│  │   Rankings   │                                                │
│  └──────────────┘                                                │
│                                                                  │
│  Daily at 8:00 AM (user timezone):                               │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │   Select Top │───▶│   Send Push  │                           │
│  │   Stories    │    │   Notifications │                        │
│  └──────────────┘    └──────────────┘                           │
│                                                                  │
│  Daily at 2:00 AM:                                               │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │   Clear Old  │    │   Warm       │                           │
│  │   Cache      │    │   Cache      │                           │
│  └──────────────┘    └──────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Job Descriptions

| Job | Schedule | Description |
|-----|----------|-------------|
| **Ingestion** | Every 2 hours | Fetches new articles from all configured sources |
| **Deduplication** | Post-ingestion | Removes duplicates using content fingerprinting |
| **Summarization** | Post-deduplication | Generates AI summaries for new articles |
| **Ranking** | Every 6 hours | Recalculates article scores |
| **Notification** | Daily 8:00 AM | Sends daily digest to subscribed users |
| **Cache Cleanup** | Daily 2:00 AM | Clears stale cache entries |
| **Cache Warming** | Daily 2:00 AM | Pre-populates cache with likely requests |

### Manual Job Triggers

Jobs can be triggered manually via admin endpoints:

```bash
# Trigger ingestion
curl -X POST http://localhost:3000/api/admin/jobs/ingest \
  -H "Authorization: Bearer <admin_token>"

# Trigger ranking recalculation
curl -X POST http://localhost:3000/api/admin/jobs/rank \
  -H "Authorization: Bearer <admin_token>"
```

## Deployment

### Docker Deployment

1. **Build the Docker image**

   ```bash
   docker build -t bytebrief:latest .
   ```

2. **Run with Docker Compose**

   ```bash
   docker-compose up -d
   ```

### Cloud Deployment Options

#### AWS

- **Compute**: ECS Fargate or EC2
- **Database**: MongoDB Atlas or DocumentDB
- **Cache**: ElastiCache (Redis)
- **Secrets**: AWS Secrets Manager

#### Google Cloud

- **Compute**: Cloud Run or GKE
- **Database**: MongoDB Atlas
- **Cache**: Memorystore (Redis)
- **Secrets**: Secret Manager

#### Railway / Render / Fly.io

These platforms support Node.js applications with minimal configuration:

```bash
# Railway
railway up

# Render
# Connect GitHub repo and configure via dashboard

# Fly.io
fly launch
fly deploy
```

### Production Checklist

- [ ] Enable HTTPS/TLS
- [ ] Configure rate limiting
- [ ] Set up monitoring (e.g., Datadog, New Relic)
- [ ] Configure log aggregation
- [ ] Set up database backups
- [ ] Enable Redis persistence
- [ ] Configure health check endpoints
- [ ] Set up CI/CD pipeline

## Future Improvements

| Enhancement | Description |
|-------------|-------------|
| **Personalized Rankings** | ML-based article recommendations based on user reading history |
| **Topic Following** | Allow users to follow specific topics or keywords |
| **Reading Time Estimates** | AI-computed reading time for each article |
| **Offline Support** | Sync articles for offline reading |
| **Web Application** | Browser-based client for desktop users |
| **Newsletter Digest** | Email-based daily digest option |
| **Source Credibility Scoring** | Automated source reliability assessment |
| **Sentiment Analysis** | Tag articles with sentiment indicators |
| **Multi-language Support** | Article translation and localization |
| **GraphQL API** | Alternative to REST for flexible queries |
| **WebSocket Updates** | Real-time article updates |
| **Admin Dashboard** | Web UI for content moderation and analytics |

---

## License

MIT

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.
