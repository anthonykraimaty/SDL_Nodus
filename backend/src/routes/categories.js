import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/categories - Get all categories
router.get('/', async (req, res) => {
  try {
    const { type, parentId } = req.query;

    const where = {};
    if (type) where.type = type;
    if (parentId) where.parentId = parentId === 'null' ? null : parseInt(parentId);

    const categories = await prisma.category.findMany({
      where,
      include: {
        subcategories: true,
        _count: {
          select: { pictureSets: true },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/monthly/all/:month/:year - Get all categories with monthly status (admin only)
// This must come BEFORE the /monthly/:month/:year route to avoid route conflict
router.get('/monthly/all/:month/:year', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    // Get all categories
    const categories = await prisma.category.findMany({
      where: {
        parentId: null, // Only root categories
      },
      include: {
        subcategories: true,
        monthlyCategories: {
          where: {
            month,
            year,
          },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Transform to include isEnabledThisMonth flag
    const categoriesWithStatus = categories.map(category => ({
      ...category,
      isEnabledThisMonth: category.monthlyCategories.length > 0 && category.monthlyCategories[0].isActive,
    }));

    res.json(categoriesWithStatus);
  } catch (error) {
    console.error('Get categories with monthly status error:', error);
    res.status(500).json({ error: 'Failed to fetch categories with monthly status' });
  }
});

// GET /api/categories/monthly/:month/:year - Get available categories for month
router.get('/monthly/:month/:year', async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const monthlyCategories = await prisma.monthlyCategory.findMany({
      where: {
        month,
        year,
        isActive: true,
      },
      include: {
        category: {
          include: {
            subcategories: true,
          },
        },
      },
    });

    res.json(monthlyCategories.map(mc => mc.category));
  } catch (error) {
    console.error('Get monthly categories error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly categories' });
  }
});

// POST /api/categories - Create category (admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, description, type, parentId, displayOrder } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        type,
        parentId: parentId ? parseInt(parentId) : null,
        displayOrder: displayOrder || 0,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Update category (admin only)
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type, parentId, displayOrder } = req.body;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;
    if (parentId !== undefined) {
      updateData.parentId = parentId ? parseInt(parentId) : null;
    }
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;

    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        subcategories: true,
        parent: true,
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Delete category (admin only)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: {
        subcategories: true,
        _count: {
          select: { pictureSets: true },
        },
      },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has subcategories
    if (existingCategory.subcategories.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category with subcategories. Delete subcategories first.'
      });
    }

    // Check if category has pictures
    if (existingCategory._count.pictureSets > 0) {
      return res.status(400).json({
        error: `Cannot delete category with ${existingCategory._count.pictureSets} picture(s). Remove or reassign pictures first.`
      });
    }

    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// PATCH /api/categories/:id/schematic - Toggle schematic enabled status (admin only)
router.patch('/:id/schematic', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isSchematicEnabled } = req.body;

    if (typeof isSchematicEnabled !== 'boolean') {
      return res.status(400).json({ error: 'isSchematicEnabled must be a boolean' });
    }

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Update schematic enabled status
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { isSchematicEnabled },
      include: {
        subcategories: true,
        _count: {
          select: { pictureSets: true },
        },
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Toggle schematic error:', error);
    res.status(500).json({ error: 'Failed to toggle schematic status' });
  }
});

// POST /api/categories/monthly - Enable category for a month (admin only)
router.post('/monthly', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { categoryId, month, year } = req.body;

    if (!categoryId || !month || !year) {
      return res.status(400).json({ error: 'Category ID, month, and year are required' });
    }

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Create or update monthly category
    const monthlyCategory = await prisma.monthlyCategory.upsert({
      where: {
        categoryId_month_year: {
          categoryId: parseInt(categoryId),
          month: parseInt(month),
          year: parseInt(year),
        },
      },
      update: {
        isActive: true,
      },
      create: {
        categoryId: parseInt(categoryId),
        month: parseInt(month),
        year: parseInt(year),
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    res.status(201).json(monthlyCategory);
  } catch (error) {
    console.error('Enable monthly category error:', error);
    res.status(500).json({ error: 'Failed to enable monthly category' });
  }
});

// DELETE /api/categories/monthly - Disable category for a month (admin only)
router.delete('/monthly', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { categoryId, month, year } = req.body;

    if (!categoryId || !month || !year) {
      return res.status(400).json({ error: 'Category ID, month, and year are required' });
    }

    // Set isActive to false instead of deleting
    const monthlyCategory = await prisma.monthlyCategory.updateMany({
      where: {
        categoryId: parseInt(categoryId),
        month: parseInt(month),
        year: parseInt(year),
      },
      data: {
        isActive: false,
      },
    });

    res.json({ message: 'Monthly category disabled successfully' });
  } catch (error) {
    console.error('Disable monthly category error:', error);
    res.status(500).json({ error: 'Failed to disable monthly category' });
  }
});

export default router;
