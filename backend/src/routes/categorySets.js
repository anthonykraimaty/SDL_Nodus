import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/category-sets - List all category sets with their items
router.get('/', async (req, res) => {
  try {
    const categorySets = await prisma.categorySet.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                description: true,
                parentId: true,
              },
            },
          },
        },
      },
    });

    res.json(categorySets);
  } catch (error) {
    console.error('Failed to fetch category sets:', error);
    res.status(500).json({ error: 'Failed to fetch category sets' });
  }
});

// GET /api/category-sets/:id - Get single category set
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const categorySet = await prisma.categorySet.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                description: true,
                parentId: true,
              },
            },
          },
        },
      },
    });

    if (!categorySet) {
      return res.status(404).json({ error: 'Category set not found' });
    }

    res.json(categorySet);
  } catch (error) {
    console.error('Failed to fetch category set:', error);
    res.status(500).json({ error: 'Failed to fetch category set' });
  }
});

// POST /api/category-sets - Create category set (admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, displayOrder } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const categorySet = await prisma.categorySet.create({
      data: {
        name: name.trim(),
        displayOrder: displayOrder || 0,
      },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    res.status(201).json(categorySet);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A category set with this name already exists' });
    }
    console.error('Failed to create category set:', error);
    res.status(500).json({ error: 'Failed to create category set' });
  }
});

// PUT /api/category-sets/:id - Update category set (admin only)
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayOrder } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;

    const categorySet = await prisma.categorySet.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    res.json(categorySet);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category set not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A category set with this name already exists' });
    }
    console.error('Failed to update category set:', error);
    res.status(500).json({ error: 'Failed to update category set' });
  }
});

// DELETE /api/category-sets/:id - Delete category set (admin only)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.categorySet.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Category set deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category set not found' });
    }
    console.error('Failed to delete category set:', error);
    res.status(500).json({ error: 'Failed to delete category set' });
  }
});

// POST /api/category-sets/:id/items - Add category to set (admin only)
router.post('/:id/items', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, displayOrder } = req.body;

    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    // Validate category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) },
    });
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }

    // Validate set exists
    const categorySet = await prisma.categorySet.findUnique({
      where: { id: parseInt(id) },
    });
    if (!categorySet) {
      return res.status(404).json({ error: 'Category set not found' });
    }

    const item = await prisma.categorySetItem.create({
      data: {
        categorySetId: parseInt(id),
        categoryId: parseInt(categoryId),
        displayOrder: displayOrder || 0,
      },
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    res.status(201).json(item);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'This category is already in this set' });
    }
    console.error('Failed to add item to category set:', error);
    res.status(500).json({ error: 'Failed to add item to category set' });
  }
});

// DELETE /api/category-sets/:id/items/:categoryId - Remove category from set (admin only)
router.delete('/:id/items/:categoryId', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id, categoryId } = req.params;

    await prisma.categorySetItem.delete({
      where: {
        categorySetId_categoryId: {
          categorySetId: parseInt(id),
          categoryId: parseInt(categoryId),
        },
      },
    });

    res.json({ message: 'Category removed from set' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Item not found in this set' });
    }
    console.error('Failed to remove item from category set:', error);
    res.status(500).json({ error: 'Failed to remove item from category set' });
  }
});

// PUT /api/category-sets/:id/items - Bulk update item order (admin only)
router.put('/:id/items', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const items = req.body; // [{ categoryId, displayOrder }]

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Expected array of items' });
    }

    // Update each item's displayOrder
    await prisma.$transaction(
      items.map(item =>
        prisma.categorySetItem.update({
          where: {
            categorySetId_categoryId: {
              categorySetId: parseInt(id),
              categoryId: parseInt(item.categoryId),
            },
          },
          data: { displayOrder: item.displayOrder },
        })
      )
    );

    // Return updated set
    const categorySet = await prisma.categorySet.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    res.json(categorySet);
  } catch (error) {
    console.error('Failed to update item order:', error);
    res.status(500).json({ error: 'Failed to update item order' });
  }
});

export default router;
