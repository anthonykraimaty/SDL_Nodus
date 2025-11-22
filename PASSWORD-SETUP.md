# Password Configuration Guide

This guide shows you **exactly** where to set passwords for Nodus.

---

## Overview: 2 Files to Edit

You need to configure passwords in **2 files**:

1. **Root `.env`** - PostgreSQL database credentials
2. **Backend `.env`** - Backend API configuration (must match PostgreSQL)

---

## Step 1: Root Directory - PostgreSQL Password

### Location: `K:\Projects\SDL\nodus\.env`

**Create the file:**
```bash
cd K:\Projects\SDL\nodus
cp .env.example .env
```

**Edit this file and change these values:**

```env
# ============================================
# SET THESE 3 VALUES (they can stay default for development)
# ============================================
POSTGRES_USER=nodus_user              ← Your database username
POSTGRES_PASSWORD=nodus_password      ← CHANGE THIS to a secure password
POSTGRES_DB=nodus_db                  ← Your database name
POSTGRES_PORT=5432                    ← Port (keep as 5432)
```

### Example for Development:
```env
POSTGRES_USER=nodus_user
POSTGRES_PASSWORD=MyDevPassword123!
POSTGRES_DB=nodus_db
POSTGRES_PORT=5432
```

### Example for Production:
```env
POSTGRES_USER=nodus_prod_user
POSTGRES_PASSWORD=Xk9#mP2$vL8@qR5&wN3*hB7!zT4^yU6
POSTGRES_DB=nodus_db
POSTGRES_PORT=5432
```

**Generate a secure password:**
```bash
# On Linux/Mac/Git Bash:
openssl rand -base64 32

# Or use: https://passwordsgenerator.net/
```

---

## Step 2: Backend Directory - Must Match PostgreSQL

### Location: `K:\Projects\SDL\nodus\backend\.env`

**For Docker Production, create from template:**
```bash
cd K:\Projects\SDL\nodus\backend
cp .env.docker .env
```

**For Local Development, use existing:**
```bash
cd K:\Projects\SDL\nodus\backend
# .env.example is already configured for local development
cp .env.example .env
```

**Edit this file:**

```env
# ============================================
# DATABASE_URL - MUST MATCH ROOT .env VALUES
# ============================================
# Format: postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE

# FOR DOCKER (Production):
DATABASE_URL=postgresql://nodus_user:nodus_password@nodus_postgres:5432/nodus_db?schema=public
                          ^^^^^^^^^^  ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^
                          Must match  Must match      Must match
                          POSTGRES_   POSTGRES_       POSTGRES_DB
                          USER        PASSWORD        (container name stays
                                                      nodus_postgres)

# FOR LOCAL DEV (Running backend with npm run dev):
DATABASE_URL=postgresql://nodus_user:nodus_password@localhost:5432/nodus_db?schema=public
                                                     ^^^^^^^^^
                                                     Use localhost for local dev

# ============================================
# BACKEND PORT - External access port
# ============================================
BACKEND_PORT=5020                     ← Port to access backend from outside Docker

# ============================================
# JWT SECRET - CHANGE THIS
# ============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production  ← CHANGE THIS
JWT_EXPIRES_IN=7d

# ============================================
# CORS - Frontend URL
# ============================================
CLIENT_URL=http://localhost:5173      ← Your frontend URL

# ============================================
# NODE ENVIRONMENT
# ============================================
NODE_ENV=production
PORT=3001                             ← Internal port (keep as 3001)
```

### Example for Development (Local):
```env
DATABASE_URL=postgresql://nodus_user:MyDevPassword123!@localhost:5432/nodus_db?schema=public
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=dev-secret-not-for-production
JWT_EXPIRES_IN=7d
```

### Example for Production (Docker):
```env
DATABASE_URL=postgresql://nodus_prod_user:Xk9#mP2$vL8@qR5&wN3*hB7!zT4^yU6@nodus_postgres:5432/nodus_db?schema=public
BACKEND_PORT=5020
PORT=3001
NODE_ENV=production
CLIENT_URL=https://your-production-domain.com
JWT_SECRET=f7a8c3e9d2b6541a0e8f3c7d9b2a654e1f0c8a7d3b9e5241f7c8e0a9d3b6542a
JWT_EXPIRES_IN=7d
```

**Generate JWT Secret:**
```bash
# On Linux/Mac/Git Bash:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Or:
openssl rand -hex 64
```

---

## Step 3: Frontend (Optional - Usually Not Needed)

### Location: `K:\Projects\SDL\nodus\frontend\.env`

**This file usually doesn't need passwords.** Just the backend API URL:

```env
# ============================================
# BACKEND API URL
# ============================================
# For Development (backend running locally):
VITE_API_URL=http://localhost:3001

# For Production (backend in Docker):
VITE_API_URL=http://localhost:5020

# For Production (deployed):
VITE_API_URL=https://api.your-domain.com
```

---

## Critical Rules

### ✅ DO:
- ✅ Make sure `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in **root .env** match the DATABASE_URL in **backend .env**
- ✅ Use `@localhost` in DATABASE_URL when running backend locally with `npm run dev`
- ✅ Use `@nodus_postgres` in DATABASE_URL when running backend in Docker
- ✅ Change `JWT_SECRET` to a random 64+ character string
- ✅ Use different passwords for development and production
- ✅ Keep `.env` files out of git (already in .gitignore)

### ❌ DON'T:
- ❌ Don't use the default password `nodus_password` in production
- ❌ Don't commit `.env` files to version control
- ❌ Don't share your `.env` files
- ❌ Don't use special characters that need URL encoding in passwords (or encode them properly)

---

## Password Matching Checklist

Use this to verify your configuration:

### Root .env:
```
POSTGRES_USER=________nodus_user________
POSTGRES_PASSWORD=____MySecurePass123!____
POSTGRES_DB=_________nodus_db_________
```

### Backend .env (Docker):
```
DATABASE_URL=postgresql://nodus_user:MySecurePass123!@nodus_postgres:5432/nodus_db
                           ▲            ▲                                ▲
                           Must match   Must match                      Must match
```

### Backend .env (Local Dev):
```
DATABASE_URL=postgresql://nodus_user:MySecurePass123!@localhost:5432/nodus_db
                           ▲            ▲              ▲           ▲        ▲
                           Must match   Must match    Use         Same     Must match
                                                     localhost    port
```

---

## Quick Test

After setting passwords, test if they work:

```bash
# 1. Start PostgreSQL
cd K:\Projects\SDL\nodus
docker-compose up -d

# 2. Test connection with your password
docker exec -it nodus_postgres psql -U nodus_user -d nodus_db
# Enter your password when prompted
# If it works, you'll see: nodus_db=#

# 3. Exit
\q
```

---

## Common Errors

### Error: "password authentication failed"
**Cause:** Password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`

**Fix:** Make sure they match exactly (case-sensitive)

### Error: "database 'nodus_db' does not exist"
**Cause:** Database name in `DATABASE_URL` doesn't match `POSTGRES_DB`

**Fix:** Make sure database names match

### Error: "getaddrinfo ENOTFOUND nodus_postgres"
**Cause:** Using `@nodus_postgres` when running backend locally (not in Docker)

**Fix:**
- Docker backend: Use `@nodus_postgres`
- Local backend: Use `@localhost`

---

## Summary Table

| File | Location | What to Set |
|------|----------|-------------|
| **Root .env** | `K:\Projects\SDL\nodus\.env` | `POSTGRES_USER`<br>`POSTGRES_PASSWORD`<br>`POSTGRES_DB` |
| **Backend .env (Docker)** | `K:\Projects\SDL\nodus\backend\.env` | `DATABASE_URL` (use `@nodus_postgres`)<br>`JWT_SECRET`<br>`CLIENT_URL`<br>`BACKEND_PORT` |
| **Backend .env (Local)** | `K:\Projects\SDL\nodus\backend\.env` | `DATABASE_URL` (use `@localhost`)<br>`JWT_SECRET`<br>`CLIENT_URL` |
| **Frontend .env** | `K:\Projects\SDL\nodus\frontend\.env` | `VITE_API_URL` |

---

## Need Help?

1. **Development setup** → See [QUICKSTART.md](QUICKSTART.md)
2. **Production setup** → See [DOCKER-GUIDE.md](DOCKER-GUIDE.md)
3. **Full setup guide** → See [SETUP.md](SETUP.md)
