# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nodus** is a scouts installation picture sharing platform. It allows scouts to upload and browse pictures of camp installations and hand-drawn schematics, organized by scout organizational hierarchy.

**Tech Stack:**
- **Frontend**: React with JSX, Vite bundler
- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens with bcrypt
- **File Upload**: Multer with local storage
- **Package Manager**: npm

**Key Features:**
- Picture upload and classification by scouts
- Picture approval workflow
- Public browsing (no login required for viewing)
- Organizational hierarchy (District → Group → Troupe → Patrouille)
- Category and sub-category system
- Monthly category availability for schematics
- Participation dashboard
- Announcement and highlight carousel

## Project Structure

```
nodus/
├── frontend/              # React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API service layer
│   │   │   └── api.js     # API client with auth
│   │   ├── App.jsx        # Main app component
│   │   └── main.jsx       # Entry point
│   ├── .env.example
│   └── package.json
│
├── backend/               # Node.js API server
│   ├── src/
│   │   ├── routes/        # API route definitions
│   │   │   ├── auth.js    # Authentication routes
│   │   │   ├── pictures.js  # Picture CRUD and approval
│   │   │   ├── categories.js  # Category management
│   │   │   ├── announcements.js  # Announcements
│   │   │   └── analytics.js  # Participation stats
│   │   ├── middleware/
│   │   │   ├── auth.js    # JWT authentication & authorization
│   │   │   └── upload.js  # Multer file upload config
│   │   ├── utils/
│   │   │   └── auth.js    # Password hashing, JWT helpers
│   │   └── server.js      # Express server setup
│   ├── prisma/
│   │   └── schema.prisma  # Complete database schema
│   ├── uploads/           # Uploaded pictures
│   ├── .env.example
│   └── package.json
│
├── ARCHITECTURE.md        # Detailed architecture docs
├── CLAUDE.md              # This file
└── README.md
```

## Development Commands

### Backend

```bash
cd backend

# Development (with auto-reload)
npm run dev

# Production start
npm start

# Prisma commands
npm run prisma:generate    # Generate Prisma Client after schema changes
npm run prisma:migrate     # Create and apply database migration
npm run prisma:studio      # Open Prisma Studio (database GUI)

# Run migrations manually
npx prisma migrate dev --name <migration-name>
npx prisma db push         # Push schema changes without migration
```

### Frontend

```bash
cd frontend

# Development server (default: http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Database Setup

1. **Install PostgreSQL** if not already installed
2. **Create database**: `createdb nodus_db`
3. **Configure environment**: Copy `backend/.env.example` to `backend/.env` and update:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/nodus_db?schema=public"
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   PORT=3001
   CLIENT_URL=http://localhost:5173
   ```
4. **Run migrations**: `cd backend && npm run prisma:migrate`
5. **Prisma Client**: Auto-generated at `backend/src/generated/prisma`

## User Roles & Permissions

### ADMIN
- Full system access
- Manage users, organizational structure, categories
- Manage announcements and highlights
- View all analytics

### CHEF_TROUPE (Troupe Leader)
- Upload pictures for their troupe
- Add metadata to own pictures
- Associate pictures with patrouilles
- View own troupe's pictures (all statuses)
- View participation dashboard for their troupe
- **Cannot** approve/reject pictures

### BRANCHE_ECLAIREURS (Branch Members)
- View all pending/classified pictures
- Add/edit classification for any picture
- Approve or reject pictures
- Mark pictures as highlights
- View all approved pictures
- Access approval dashboard
- **Cannot** upload pictures

**Public Access (No Login):**
- View all approved pictures
- Browse by group, category, date, location
- View picture details

## Database Architecture

**Organizational Hierarchy:**
```
District
  └─ Group (many)
      └─ Troupe (many)
          ├─ User/Chef (many)
          └─ Patrouille (many)
              └─ Pictures (many)
```

**Core Models:**
- `District`, `Group`, `Troupe` - Organizational structure
- `Patrouille` - Scout patrol with `totem` and `cri` attributes
- `User` - With roles: ADMIN, CHEF_TROUPE, BRANCHE_ECLAIREURS
- `Picture` - Installation photos or schematics with metadata
- `Category` - Hierarchical (supports sub-categories)
- `MonthlyCategory` - Controls monthly schematic category availability
- `Tag` - Flexible tagging system
- `Announcement` - Landing page carousel content

**Picture Status Flow:**
1. `PENDING` → Just uploaded
2. `CLASSIFIED` → Metadata/categories added
3. `APPROVED` → Approved by Branche, publicly visible
4. `REJECTED` → Rejected by Branche

See `ARCHITECTURE.md` for complete database schema details.

## Backend Architecture

- **ES Modules**: Uses `"type": "module"` - always use `import`/`export`
- **Prisma Client**: Import from `@prisma/client`, generated at `src/generated/prisma`
- **Authentication**: JWT-based, tokens in `Authorization: Bearer <token>` header
- **File Upload**: Multer stores in `uploads/pictures/YYYY/MM/`
- **Static Files**: Served at `/uploads` endpoint
- **CORS**: Configured for frontend origin

**Middleware:**
- `authenticate` - Verify JWT, attach `req.user`
- `authorize(...roles)` - Check user role
- `canModifyPicture` - Check picture ownership/permissions
- `optionalAuth` - For endpoints that behave differently when authenticated
- `upload.single('picture')` - Handle file uploads

**Routes Structure:**
- `/api/auth` - Login, register, me
- `/api/pictures` - CRUD, classify, approve, reject
- `/api/categories` - List, monthly availability
- `/api/announcements` - Active announcements
- `/api/analytics` - Participation stats
- `/api/districts`, `/api/groups` - Organizational data

## Frontend Architecture

- **API Service**: All API calls through `src/services/api.js`
- **Environment Variables**: `import.meta.env.VITE_API_URL`
- **Components**: Functional with hooks
- **Authentication**: Store JWT in localStorage, include in headers

## Common Development Tasks

### Adding a New Database Model

1. Update `backend/prisma/schema.prisma`
2. Run: `cd backend && npm run prisma:migrate -- --name descriptive_name`
3. Prisma Client regenerates automatically
4. Create routes in `backend/src/routes/`
5. Import and mount in `server.js`

### Adding a New API Endpoint

1. Add to appropriate route file in `src/routes/` or create new one
2. Import necessary models from `@prisma/client`
3. Use authentication middleware: `authenticate`, `authorize(...roles)`
4. Return JSON with appropriate status codes
5. Handle errors with try/catch

**Example:**
```javascript
router.get('/endpoint', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const data = await prisma.model.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});
```

### Adding Picture Upload Functionality

Pictures are uploaded with metadata. Flow:
1. Chef Troupe uploads via `POST /api/pictures` with `multipart/form-data`
2. Multer saves to `uploads/pictures/YYYY/MM/`
3. Picture created with status `PENDING`
4. Chef or Branche adds classification via `PUT /api/pictures/:id/classify`
5. Branche approves via `POST /api/pictures/:id/approve` or rejects via `/reject`

### Managing Monthly Categories (Schematics)

Categories for schematics are time-limited:
```javascript
// Create monthly category availability
POST /api/categories/monthly (admin only)
{
  "categoryId": 1,
  "month": 11,
  "year": 2025,
  "isActive": true
}
```

Frontend should check `GET /api/categories/monthly/:month/:year` before allowing schematic upload.

### Adding a React Component

1. Create in `frontend/src/components/`
2. Use functional components with hooks
3. For API calls, extend `frontend/src/services/api.js`
4. Handle loading, error, and success states
5. Include authentication headers when needed

**Example API Service Method:**
```javascript
export const pictureService = {
  upload: async (formData, token) => {
    const response = await fetch(`${API_URL}/api/pictures`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData, // Don't set Content-Type for FormData
    });
    return response.json();
  }
};
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/nodus_db?schema=public"
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001
```

## Common Workflows

### Starting Development
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### After Changing Database Schema
```bash
cd backend
npm run prisma:migrate
# Prisma Client regenerates automatically
```

### Deploying to Production
1. Build frontend: `cd frontend && npm run build`
2. Set production environment variables
3. Run database migrations: `cd backend && npx prisma migrate deploy`
4. Start backend: `cd backend && npm start`
5. Serve frontend build files (e.g., with nginx or serve from Express)

## Key Dependencies

### Backend
- `express` - Web framework
- `@prisma/client` + `prisma` - Database ORM with migrations
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `multer` - File upload handling
- `nodemon` - Dev auto-reload

### Frontend
- `react` - UI library
- `vite` - Build tool and dev server
- Environment variables prefixed with `VITE_` are exposed to client

## Key API Endpoints

### Authentication
- `POST /api/auth/register` - Register user (email, password, name, role, troupeId)
- `POST /api/auth/login` - Login (returns JWT token)
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout (client-side token removal)

### Pictures
- `GET /api/pictures` - List pictures (public for approved, filtered by role)
  - Query params: `status`, `type`, `categoryId`, `groupId`, `troupeId`, `patrouilleId`, `startDate`, `endDate`, `highlights`, `page`, `limit`
- `GET /api/pictures/:id` - Get single picture
- `POST /api/pictures` - Upload (chef troupe, multipart/form-data)
- `PUT /api/pictures/:id/classify` - Add classification (owner or branche)
- `POST /api/pictures/:id/approve` - Approve (branche only)
- `POST /api/pictures/:id/reject` - Reject (branche only, requires reason)
- `DELETE /api/pictures/:id` - Delete (owner or admin)

### Categories
- `GET /api/categories` - List all (query: `type`, `parentId`)
- `GET /api/categories/monthly/:month/:year` - Get available categories for month
- `POST /api/categories` - Create (admin only)

### Organizational
- `GET /api/districts` - All districts with nested groups/troupes
- `GET /api/groups` - All groups with counts

### Announcements
- `GET /api/announcements` - Active announcements for carousel
- `POST /api/announcements` - Create (admin only)

### Analytics
- `GET /api/analytics/participation` - Participation by patrouille (filtered by role)
- `GET /api/analytics/pictures/stats` - Picture statistics (branche/admin only)

### Static Files
- `GET /uploads/pictures/YYYY/MM/filename` - Serve uploaded pictures

## Important Implementation Notes

1. **Authentication Flow:**
   - Login returns JWT token
   - Store in localStorage (frontend)
   - Include in `Authorization: Bearer <token>` header
   - Backend verifies and attaches `req.user`

2. **File Uploads:**
   - Use FormData in frontend
   - Don't set Content-Type header (browser sets with boundary)
   - Backend saves to `uploads/pictures/YYYY/MM/`
   - Returns `filePath` to store in database

3. **Picture Access Control:**
   - Public: Only `APPROVED` pictures
   - Chef Troupe: Own pictures (all statuses) + approved
   - Branche: All pictures
   - Admin: All pictures

4. **Monthly Categories:**
   - Only apply to `SCHEMATIC` type
   - Check availability before allowing upload
   - Admin manages via MonthlyCategory records

5. **Participation Dashboard:**
   - Shows which patrouilles have uploaded pictures
   - Chef Troupe: Limited to their troupe
   - Branche/Admin: Full access with filters

6. **Picture Status Transitions:**
   - `PENDING` → `CLASSIFIED` (classification added)
   - `CLASSIFIED` → `APPROVED` (branche approval)
   - `CLASSIFIED` → `REJECTED` (branche rejection)
   - Can classify at upload time (skip PENDING)

7. **Security:**
   - Passwords hashed with bcrypt
   - JWT tokens expire based on `JWT_EXPIRES_IN`
   - File upload restricted to images only
   - Max file size: 10MB
   - Role-based authorization on all protected routes

For complete architecture details, see `ARCHITECTURE.md`.
