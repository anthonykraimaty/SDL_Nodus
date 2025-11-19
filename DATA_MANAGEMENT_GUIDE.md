# Data Management System - User Guide

This guide explains how to use the comprehensive data management system with Excel import functionality for managing Users, Districts, Troupes, and Patrouilles in Nodus.

## Table of Contents
1. [Overview](#overview)
2. [Admin Pages](#admin-pages)
3. [Excel Import Format](#excel-import-format)
4. [Step-by-Step Workflows](#step-by-step-workflows)
5. [API Endpoints](#api-endpoints)

---

## Overview

The data management system provides four dedicated admin pages with full CRUD (Create, Read, Update, Delete) operations and bulk Excel import functionality:

- **Districts** - Top-level organizational units
- **Troupes** - Scout troops within groups
- **Patrouilles** - Scout patrols within troupes
- **Users** - System users with role assignments

### Key Features

- **Manual CRUD**: Create, edit, and delete individual records through user-friendly modals
- **Excel Import**: Bulk import data from Excel spreadsheets
- **Import Preview**: Review data before importing with error highlighting
- **Template Download**: Get pre-formatted Excel templates for each entity
- **Smart Matching**: Import process automatically matches existing records by code/name
- **Validation**: Comprehensive validation with detailed error reporting

---

## Admin Pages

### 1. Districts Management (`/admin/districts`)

Manage geographic districts that contain groups.

**Fields:**
- `Name` - District name (e.g., "Vieux Bruxelles")
- `Code` - Unique identifier (e.g., "VB")

**Features:**
- View all districts with group counts
- Create/Edit/Delete individual districts
- Bulk import from Excel
- Download Excel template

### 2. Troupes Management (`/admin/troupes`)

Manage scout troupes within groups and districts.

**Fields:**
- `Name` - Troupe name (e.g., "Troupe Saint-Georges")
- `Code` - Unique identifier (e.g., "TSG")
- `Group` - Parent group (dropdown selection)

**Features:**
- View all troupes with hierarchy (District > Group > Troupe)
- See patrouille and user counts per troupe
- Create/Edit/Delete individual troupes
- Bulk import from Excel (auto-creates missing groups)
- Download Excel template

### 3. Patrouilles Management (`/admin/patrouilles`)

Manage scout patrols within troupes.

**Fields:**
- `Name` - Patrouille name (e.g., "Renards")
- `Totem` - Patrol totem (e.g., "Renard Rusé")
- `Cri` - Patrol cry (e.g., "Ouah!")
- `Troupe` - Parent troupe (dropdown selection)

**Features:**
- View all patrouilles with full hierarchy
- See picture count per patrouille
- Create/Edit/Delete individual patrouilles
- Bulk import from Excel
- Download Excel template

### 4. Users Management (`/admin/users`)

Manage system users with updated Excel import.

**Fields:**
- `Name` - User's full name
- `Email` - Login email (must be unique)
- `Password` - User password
- `Role` - ADMIN, CHEF_TROUPE, or BRANCHE_ECLAIREURS
- `District/Group/Troupe` - Organizational assignment (required for CHEF_TROUPE)

**Features:**
- View all users with role badges
- Create/Edit/Delete individual users
- Bulk import from Excel with troupe validation
- Download Excel template
- Special handling for missing troupes (warns before import)

---

## Excel Import Format

### Districts Template

| Name              | Code    |
|-------------------|---------|
| Vieux Bruxelles   | VB      |
| Another District  | AN_DIST |

**Required Fields:**
- Name
- Code (must be unique)

### Troupes Template

| Name              | Code     | District        | Group   |
|-------------------|----------|-----------------|---------|
| Example Troupe    | EX_TROOP | Vieux Bruxelles | Group A |
| Another Troupe    | AN_TROOP | VB              | Group B |

**Required Fields:**
- Name
- Code (must be unique)
- District (name or code)
- Group (name or code)

**Notes:**
- Districts are matched by name or code
- Groups are auto-created if they don't exist
- Existing troupes are updated based on code

### Patrouilles Template

| Name    | Totem         | Cri     | Troupe |
|---------|---------------|---------|--------|
| Renards | Renard Rusé   | Ouah!   | TSG    |
| Aigles  | Aigle Royal   | Caaaw!  | TSG    |

**Required Fields:**
- Name
- Totem
- Cri
- Troupe (name or code)

**Notes:**
- Troupes are matched by name or code
- Existing patrouilles in same troupe are updated by name

### Users Template

| Name       | Email              | Password    | Role         | District        | Group   | Troupe              |
|------------|--------------------|-------------|--------------|-----------------|---------|---------------------|
| John Doe   | john@example.com   | password123 | CHEF_TROUPE  | Vieux Bruxelles | Group A | Troupe Saint-Georges|
| Jane Smith | jane@example.com   | password123 | BRANCHE_ECLAIREURS |           |         |                     |

**Required Fields:**
- Name
- Email (must be unique)
- Password
- Role (ADMIN, CHEF_TROUPE, or BRANCHE_ECLAIREURS)

**Conditional Fields:**
- District, Group, Troupe - Required for CHEF_TROUPE role

**Notes:**
- Passwords are automatically hashed
- Users with duplicate emails are skipped
- If troupe doesn't exist, user is skipped with warning

---

## Step-by-Step Workflows

### Workflow 1: Initial System Setup (Recommended Order)

1. **Import Districts**
   - Download template from `/admin/districts`
   - Fill in your districts
   - Upload and review preview
   - Confirm import

2. **Import Troupes**
   - Download template from `/admin/troupes`
   - Fill in troupes with District and Group info
   - Upload (Groups will be auto-created)
   - Confirm import

3. **Import Patrouilles**
   - Download template from `/admin/patrouilles`
   - Fill in patrouilles with Troupe info
   - Upload
   - Confirm import

4. **Import Users**
   - Download template from `/admin/users`
   - Fill in user details with organizational assignments
   - Upload
   - Review any warnings about missing troupes
   - Confirm import

### Workflow 2: Adding a New District with Full Hierarchy

1. Create district via `/admin/districts` (manual or import)
2. Create troupes for that district via `/admin/troupes`
3. Create patrouilles for those troupes via `/admin/patrouilles`
4. Create users assigned to those troupes via `/admin/users`

### Workflow 3: Bulk Update Existing Data

1. Navigate to relevant admin page
2. Download current template (shows expected format)
3. Create Excel with updates (use existing codes to update)
4. Import - system will update matching records
5. Review import results

---

## API Endpoints

### Districts

- `GET /api/districts` - List all districts (ADMIN only)
- `GET /api/districts/:id` - Get single district (ADMIN only)
- `POST /api/districts` - Create district (ADMIN only)
- `PUT /api/districts/:id` - Update district (ADMIN only)
- `DELETE /api/districts/:id` - Delete district (ADMIN only)
- `POST /api/districts/import` - Bulk import (ADMIN only)

### Troupes

- `GET /api/troupes` - List all troupes (ADMIN only)
- `GET /api/troupes/:id` - Get single troupe (ADMIN only)
- `POST /api/troupes` - Create troupe (ADMIN only)
- `PUT /api/troupes/:id` - Update troupe (ADMIN only)
- `DELETE /api/troupes/:id` - Delete troupe (ADMIN only)
- `POST /api/troupes/import` - Bulk import (ADMIN only)

### Patrouilles

- `GET /api/patrouilles` - List all patrouilles (ADMIN only)
- `GET /api/patrouilles/:id` - Get single patrouille (ADMIN only)
- `POST /api/patrouilles` - Create patrouille (ADMIN only)
- `PUT /api/patrouilles/:id` - Update patrouille (ADMIN only)
- `DELETE /api/patrouilles/:id` - Delete patrouille (ADMIN only)
- `POST /api/patrouilles/import` - Bulk import (ADMIN only)

### Users

- `GET /api/admin/users` - List all users (ADMIN only)
- `POST /api/admin/users` - Create user (ADMIN only)
- `PUT /api/admin/users/:id` - Update user (ADMIN only)
- `DELETE /api/admin/users/:id` - Delete user (ADMIN only)
- `POST /api/admin/users/import` - Bulk import (ADMIN only)

---

## Import Response Format

All import endpoints return a consistent response:

```json
{
  "message": "Processed X items",
  "success": 10,
  "errors": 2,
  "troupesNeeded": 1,  // Only for users import
  "details": {
    "success": [
      {
        "row": 2,
        "action": "created",
        "item": { /* created/updated item */ }
      }
    ],
    "errors": [
      {
        "row": 5,
        "data": { /* original row data */ },
        "error": "Error message"
      }
    ],
    "troupesNeeded": [  // Only for users import
      {
        "row": 8,
        "data": { /* original row data */ },
        "message": "Troupe 'TSG' not found",
        "suggestion": "Please create troupe: VB > Group A > TSG"
      }
    ]
  }
}
```

---

## Tips and Best Practices

1. **Always download templates first** - They show the exact format expected
2. **Use the preview feature** - Review your data before confirming import
3. **Check the console** - Detailed error information is logged to browser console
4. **Follow the recommended order** - Import districts → troupes → patrouilles → users
5. **Use codes wisely** - Codes are unique identifiers and case-sensitive
6. **Backup before bulk operations** - Database backups recommended before large imports
7. **Incremental imports** - Better to import in smaller batches for easier error handling

---

## Troubleshooting

### Issue: Import shows validation errors

**Solution:** Check the preview table for rows highlighted in red. Missing required fields are marked with "Missing" text.

### Issue: Troupe not found during user import

**Solution:** Either create the troupe first via `/admin/troupes`, or check the troupe code/name spelling in your Excel file.

### Issue: Duplicate code error

**Solution:** Codes must be unique system-wide. Check existing records or use a different code.

### Issue: Cannot delete district/troupe

**Solution:** Remove all child records first (groups, troupes, users, patrouilles) before deleting parent records.

---

## Support

For technical issues or questions:
1. Check browser console for detailed error messages
2. Review this guide's relevant sections
3. Check the ARCHITECTURE.md file for database schema details
4. Contact system administrator

---

**Last Updated:** 2025-11-19
**Version:** 1.0
