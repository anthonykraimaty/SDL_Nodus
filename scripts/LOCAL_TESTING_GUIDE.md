# Local Testing with Production Data & Live B2 Bucket

This guide explains how to test the Nodus application locally using:
- Production database (via dump/restore)
- Live B2 Backblaze bucket (for images)

## Prerequisites

### Windows
- PostgreSQL installed and `psql`, `pg_dump`, `createdb`, `dropdb` in PATH
- OpenSSH client (comes with Windows 10+) or PuTTY
- Node.js and npm

### Linux/Mac
- PostgreSQL client tools (`psql`, `pg_dump`)
- SSH client
- Node.js and npm

---

## Step 1: SSH Tunnel Setup

The production database is not publicly accessible. You need an SSH tunnel.

### Option A: Manual SSH Tunnel (Recommended)

Open a terminal and keep it running:

```bash
# Replace with your actual server details
ssh -L 54321:localhost:5432 root@your-server.com
```

This creates a tunnel:
- Local port `54321` → Production server's PostgreSQL on port `5432`

### Option B: Using PuTTY (Windows)

1. Open PuTTY
2. Go to Connection → SSH → Tunnels
3. Source port: `54321`
4. Destination: `localhost:5432`
5. Click "Add"
6. Go back to Session, enter your server hostname
7. Click "Open" and login

---

## Step 2: Dump Production Database

### Using the Script

**Windows:**
```cmd
# Edit scripts\db-dump.bat first to set your SSH credentials
scripts\db-dump.bat
```

**Linux/Mac:**
```bash
# Edit scripts/db-dump.sh first to set your SSH credentials
chmod +x scripts/db-dump.sh
./scripts/db-dump.sh
```

### Manual Dump (if scripts don't work)

With SSH tunnel running (Step 1):

```bash
# Dump through the tunnel
pg_dump -h localhost -p 54321 -U postgres -d nodus_db \
    --no-owner --no-acl --clean --if-exists > dumps/nodus_prod.sql
```

**Note:** You'll be prompted for the database password.

---

## Step 3: Load Database Locally

### Using the Script

**Windows:**
```cmd
scripts\db-load.bat dumps\nodus_prod_XXXXXXXX_XXXXXX.sql
```

**Linux/Mac:**
```bash
./scripts/db-load.sh dumps/nodus_prod_XXXXXXXX_XXXXXX.sql
```

### Manual Load

```bash
# Drop existing local database
dropdb -h localhost -U postgres --if-exists nodus_db

# Create fresh database
createdb -h localhost -U postgres nodus_db

# Load the dump
psql -h localhost -U postgres -d nodus_db -f dumps/nodus_prod.sql
```

---

## Step 4: Configure Backend for Local Testing with Live B2

Create or update `backend/.env.local`:

```env
# Database - Local PostgreSQL with production data
DATABASE_URL="postgresql://postgres:your_local_password@localhost:5432/nodus_db?schema=public"

# Server
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# JWT
JWT_SECRET=your-dev-secret-key
JWT_EXPIRES_IN=7d

# B2 Backblaze - USE PRODUCTION VALUES
# Copy these from your production .env or docker-compose
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_BUCKET_NAME=your-bucket-name
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-application-key
B2_PUBLIC_URL=https://your-bucket.s3.us-west-004.backblazeb2.com
```

**Important:** Using the live B2 bucket means:
- ✅ Images uploaded in production will be visible locally
- ⚠️ Images uploaded locally will go to the live bucket
- ⚠️ Deleting images locally will delete them from production

---

## Step 5: Configure Frontend

Create or update `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3001
```

---

## Step 6: Run Locally

### Terminal 1 - Backend
```bash
cd backend
npm install
npm run dev
```

### Terminal 2 - Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Quick Reference

### Database Connection Details

| Environment | Host      | Port  | Database | User     |
|-------------|-----------|-------|----------|----------|
| Production  | localhost | 5432  | nodus_db | postgres |
| Via Tunnel  | localhost | 54321 | nodus_db | postgres |
| Local       | localhost | 5432  | nodus_db | postgres |

### File Locations

```
nodus/
├── scripts/
│   ├── db-dump.sh       # Linux/Mac dump script
│   ├── db-dump.bat      # Windows dump script
│   ├── db-load.sh       # Linux/Mac load script
│   ├── db-load.bat      # Windows load script
│   └── LOCAL_TESTING_GUIDE.md
├── dumps/               # Database dumps stored here
├── backend/
│   ├── .env             # Production config (don't edit)
│   └── .env.local       # Local testing config
└── frontend/
    ├── .env             # Production config
    └── .env.local       # Local testing config
```

---

## Troubleshooting

### "Connection refused" when dumping

- Make sure SSH tunnel is running
- Check the tunnel port (54321 by default)
- Verify SSH credentials

### "Authentication failed" for database

- Check database username/password
- On production, password might be in docker-compose or environment

### Images not loading locally

- Verify B2 credentials in `.env.local`
- Check browser console for CORS errors
- Make sure `B2_PUBLIC_URL` is correct

### Prisma client errors

After loading a new dump, regenerate Prisma client:

```bash
cd backend
npx prisma generate
```

### Database schema mismatch

If your local schema differs from production:

```bash
cd backend
npx prisma db push --force-reset
```

Then reload the dump.

---

## Safety Tips

1. **Never commit `.env.local` files** - They contain secrets
2. **Be careful with uploads** - They go to the live B2 bucket
3. **Be careful with deletions** - They affect the live B2 bucket
4. **Keep dumps secure** - They contain production data
5. **Add `dumps/` to `.gitignore`** - Don't commit database dumps

---

## Docker Alternative

If you prefer Docker for local PostgreSQL:

```bash
# Start local PostgreSQL
docker run -d \
    --name nodus-postgres-local \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=nodus_db \
    -p 5432:5432 \
    postgres:15

# Load dump
psql -h localhost -U postgres -d nodus_db -f dumps/nodus_prod.sql
```

Update `DATABASE_URL` in `.env.local`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nodus_db?schema=public"
```
