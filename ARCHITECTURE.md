# Nodus - Architecture Documentation

## Project Overview

Nodus is a scouts installation picture sharing platform that allows users to upload and browse pictures of camp installations and hand-drawn schematics, organized by scout organizational hierarchy.

## User Roles & Permissions

### 1. ADMIN
**Capabilities:**
- Manage all user accounts (create, update, delete, activate/deactivate)
- Manage organizational structure (Districts, Groups, Troupes, Patrouilles)
- Manage categories and monthly category availability
- Manage announcements and highlights
- View all analytics and participation dashboards
- Full system access

### 2. CHEF_TROUPE (Troupe Leader)
**Capabilities:**
- Upload pictures (installation photos and schematics)
- Add initial metadata to their uploaded pictures
- Associate pictures with specific patrouilles in their troupe
- View their troupe's pictures (all statuses)
- Edit their own pending/classified pictures
- View participation dashboard for their troupe
- View all approved pictures publicly

**Restrictions:**
- Can only upload pictures for their assigned troupe
- Cannot approve/reject pictures
- Cannot access other troupes' pending pictures

### 3. BRANCHE_ECLAIREURS (Branch Members)
**Capabilities:**
- View all pending and classified pictures
- Add/edit metadata and classification for any picture
- Approve or reject pictures
- Add rejection reasons
- Mark pictures as highlights for carousel
- View all approved pictures publicly
- Access approval dashboard

**Restrictions:**
- Cannot upload pictures
- Cannot manage users or organizational structure

## Database Schema

### Organizational Hierarchy

```
District
  └─ Group (many)
      └─ Troupe (many)
          ├─ User (many)
          └─ Patrouille (many)
              └─ Pictures (many)
```

### Core Models

#### District
- `id` - Primary key
- `name` - District name
- `code` - Unique district code
- `groups` - Related groups

#### Group
- `id` - Primary key
- `name` - Group name
- `code` - Unique group code
- `districtId` - Foreign key to District
- `troupes` - Related troupes

#### Troupe
- `id` - Primary key
- `name` - Troupe name
- `code` - Unique troupe code
- `groupId` - Foreign key to Group
- `users` - Related users (Chef Troupe)
- `patrouilles` - Related patrouilles
- `pictures` - Pictures uploaded by this troupe

#### Patrouille
- `id` - Primary key
- `name` - Patrouille name
- `totem` - Patrouille totem (varchar)
- `cri` - Patrouille cry/motto (varchar)
- `troupeId` - Foreign key to Troupe
- `pictures` - Pictures associated with this patrouille

#### User
- `id` - Primary key
- `email` - Unique email
- `password` - Hashed password
- `name` - User's full name
- `role` - Enum: ADMIN | CHEF_TROUPE | BRANCHE_ECLAIREURS
- `troupeId` - Foreign key to Troupe (nullable, only for CHEF_TROUPE)
- `isActive` - Account status
- Relations:
  - `uploadedPictures` - Pictures uploaded by this user
  - `approvedPictures` - Pictures approved by this user
  - `classifiedPictures` - Pictures classified by this user

### Picture Management

#### Picture
- `id` - Primary key
- `title` - Picture title
- `description` - Optional description
- `type` - Enum: INSTALLATION_PHOTO | SCHEMATIC
- `filePath` - Path to uploaded file
- `thumbnailPath` - Path to thumbnail
- `status` - Enum: PENDING | CLASSIFIED | APPROVED | REJECTED
- `uploadedById` - Foreign key to User (uploader)
- `troupeId` - Foreign key to Troupe
- `patrouilleId` - Optional foreign key to Patrouille
- `categoryId` - Foreign key to Category
- `subCategoryId` - Optional foreign key to Category (subcategory)
- `classifiedById` - Foreign key to User (classifier)
- `classifiedAt` - Timestamp of classification
- `approvedById` - Foreign key to User (approver)
- `approvedAt` - Timestamp of approval
- `rejectionReason` - Optional reason for rejection
- `location` - Optional location string
- `latitude` / `longitude` - Optional GPS coordinates
- `isHighlight` - Boolean for carousel display
- `viewCount` - Number of views
- `tags` - Many-to-many with Tag model
- `uploadedAt` - Timestamp of upload

**Status Flow:**
1. `PENDING` - Just uploaded, no classification
2. `CLASSIFIED` - Metadata and categories added
3. `APPROVED` - Approved by Branche Eclaireurs, visible publicly
4. `REJECTED` - Rejected by Branche Eclaireurs

#### Category
- `id` - Primary key
- `name` - Category name
- `description` - Optional description
- `type` - Enum: INSTALLATION_PHOTO | SCHEMATIC
- `parentId` - Optional foreign key to Category (for sub-categories)
- `subcategories` - Related child categories
- `displayOrder` - Order for display
- `monthlyCategories` - Related monthly availability records

#### MonthlyCategory
- `id` - Primary key
- `categoryId` - Foreign key to Category
- `month` - Month number (1-12)
- `year` - Year
- `isActive` - Whether this category is available for upload this month

**Purpose:** Controls which schematic categories can be uploaded each month

#### Tag
- `id` - Primary key
- `name` - Unique tag name
- `pictures` - Many-to-many with Picture

#### Announcement
- `id` - Primary key
- `title` - Announcement title
- `content` - Announcement content/body
- `type` - Enum: NEWS | MONTHLY_UPLOAD | UPCOMING
- `validFrom` - Start date for display
- `validTo` - Optional end date
- `displayOrder` - Order in carousel
- `isActive` - Whether announcement is active

## Picture Upload & Approval Workflow

### 1. Upload (CHEF_TROUPE)
```
User uploads picture → Status: PENDING
  ├─ Select type (INSTALLATION_PHOTO or SCHEMATIC)
  ├─ Provide title
  ├─ Optional: description, location
  ├─ Associate with troupe (automatic)
  └─ Optional: associate with patrouille
```

### 2. Classification (CHEF_TROUPE or BRANCHE_ECLAIREURS)
```
Add metadata → Status: CLASSIFIED
  ├─ Select category
  ├─ Optional: select sub-category
  ├─ Add/edit description
  ├─ Add location data
  ├─ Add tags
  └─ Associate with patrouille if not done
```

### 3. Approval (BRANCHE_ECLAIREURS only)
```
Review picture
  ├─ APPROVE → Status: APPROVED (publicly visible)
  │   └─ Optional: mark as highlight
  └─ REJECT → Status: REJECTED
      └─ Required: rejection reason
```

## Key Features

### Public Browsing (No Authentication Required)
- View all approved pictures
- Filter by:
  - Picture type (photos vs schematics)
  - Group
  - Category/Sub-category
  - Location (if metadata exists)
  - Date range
- Left sidebar showing:
  - Groups with picture counts
  - Categories with picture counts
- Picture detail view with:
  - Full image
  - Metadata
  - Group/Troupe information
  - Associated patrouille

### Landing Page
- Carousel of highlighted pictures
- Current month upload announcements (MONTHLY_UPLOAD type)
- News announcements (NEWS type)
- Upcoming categories (UPCOMING type)

### Chef Troupe Dashboard
- Upload new pictures
- View troupe's pictures (all statuses)
- Edit pending/classified pictures
- View participation by patrouille

### Branche Eclaireurs Dashboard
- Queue of pending/classified pictures
- Approve/reject pictures
- Add classification to unclassified pictures
- Manage highlights
- View approval statistics

### Admin Dashboard
- User management
- Organizational structure management
- Category management
- Monthly category availability
- Announcement management
- System-wide analytics

### Participation Dashboard
**Metrics tracked:**
- Pictures per patrouille
- Pictures per troupe
- Pictures per group
- Pictures per district
- Participation rate (patrouilles with at least 1 picture)
- Monthly trends
- Category distribution

**Accessible by:**
- Chef Troupe: their troupe's data
- Branche Eclaireurs: all data
- Admin: all data

## API Endpoints Structure

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/register` (admin only)
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users
- `GET /api/users` (admin)
- `GET /api/users/:id` (admin)
- `POST /api/users` (admin)
- `PUT /api/users/:id` (admin, own profile)
- `DELETE /api/users/:id` (admin)

### Pictures
- `GET /api/pictures` (public for approved, filtered by status for authenticated)
- `GET /api/pictures/:id`
- `POST /api/pictures` (chef troupe)
- `PUT /api/pictures/:id` (owner or branche)
- `DELETE /api/pictures/:id` (owner or admin)
- `POST /api/pictures/:id/classify` (owner or branche)
- `POST /api/pictures/:id/approve` (branche only)
- `POST /api/pictures/:id/reject` (branche only)
- `POST /api/pictures/:id/highlight` (branche only)

### Categories
- `GET /api/categories`
- `GET /api/categories/:id`
- `POST /api/categories` (admin)
- `PUT /api/categories/:id` (admin)
- `DELETE /api/categories/:id` (admin)
- `GET /api/categories/monthly/:month/:year`
- `POST /api/categories/monthly` (admin)

### Organizational
- `GET /api/districts`
- `GET /api/groups`
- `GET /api/troupes`
- `GET /api/patrouilles`
- CRUD for each (admin only for CUD)

### Announcements
- `GET /api/announcements` (public)
- `GET /api/announcements/:id`
- `POST /api/announcements` (admin)
- `PUT /api/announcements/:id` (admin)
- `DELETE /api/announcements/:id` (admin)

### Analytics
- `GET /api/analytics/participation`
- `GET /api/analytics/participation/troupe/:id`
- `GET /api/analytics/participation/group/:id`
- `GET /api/analytics/pictures/stats`

## File Storage

Pictures should be stored with the following structure:
```
uploads/
  ├── pictures/
  │   ├── YYYY/
  │   │   └── MM/
  │   │       └── {uuid}.{ext}
  └── thumbnails/
      ├── YYYY/
      │   └── MM/
      │       └── {uuid}_thumb.{ext}
```

## Security Considerations

1. **Authentication**: JWT-based authentication
2. **Password Storage**: bcrypt hashing
3. **File Upload**:
   - Validate file types (images only)
   - File size limits
   - Generate unique filenames
   - Scan for malicious content
4. **Authorization**: Middleware to check user roles and ownership
5. **Input Validation**: Validate all inputs
6. **SQL Injection**: Prevented by Prisma ORM
7. **XSS Prevention**: Sanitize user inputs, especially descriptions

## Frontend Structure Recommendations

### Pages
- `/` - Landing page with carousel and announcements
- `/browse` - Picture gallery with filters
- `/picture/:id` - Picture detail view
- `/login` - Login page
- `/dashboard` - Role-based dashboard
- `/upload` - Upload page (chef troupe)
- `/review` - Review queue (branche eclaireurs)
- `/admin` - Admin panel
- `/participation` - Participation dashboard

### Components
- `PictureGallery` - Grid view of pictures
- `PictureCard` - Individual picture display
- `PictureUpload` - Upload form with drag-drop
- `CategoryFilter` - Category/subcategory filter
- `GroupFilter` - Group/troupe filter
- `DateFilter` - Date range picker
- `LocationMap` - Map view of pictures with location
- `Carousel` - Highlight carousel
- `AnnouncementBanner` - Display announcements
- `ParticipationStats` - Dashboard charts
- `ApprovalQueue` - Picture review interface
