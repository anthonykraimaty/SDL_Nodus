# Nodus - Scouts Installation Gallery

A full-stack web application for scouts to upload, browse, and share pictures of camp installations and hand-drawn schematics. Built with React, Node.js, Express, and PostgreSQL.

## Features

- 🏕️ **Public Gallery**: Browse approved installation photos and schematics
- 📸 **Picture Upload**: Scout leaders can upload and classify pictures
- ✅ **Approval Workflow**: Branche members review and approve submissions
- 🎯 **Advanced Filters**: Filter by group, category, date, and type
- 📊 **Participation Dashboard**: Track which patrouilles have participated
- 🎨 **Dark Green Theme**: Scout-themed interface with dark green colors
- 🔐 **Role-Based Access**: Admin, Chef Troupe, and Branche Eclaireurs roles

## Tech Stack

- **Frontend**: React 18 with JSX, Vite, React Router
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt
- **File Upload**: Multer
- **Package Manager**: npm

## Prerequisites

- Node.js (v20.9.0 or higher)
- PostgreSQL (v12 or higher)
- npm

## Getting Started

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb nodus_db

# Copy environment file
cd backend
cp .env.example .env

# Edit .env and update with your credentials:
# DATABASE_URL="postgresql://username:password@localhost:5432/nodus_db?schema=public"
# JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Run database migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

### 3. Frontend Configuration

```bash
cd frontend
cp .env.example .env

# Edit .env if needed (default API URL is http://localhost:3001)
```

### 4. Start Development Servers

```bash
# Terminal 1 - Backend (http://localhost:3001)
cd backend
npm run dev

# Terminal 2 - Frontend (http://localhost:5173)
cd frontend
npm run dev
```

Visit `http://localhost:5173` to see the application.

## Project Structure

```
nodus/
├── frontend/              # React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API service layer
│   │   └── App.jsx        # Main component
│   └── package.json
│
├── backend/               # Express API server
│   ├── src/
│   │   ├── server.js      # Express server
│   │   ├── routes/        # API routes
│   │   ├── controllers/   # Business logic
│   │   └── middleware/    # Express middleware
│   ├── prisma/
│   │   └── schema.prisma  # Database schema
│   └── package.json
│
└── README.md
```

## Available Scripts

### Backend

- `npm run dev` - Start development server with auto-reload
- `npm start` - Start production server
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:studio` - Open Prisma Studio

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Frontend Pages

- **Landing (/)**: Homepage with carousel of highlighted pictures and announcements
- **Browse (/browse)**: Gallery with filters (group, category, date, type)
- **Login (/login)**: Authentication page for scouts
- **Dashboard (/dashboard)**: Role-based dashboard with statistics
- **Upload (/upload)**: Picture upload form (Chef Troupe only)

## User Roles

### CHEF_TROUPE (Scout Troupe Leader)
- Upload pictures for their troupe
- Add metadata and classifications
- View own pictures and participation stats

### BRANCHE_ECLAIREURS (Branch Members)
- Review pending pictures
- Approve or reject submissions
- Add classifications to any picture
- Mark pictures as highlights

### ADMIN
- Full system access
- Manage users and organizational structure
- Manage categories and announcements

## Key API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Pictures
- `GET /api/pictures` - List pictures (public for approved)
- `POST /api/pictures` - Upload picture
- `PUT /api/pictures/:id/classify` - Add classification
- `POST /api/pictures/:id/approve` - Approve picture
- `POST /api/pictures/:id/reject` - Reject picture

### Categories & Organization
- `GET /api/categories` - List categories
- `GET /api/categories/monthly/:month/:year` - Monthly available categories
- `GET /api/groups` - List groups with counts
- `GET /api/announcements` - Active announcements

### Analytics
- `GET /api/analytics/participation` - Participation by patrouille
- `GET /api/analytics/pictures/stats` - Picture statistics

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

```
VITE_API_URL=http://localhost:3001
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete architecture documentation including:
- User roles and permissions
- Database schema with all models
- API endpoints reference
- Picture approval workflow
- Frontend structure recommendations

See [CLAUDE.md](./CLAUDE.md) for detailed development guidance including:
- Adding new database models
- Creating new API endpoints
- Adding React components
- Common workflows and best practices

## Design System

The application uses a **dark green scouts theme**:
- Primary: Dark forest green (`#1a3d2e`, `#2d5a3f`)
- Accent: Bright green (`#7cb342`, `#9ccc65`)
- Background: Very dark green (`#0d1f1a`)
- All colors defined as CSS variables in `frontend/src/index.css`

## Next Steps

1. **Seed Initial Data**: Create districts, groups, troupes, patrouilles, and categories
2. **Create Users**: Register admin and test users for each role
3. **Upload Pictures**: Test the upload and approval workflow
4. **Add Announcements**: Create monthly challenges and news
5. **Configure Monthly Categories**: Set up which schematic categories are available each month

## License

ISC
