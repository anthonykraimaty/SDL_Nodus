# Docker Deployment Guide

This guide explains how to deploy Nodus using Docker with separate containers for PostgreSQL and Backend.

## Architecture

```
Root Directory (/)
└── docker-compose.yml          → PostgreSQL Database (standalone)

Backend Directory (/backend)
└── docker-compose.yml          → Node.js API (connects to PostgreSQL)
```

The PostgreSQL and Backend containers communicate via a shared Docker network called `nodus_network`.

---

## Prerequisites

- Docker and Docker Compose installed
- Basic understanding of environment variables

---

# Part 1: Configure Passwords and Secrets

## 1.1 PostgreSQL Database Configuration

### Create Root Environment File

```bash
# In root directory
cd /path/to/nodus
cp .env.example .env
```

### Edit `.env` in root directory:

```env
# PostgreSQL Credentials - CHANGE THESE
POSTGRES_USER=your_custom_username
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=nodus_db
POSTGRES_PORT=5432
```

**Security Notes:**
- Use a strong password (16+ characters, mixed case, numbers, symbols)
- Never commit `.env` files to version control
- Different passwords for development and production

### Example Strong Password Generation:

```bash
# Linux/Mac - Generate random password
openssl rand -base64 32

# Or use online generator (make sure it's HTTPS)
# https://passwordsgenerator.net/
```

## 1.2 Backend API Configuration

### Create Backend Environment File

```bash
cd backend
cp .env.docker .env
```

### Edit `backend/.env`:

```env
# Database - Must match PostgreSQL credentials above
DATABASE_URL=postgresql://your_custom_username:your_secure_password_here@nodus_postgres:5432/nodus_db?schema=public

# Server
PORT=3001
NODE_ENV=production
BACKEND_PORT=5020

# CORS - Update with your actual frontend URL
CLIENT_URL=https://your-frontend-domain.com

# JWT Secret - Generate a strong secret
JWT_SECRET=your-super-secret-random-string-min-32-characters
JWT_EXPIRES_IN=7d
```

**Important:**
- `DATABASE_URL` username and password must match `POSTGRES_USER` and `POSTGRES_PASSWORD`
- Use `@nodus_postgres` (container name) NOT `@localhost` in DATABASE_URL
- `BACKEND_PORT` is the external port (how you access it from host)
- `PORT` is internal (stays 3001)

### Generate JWT Secret:

```bash
# Linux/Mac
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Or
openssl rand -hex 64
```

---

# Part 2: Deployment Steps

## 2.1 Start PostgreSQL Database

```bash
# In root directory
cd /path/to/nodus

# Start PostgreSQL
docker-compose up -d

# Verify it's running
docker-compose ps
docker-compose logs postgres
```

**Expected Output:**
```
NAME              IMAGE                 STATUS
nodus_postgres    postgres:15-alpine    Up (healthy)
```

## 2.2 Start Backend API

```bash
# In backend directory
cd backend

# Build and start backend
docker-compose up -d --build

# Verify it's running
docker-compose ps
docker-compose logs -f backend
```

**Expected Output:**
```
NAME              IMAGE                 STATUS
nodus_backend     backend-backend       Up
```

**Wait for migrations to complete.** You should see:
```
Running migrations...
Server running on http://localhost:3001
```

## 2.3 Verify Services

```bash
# Check if backend is accessible (from host machine)
curl http://localhost:5020/api/health

# Expected response:
# {"status":"ok","message":"Nodus API is running"}
```

---

# Part 3: Database Seeding

## 3.1 Seed the Database

After both PostgreSQL and Backend are running:

```bash
# In backend directory
cd backend

# Run seed script inside the backend container
docker-compose exec backend node prisma/seed.js
```

**Expected Output:**
```
Starting seed...
Districts created: { districtNord: {...}, districtSud: {...} }
Groups created: { groupCasablanca: {...}, ... }
Troupes created: { troupeEclaireurs: {...}, ... }
Admin user created: admin@nodus.com
Branche user created: anthonykraimaty@nodus.com
Created 40 categories
Seed completed successfully!
```

## 3.2 Verify Seed Data

### Check Users:

```bash
# Access PostgreSQL shell
docker exec -it nodus_postgres psql -U your_custom_username -d nodus_db

# List users
SELECT id, email, name, role FROM "User";

# Should show:
# admin@nodus.com (ADMIN)
# anthonykraimaty@nodus.com (BRANCHE_ECLAIREURS)

# Exit PostgreSQL
\q
```

### Check Categories:

```bash
curl http://localhost:5020/api/categories | jq length

# Should return: 40
```

---

# Part 4: Common Operations

## 4.1 Start/Stop Services

### Stop Everything:
```bash
# Stop backend
cd backend
docker-compose down

# Stop PostgreSQL
cd ..
docker-compose down
```

### Start Everything:
```bash
# Start PostgreSQL first
docker-compose up -d

# Then start backend
cd backend
docker-compose up -d
```

## 4.2 View Logs

```bash
# PostgreSQL logs
docker-compose logs -f postgres

# Backend logs
cd backend
docker-compose logs -f backend
```

## 4.3 Restart Services

```bash
# Restart PostgreSQL
docker-compose restart postgres

# Restart backend (reload code changes)
cd backend
docker-compose up -d --build
```

## 4.4 Access Database Shell

```bash
# Using docker exec
docker exec -it nodus_postgres psql -U your_username -d nodus_db

# Common PostgreSQL commands:
\dt              # List all tables
\d "User"        # Describe User table
\q               # Quit
```

## 4.5 Run Migrations Manually

```bash
cd backend
docker-compose exec backend npx prisma migrate deploy
```

## 4.6 Re-seed Database

```bash
# WARNING: This will add duplicate data if not cleared first

cd backend
docker-compose exec backend node prisma/seed.js
```

## 4.7 Reset Database (Clear All Data)

```bash
# Stop backend
cd backend
docker-compose down

# Remove PostgreSQL data volume
cd ..
docker-compose down -v

# Start fresh
docker-compose up -d
cd backend
docker-compose up -d --build

# Run migrations and seed
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend node prisma/seed.js
```

---

# Part 5: Development vs Production

## Development Setup (Recommended for coding)

**Don't use Docker for backend** - run locally for hot-reload:

```bash
# Start only PostgreSQL
docker-compose up -d

# Run backend locally
cd backend
cp .env.example .env
# Edit .env to use DATABASE_URL with @localhost
npm run dev

# Run frontend locally
cd ../frontend
npm run dev
```

**Development .env:**
```env
DATABASE_URL=postgresql://nodus_user:nodus_password@localhost:5432/nodus_db?schema=public
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d
```

## Production Setup (Docker for everything)

```bash
# Start PostgreSQL
docker-compose up -d

# Start backend in Docker
cd backend
cp .env.docker .env
# Edit .env with production values
docker-compose up -d --build
```

**Production .env:**
```env
DATABASE_URL=postgresql://prod_user:secure_password@nodus_postgres:5432/nodus_db?schema=public
BACKEND_PORT=5020
NODE_ENV=production
CLIENT_URL=https://your-production-domain.com
JWT_SECRET=your-secure-64-char-random-string
JWT_EXPIRES_IN=7d
```

---

# Part 6: Troubleshooting

## PostgreSQL Won't Start

### Check if port 5432 is in use:
```bash
# Windows
netstat -ano | findstr :5432

# Linux/Mac
lsof -i :5432
```

### Solution: Change port in root `.env`:
```env
POSTGRES_PORT=5433
```

And update backend `DATABASE_URL`:
```env
DATABASE_URL=postgresql://user:pass@nodus_postgres:5433/nodus_db?schema=public
```

## Backend Can't Connect to Database

### Error: "Can't reach database server at nodus_postgres:5432"

**Check network connection:**
```bash
cd backend
docker-compose exec backend ping nodus_postgres
```

**Solution:** Make sure PostgreSQL is running and healthy:
```bash
cd ..
docker-compose ps
# postgres should show (healthy)
```

### Error: "Authentication failed"

**Cause:** DATABASE_URL credentials don't match PostgreSQL credentials

**Solution:** Verify credentials match:
- Root `.env`: `POSTGRES_USER` and `POSTGRES_PASSWORD`
- Backend `.env`: Username and password in `DATABASE_URL`

## Migrations Fail

### Error: "Migration engine error"

```bash
cd backend

# Check backend logs
docker-compose logs backend

# Try running migrations manually
docker-compose exec backend npx prisma migrate deploy

# If that fails, reset and try again
docker-compose exec backend npx prisma migrate reset
```

## Seed Fails

### Error: "Unique constraint failed"

**Cause:** Data already exists

**Solution:** Seed is idempotent (uses upsert), but if you changed data manually:
```bash
# Reset database
cd ..
docker-compose down -v
docker-compose up -d

cd backend
docker-compose up -d --build
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend node prisma/seed.js
```

## Port 5020 Already in Use

**Change backend port in `backend/.env`:**
```env
BACKEND_PORT=5021
```

Then restart:
```bash
cd backend
docker-compose up -d
```

## Uploaded Pictures Not Persisting

**Check volume:**
```bash
docker volume ls | grep uploads

# Should show: backend_uploads_data
```

**Access uploads inside container:**
```bash
cd backend
docker-compose exec backend ls -la /app/uploads
```

---

# Part 7: Production Checklist

Before deploying to production:

- [ ] Change `POSTGRES_USER` to a custom username
- [ ] Change `POSTGRES_PASSWORD` to a strong password (32+ characters)
- [ ] Generate a secure `JWT_SECRET` (64+ characters)
- [ ] Update `CLIENT_URL` to your production frontend URL
- [ ] Change default user passwords after first login
- [ ] Set up automated backups for `postgres_data` volume
- [ ] Set up automated backups for `uploads_data` volume
- [ ] Configure firewall to restrict port 5020 access
- [ ] Set up SSL/TLS reverse proxy (Nginx/Caddy) in front of backend
- [ ] Enable Docker auto-restart: `restart: always`
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Review CORS settings

---

# Part 8: Backup and Restore

## Backup Database

```bash
# Create backup
docker exec nodus_postgres pg_dump -U your_username nodus_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup with compression
docker exec nodus_postgres pg_dump -U your_username nodus_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

## Restore Database

```bash
# From SQL file
docker exec -i nodus_postgres psql -U your_username nodus_db < backup.sql

# From compressed backup
gunzip -c backup.sql.gz | docker exec -i nodus_postgres psql -U your_username nodus_db
```

## Backup Uploaded Pictures

```bash
# Copy from Docker volume to host
docker run --rm -v backend_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads_backup.tar.gz /data
```

## Restore Uploaded Pictures

```bash
# Copy from host to Docker volume
docker run --rm -v backend_uploads_data:/data -v $(pwd):/backup alpine tar xzf /backup/uploads_backup.tar.gz -C /data --strip 1
```

---

# Quick Reference

## Start Everything
```bash
docker-compose up -d && cd backend && docker-compose up -d --build && cd ..
```

## Stop Everything
```bash
cd backend && docker-compose down && cd .. && docker-compose down
```

## View All Logs
```bash
docker-compose logs -f & cd backend && docker-compose logs -f
```

## Seed Database
```bash
cd backend && docker-compose exec backend node prisma/seed.js
```

## Access Database
```bash
docker exec -it nodus_postgres psql -U nodus_user -d nodus_db
```

## Check Health
```bash
curl http://localhost:5020/api/health
```
