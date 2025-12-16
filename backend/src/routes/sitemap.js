import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const BASE_URL = process.env.CLIENT_URL || 'https://nodus.scoutsduliban.org';

// GET /api/sitemap.xml - Generate XML sitemap for SEO
router.get('/sitemap.xml', async (req, res) => {
  try {
    // Get all categories
    const categories = await prisma.category.findMany({
      where: { parentId: null }, // Only parent categories
      select: {
        id: true,
        name: true,
        updatedAt: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Get all approved picture sets for lastmod dates
    const pictureSets = await prisma.pictureSet.findMany({
      where: { status: 'APPROVED' },
      select: {
        id: true,
        categoryId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get unique districts and groups for potential landing pages
    const districts = await prisma.district.findMany({
      select: { id: true, name: true, updatedAt: true },
    });

    const groups = await prisma.group.findMany({
      select: { id: true, name: true, updatedAt: true },
    });

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Browse Page -->
  <url>
    <loc>${BASE_URL}/browse</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

`;

    // Add category pages
    for (const category of categories) {
      const categoryPictures = pictureSets.filter(p => p.categoryId === category.id);
      const lastMod = categoryPictures.length > 0
        ? new Date(Math.max(...categoryPictures.map(p => new Date(p.updatedAt)))).toISOString().split('T')[0]
        : new Date(category.updatedAt).toISOString().split('T')[0];

      sitemap += `  <!-- Category: ${category.name} -->
  <url>
    <loc>${BASE_URL}/category/${category.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

`;
    }

    // Add browse with district filter pages
    for (const district of districts) {
      sitemap += `  <!-- District: ${district.name} -->
  <url>
    <loc>${BASE_URL}/browse?districtId=${district.id}</loc>
    <lastmod>${new Date(district.updatedAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>

`;
    }

    // Add browse with group filter pages
    for (const group of groups) {
      sitemap += `  <!-- Group: ${group.name} -->
  <url>
    <loc>${BASE_URL}/browse?groupId=${group.id}</loc>
    <lastmod>${new Date(group.updatedAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>

`;
    }

    sitemap += `</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Failed to generate sitemap:', error);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
});

// GET /api/robots.txt - Generate robots.txt for SEO
router.get('/robots.txt', (req, res) => {
  const robotsTxt = `# Robots.txt for Nodus - Scouts du Liban
User-agent: *
Allow: /
Allow: /browse
Allow: /category/

# Disallow admin and authenticated pages
Disallow: /admin
Disallow: /admin/*
Disallow: /dashboard
Disallow: /upload
Disallow: /classify
Disallow: /review
Disallow: /login

# Sitemap location
Sitemap: ${BASE_URL}/api/sitemap.xml
`;

  res.set('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

export default router;
