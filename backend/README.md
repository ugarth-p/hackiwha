# Backend - Orchestrator API

This NestJS service acts as the central hub. It manages the database, serves data to the frontend, and schedules tasks for the Python workers.

## Tech Stack
- Framework: NestJS
- Database: MongoDB (via Mongoose or Prisma)
- Queue: BullMQ (Redis) for background jobs

## Core Modules
- `Competitors`: CRUD operations for target brands.
- `Digests`: Stores raw scraping and analysis data.
- `Strategies`: Stores the AI-generated marketing actions.
- `Jobs`: Triggers the Python workers via HTTP or message queues.

## Setup & Run

1. Ensure Docker is running the database and Redis:
   docker-compose up -d

2. Install dependencies:
   npm install

3. Copy the environment variables:
   cp .env.example .env

4. Start the server in watch mode:
   npm run start:dev