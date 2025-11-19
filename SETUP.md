# Nodus Setup Guide

This guide will help you set up the Nodus project with Docker.

## Prerequisites

- Docker and Docker Compose installed
- Node.js (v18 or higher) - for development only
- npm - for development only

---

# Development Setup

For local development with hot-reload and debugging.

## 1. Start PostgreSQL with Docker

```bash
# Start PostgreSQL container only
docker-compose up -d

# Verify PostgreSQL is running
docker ps
```

## 2. Configure Backend Environment

```bash
cd backend

# Copy the example .env file
cp .env.example .env

# The .env file should contain:
# DATABASE_URL="postgresql://nodus_user:nodus_password@localhost:5432/nodus_db?schema=public"
# JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
# JWT_EXPIRES_IN=7d
# PORT=3001
# CLIENT_URL=http://localhost:5173
```

## 3. Run Database Migrations

```bash
# Install dependencies
npm install

# Generate Prisma Client
npm run prisma:generate

# Run migrations to create database schema
npm run prisma:migrate
```

## 4. Seed Database

```bash
# Seed the database with initial data
npm run prisma:seed
```

This will create:
- **2 Districts**: District Nord, District Sud
- **3 Groups**: Groupe Casablanca, Groupe Rabat, Groupe Marrakech
- **2 Troupes**: Troupe Éclaireurs Casablanca, Troupe Éclaireurs Rabat
- **Admin User**: admin@nodus.com / password123
- **Branche User**: anthonykraimaty@nodus.com / password123
- **40 Categories**: Mât, Porte d'entrée, Autel, Tente, etc.

## 5. Start Backend Server (Development)

```bash
# Development mode (with auto-reload)
npm run dev
```

The backend API will be available at: http://localhost:3001

## 6. Start Frontend (Development)

```bash
cd ../frontend

# Copy the example .env file
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at: http://localhost:5173

---

# Production Setup (Docker)

For production deployment with both PostgreSQL and Backend running in Docker containers.

## 1. Build and Start Production Stack

```bash
# Build and start all services (PostgreSQL + Backend)
docker-compose -f docker-compose.prod.yml up -d --build

# Verify services are running
docker ps
```

This will:
- Start PostgreSQL container
- Build backend Docker image
- Run database migrations automatically
- Start backend on port **5020**

The backend API will be available at: http://localhost:5020

## 2. Seed Production Database

```bash
# Run seed inside the backend container
docker-compose -f docker-compose.prod.yml exec backend node prisma/seed.js
```

## 3. Update Production Environment Variables

Edit the environment variables in `docker-compose.prod.yml`:

```yaml
environment:
  - DATABASE_URL=postgresql://nodus_user:nodus_password@postgres:5432/nodus_db?schema=public
  - PORT=3001
  - NODE_ENV=production
  - CLIENT_URL=https://your-production-frontend-url.com  # CHANGE THIS
  - JWT_SECRET=CHANGE-THIS-TO-A-SECURE-SECRET  # CHANGE THIS
  - JWT_EXPIRES_IN=7d
```

## 4. Production Commands

```bash
# Stop production stack
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Restart backend only
docker-compose -f docker-compose.prod.yml restart backend

# Remove all data (WARNING: Deletes database)
docker-compose -f docker-compose.prod.yml down -v
```

---

# Login Credentials

### Admin Account
- **Email**: admin@nodus.com
- **Password**: password123
- **Role**: ADMIN (full system access)

### Branche Éclaireurs Account
- **Email**: anthonykraimaty@nodus.com
- **Password**: password123
- **Role**: BRANCHE_ECLAIREURS (can approve pictures)

---

# Categories Seeded

The following 40 categories are pre-loaded:

1. Mât
2. Porte d'entrée
3. Autel
4. Tente
5. Tente sur élevé
6. Tente indienne
7. Hutte
8. Tour
9. Pont
10. Ascenseur
11. Balançoire
12. Bateau
13. Lit
14. Tableau d'affichage
15. Banc
16. Table
17. Four
18. Poubelle
19. Porte Fanion
20. Porte Habit
21. Porte linge
22. Porte soulier
23. Porte vaisselle
24. Porte matériel
25. Porte Lanterne
26. Zone d'eau
27. Douche
28. Vestiaire
29. Coin de prière
30. Coin de secours
31. Coin de veillée
32. Coin d'intendance
33. Coin Morse/Notebook
34. Barrière
35. Toilette
36. Vaisselier
37. Feuillet
38. Cuisine
39. Sentier
40. Feu

---

# Port Configuration

## Development
- **PostgreSQL**: localhost:5432
- **Backend API**: localhost:3001
- **Frontend**: localhost:5173

## Production (Docker)
- **PostgreSQL**: Internal network only (not exposed)
- **Backend API**: localhost:5020
- **Frontend**: Deploy separately (Nginx, Vercel, etc.)

---

# Useful Commands

## Development Commands

```bash
# Backend
cd backend

# Open Prisma Studio (Database GUI)
npm run prisma:studio

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Create a new migration
npx prisma migrate dev --name migration_name

# Frontend
cd frontend

# Build for production
npm run build

# Preview production build
npm run preview
```

## Docker Commands

### Development (PostgreSQL only)

```bash
# Start PostgreSQL
docker-compose up -d

# Stop PostgreSQL
docker-compose down

# View PostgreSQL logs
docker-compose logs -f postgres

# Access PostgreSQL shell
docker exec -it nodus_postgres_dev psql -U nodus_user -d nodus_db

# Remove PostgreSQL data (WARNING: Deletes all data)
docker-compose down -v
```

### Production (PostgreSQL + Backend)

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Stop all services
docker-compose -f docker-compose.prod.yml down

# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View backend logs only
docker-compose -f docker-compose.prod.yml logs -f backend

# Access backend container shell
docker-compose -f docker-compose.prod.yml exec backend sh

# Access PostgreSQL shell
docker-compose -f docker-compose.prod.yml exec postgres psql -U nodus_user -d nodus_db

# Rebuild backend image
docker-compose -f docker-compose.prod.yml up -d --build backend

# Remove all data (WARNING: Deletes all data)
docker-compose -f docker-compose.prod.yml down -v
```

---

# Troubleshooting

## Development

### Port 5432 already in use
If you have another PostgreSQL instance running, stop it or change the port in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"  # Map to a different port
```

Then update your DATABASE_URL in `.env`:
```
DATABASE_URL="postgresql://nodus_user:nodus_password@localhost:5433/nodus_db?schema=public"
```

### Database connection refused
Make sure PostgreSQL container is running:
```bash
docker ps
```

If not running, start it:
```bash
docker-compose up -d
```

### Prisma Client errors
Regenerate Prisma Client:
```bash
cd backend
npm run prisma:generate
```

## Production

### Port 5020 already in use
Change the port mapping in `docker-compose.prod.yml`:

```yaml
ports:
  - "5021:3001"  # Use port 5021 instead
```

### Backend won't start
Check logs:
```bash
docker-compose -f docker-compose.prod.yml logs backend
```

### Database migration failed
Run migrations manually:
```bash
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

### Uploaded pictures not persisting
Make sure the uploads volume is properly mounted. Check volumes:
```bash
docker volume ls
```

---

# Deployment Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a secure random string
- [ ] Update `CLIENT_URL` to your production frontend URL
- [ ] Change default database password in `docker-compose.prod.yml`
- [ ] Set up SSL/TLS for PostgreSQL connection
- [ ] Configure firewall rules to restrict port 5020 access
- [ ] Set up automated backups for PostgreSQL volume
- [ ] Change default user passwords after first login
- [ ] Configure proper CORS origins in backend
- [ ] Set up monitoring and logging
- [ ] Configure volume backups for uploaded pictures

---

# Next Steps

1. Browse categories at: http://localhost:5173/browse (dev) or your frontend URL (prod)
2. Login with admin credentials
3. Start uploading pictures
4. Use filters to browse by district, group, or date range
