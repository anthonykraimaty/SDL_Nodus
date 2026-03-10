import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateToCategorySets() {
  console.log('Starting migration from SchematicCategory to CategorySets...\n');

  // 1. Read all SchematicCategory records
  const schematicCategories = await prisma.schematicCategory.findMany({
    orderBy: [{ setOrder: 'asc' }, { itemOrder: 'asc' }],
  });

  if (schematicCategories.length === 0) {
    console.log('No SchematicCategory records found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${schematicCategories.length} SchematicCategory records.`);

  // 2. Group by setName
  const sets = {};
  for (const sc of schematicCategories) {
    if (!sets[sc.setName]) {
      sets[sc.setName] = { setOrder: sc.setOrder, items: [] };
    }
    sets[sc.setName].items.push(sc);
  }

  console.log(`Found ${Object.keys(sets).length} unique sets.\n`);

  // 3. Build mapping: schematicCategoryId -> categoryId
  const idMapping = {}; // schematicCategoryId -> categoryId
  const unmapped = [];

  for (const [setName, setData] of Object.entries(sets)) {
    // Create CategorySet
    const categorySet = await prisma.categorySet.upsert({
      where: { name: setName },
      update: { displayOrder: setData.setOrder },
      create: { name: setName, displayOrder: setData.setOrder },
    });
    console.log(`Created/updated CategorySet: "${setName}" (id: ${categorySet.id})`);

    for (const item of setData.items) {
      // Find matching Category by name (case-insensitive)
      const category = await prisma.category.findFirst({
        where: {
          name: { equals: item.itemName, mode: 'insensitive' },
        },
      });

      if (!category) {
        unmapped.push({ schematicCategoryId: item.id, setName, itemName: item.itemName });
        console.warn(`  WARNING: No matching Category found for "${item.itemName}" in set "${setName}"`);
        continue;
      }

      idMapping[item.id] = category.id;

      // Create CategorySetItem
      await prisma.categorySetItem.upsert({
        where: {
          categorySetId_categoryId: {
            categorySetId: categorySet.id,
            categoryId: category.id,
          },
        },
        update: { displayOrder: item.itemOrder },
        create: {
          categorySetId: categorySet.id,
          categoryId: category.id,
          displayOrder: item.itemOrder,
        },
      });
      console.log(`  Mapped "${item.itemName}" -> Category id: ${category.id}`);
    }
  }

  // 4. Migrate SchematicProgress -> CategoryProgress
  const progressRecords = await prisma.schematicProgress.findMany();
  console.log(`\nMigrating ${progressRecords.length} SchematicProgress records...`);

  let progressMigrated = 0;
  let progressSkipped = 0;

  for (const progress of progressRecords) {
    const categoryId = idMapping[progress.schematicCategoryId];
    if (!categoryId) {
      progressSkipped++;
      console.warn(`  Skipped progress record id: ${progress.id} (unmapped schematicCategoryId: ${progress.schematicCategoryId})`);
      continue;
    }

    try {
      await prisma.categoryProgress.upsert({
        where: {
          patrouilleId_categoryId: {
            patrouilleId: progress.patrouilleId,
            categoryId,
          },
        },
        update: {
          status: progress.status,
          pictureSetId: progress.pictureSetId,
          completedAt: progress.completedAt,
        },
        create: {
          patrouilleId: progress.patrouilleId,
          categoryId,
          status: progress.status,
          pictureSetId: progress.pictureSetId,
          completedAt: progress.completedAt,
        },
      });
      progressMigrated++;
    } catch (error) {
      progressSkipped++;
      console.warn(`  Failed to migrate progress id: ${progress.id}: ${error.message}`);
    }
  }

  // 5. Update PictureSet.categoryId for schematics that only have schematicCategoryId
  const pictureSetsToUpdate = await prisma.pictureSet.findMany({
    where: {
      schematicCategoryId: { not: null },
      categoryId: null,
    },
  });

  console.log(`\nUpdating ${pictureSetsToUpdate.length} PictureSets with missing categoryId...`);
  let psUpdated = 0;

  for (const ps of pictureSetsToUpdate) {
    const categoryId = idMapping[ps.schematicCategoryId];
    if (categoryId) {
      await prisma.pictureSet.update({
        where: { id: ps.id },
        data: { categoryId },
      });
      psUpdated++;
    }
  }

  // Summary
  console.log('\n=== Migration Summary ===');
  console.log(`CategorySets created: ${Object.keys(sets).length}`);
  console.log(`CategorySetItems created: ${Object.keys(idMapping).length}`);
  console.log(`Unmapped items: ${unmapped.length}`);
  if (unmapped.length > 0) {
    console.log('Unmapped items:');
    unmapped.forEach(u => console.log(`  - "${u.itemName}" in set "${u.setName}"`));
  }
  console.log(`CategoryProgress migrated: ${progressMigrated}, skipped: ${progressSkipped}`);
  console.log(`PictureSets updated: ${psUpdated}`);
  console.log('========================\n');
}

migrateToCategorySets()
  .then(() => {
    console.log('Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
