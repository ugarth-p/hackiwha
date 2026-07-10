# Brand Market Tracker - Hackiwha 3.0

An autonomous system built for **Theme 2: Marketing & Branding**. This application digests the market, tracks competitor movements, analyzes consumer sentiment, and provides actionable, community-driven branding strategies to capitalize on market gaps.

## Architecture overview

The project is split into three main services:

1. **Frontend (`/frontend`):** React dashboard for data visualization, competitor tracking, and strategy alerts.
2. **Backend (`/backend`):** NestJS core API that handles database interactions, orchestration, and task scheduling.
3. **Workers (`/workers`):** Python AI engine handling scraping, sentiment analysis, and strategy generation.

## Prerequisites

- Node.js (v18+)
- Python (v3.10+)
- Docker & Docker Compose (for MongoDB and Redis)

## Quick Start (Local Development)

1. Boot up the infrastructure (Database & Message Queue):
   cd backend
   docker-compose up -d

2. Follow the setup instructions in each subfolder's README.md to start the individual services.
