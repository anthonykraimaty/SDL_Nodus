# Nodus Quick Start Guide

Get Nodus running in 5 minutes.

## Step 1: Configure Passwords

```bash
# In root directory
cp .env.example .env
```

Edit `.env`:
```env
POSTGRES_USER=nodus_user
POSTGRES_PASSWORD=ChangeThisPassword123!
POSTGRES_DB=nodus_db
POSTGRES_PORT=5432
```

```bash
# In backend directory
cd backend
cp .env.docker .env
```

Edit `backend/.env` - **Make sure credentials match above**:
```env
DATABASE_URL=postgresql://nodus_user:ChangeThisPassword123!@nodus_postgres:5432/nodus_db?schema=public
PORT=3001
NODE_ENV=production
BACKEND_PORT=5020
CLIENT_URL=http://localhost:5173
JWT_SECRET=change-this-to-a-random-64-character-string
JWT_EXPIRES_IN=7d
```

## Step 2: Start PostgreSQL

```bash
# In root directory
docker-compose up -d

# Wait for healthy status
docker-compose ps
```

## Step 3: Start Backend

```bash
# In backend directory
cd backend
docker-compose up -d --build

# Wait for migrations to complete (30 seconds)
docker-compose logs -f backend
# Press Ctrl+C when you see "Server running"
```

## Step 4: Seed Database

```bash
# Still in backend directory
docker-compose exec backend node prisma/seed.js
```

## Step 5: Test

```bash
# Check API health
curl http://localhost:5020/api/health

# Should return:
# {"status":"ok","message":"Nodus API is running"}

# Check categories
curl http://localhost:5020/api/categories
# Should return 40 categories
```

## Login Credentials

- **Admin**: admin@nodus.com / password123
- **Branche**: anthonykraimaty@nodus.com / password123

## Access Points

- **Backend API**: http://localhost:5020
- **Database**: localhost:5432

## Common Commands

```bash
# Stop everything
cd backend && docker-compose down && cd .. && docker-compose down

# Start everything
docker-compose up -d && cd backend && docker-compose up -d

# View logs
docker-compose logs -f postgres          # PostgreSQL logs
cd backend && docker-compose logs -f     # Backend logs

# Re-seed database
cd backend && docker-compose exec backend node prisma/seed.js

# Access database shell
docker exec -it nodus_postgres psql -U nodus_user -d nodus_db
```

## Next Steps

- See [DOCKER-GUIDE.md](DOCKER-GUIDE.md) for detailed documentation
- See [SETUP.md](SETUP.md) for development setup
- Change default passwords in production
- Update `CLIENT_URL` when deploying frontend
