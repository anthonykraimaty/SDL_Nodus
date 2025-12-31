import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { districts, groupsData, troupesData, patrouillesData, categories } from './seedData.js';
import { ctData } from './ctData.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...\n');

  // Hash passwords for different user types
  const ctPassword = await bcrypt.hash('password123', 10);
  const branchePassword = await bcrypt.hash('branche123', 10);
  const adminPassword = await bcrypt.hash('password123', 10);

  // 1. Create Districts
  console.log('Creating districts...');
  const districtMap = new Map();
  for (const district of districts) {
    const created = await prisma.district.upsert({
      where: { code: district.code },
      update: { name: district.name },
      create: { name: district.name, code: district.code },
    });
    districtMap.set(district.id, created.id);
  }
  console.log(`  Created ${districts.length} districts\n`);

  // 2. Create Groups
  console.log('Creating groups...');
  const groupMap = new Map();

  for (const group of groupsData) {
    const districtId = districtMap.get(group.districtId);
    const code = `G${group.id.toString().padStart(3, '0')}`;

    const created = await prisma.group.upsert({
      where: { code },
      update: { name: group.name, districtId },
      create: { name: group.name, code, districtId },
    });
    groupMap.set(group.id, created.id);
  }
  console.log(`  Created ${groupsData.length} groups\n`);

  // 3. Create Troupes
  console.log('Creating troupes...');
  const troupeMap = new Map();

  for (const troupe of troupesData) {
    const groupId = groupMap.get(troupe.groupId);
    const code = `T${troupe.id.toString().padStart(3, '0')}`;

    // Use troupe name if provided, otherwise use group name
    const troupeName = troupe.name || troupe.groupName;

    const created = await prisma.troupe.upsert({
      where: { code },
      update: { name: troupeName, groupId },
      create: { name: troupeName, code, groupId },
    });
    troupeMap.set(troupe.id, created.id);
  }
  console.log(`  Created ${troupesData.length} troupes\n`);

  // 4. Create Patrouilles
  console.log('Creating patrouilles...');
  let patrouilleCount = 0;

  // Track which troupes have patrouilles in the seed data
  const troupesWithPatrouilles = new Set(patrouillesData.map(p => p.troupeId));

  for (const patrouille of patrouillesData) {
    const troupeId = troupeMap.get(patrouille.troupeId);
    if (!troupeId) continue;

    // Check if patrouille already exists
    const existing = await prisma.patrouille.findFirst({
      where: {
        totem: patrouille.totem,
        troupeId: troupeId,
      },
    });

    if (!existing) {
      await prisma.patrouille.create({
        data: {
          name: patrouille.totem, // Use totem as name
          totem: patrouille.totem,
          cri: patrouille.cri || '',
          troupeId: troupeId,
        },
      });
      patrouilleCount++;
    }
  }

  // Create placeholder patrouilles for troupes that don't have any
  console.log('Creating placeholder patrouilles for troupes without any...');
  let placeholderCount = 0;
  const defaultPatrouilles = [
    { totem: 'Aigle', cri: 'Plus Haut' },
    { totem: 'Lion', cri: 'Courageux' },
    { totem: 'Loup', cri: 'Fidele' },
    { totem: 'Renard', cri: 'Ruse' },
  ];

  for (const [originalTroupeId, dbTroupeId] of troupeMap) {
    // Skip if this troupe already has patrouilles in the seed data
    if (troupesWithPatrouilles.has(originalTroupeId)) continue;

    // Check if troupe already has patrouilles in the database
    const existingPatrouilles = await prisma.patrouille.count({
      where: { troupeId: dbTroupeId },
    });

    if (existingPatrouilles === 0) {
      // Create 4 default patrouilles for this troupe
      for (const defaultP of defaultPatrouilles) {
        await prisma.patrouille.create({
          data: {
            name: defaultP.totem,
            totem: defaultP.totem,
            cri: defaultP.cri,
            troupeId: dbTroupeId,
          },
        });
        placeholderCount++;
      }
    }
  }

  console.log(`  Created ${patrouilleCount} patrouilles from seed data`);
  console.log(`  Created ${placeholderCount} placeholder patrouilles for ${placeholderCount / 4} troupes\n`);

  // 5. Create Admin User
  console.log('Creating users...');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nodus.com' },
    update: {},
    create: {
      email: 'admin@nodus.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
      forcePasswordChange: false,
    },
  });
  console.log(`  Admin: ${adminUser.email}`);

  // 6. Create Branche Users
  const brancheUsers = [
    { name: 'Anthony Kraimaty', email: 'anthonykraimaty@gmail.com' },
    { name: 'Marc Akiki', email: 'marcakiki23@gmail.com' },
    { name: 'Charbel Adas', email: 'charbeladas@gmail.com' },
    { name: 'Jean Paul Khairallah', email: 'jpkhairallah.jpk@gmail.com' },
    { name: 'Jean-Marie Sabbak', email: 'jeanmariesabbak@gmail.com' },
    { name: 'Michel Saloumi', email: 'michelsaloumi@gmail.com' },
    { name: 'Maroun Kraimaty', email: 'marounkraimaty@gmail.com' },
    { name: 'Joseph Mardikian', email: 'josephkmardikian@gmail.com' },
    { name: 'Paul Imad', email: 'imadpaul30@gmail.com' },
    { name: 'Anthony Bassil', email: 'anthonybassil9@gmail.com' },
    { name: 'Christian Breidy', email: 'kikobreidy@gmail.com' },
    { name: 'Simon Farah', email: 'farahsimon22@gmail.com' },
    { name: 'Charbel Al Alam', email: 'charbelpalam@gmail.com' },
    { name: 'Johnny Saad', email: 'johnnyhsaad@gmail.com' },
    { name: 'Gilbert Pharaon', email: 'gilbert.s.pharaon@gmail.com' },
    { name: 'Joseph Nohra', email: 'josephnohra2004@gmail.com' },
  ];

  console.log('Creating Branche users...');
  const createdBrancheUsers = [];

  for (const branche of brancheUsers) {
    const brancheUser = await prisma.user.upsert({
      where: { email: branche.email.toLowerCase() },
      update: { name: branche.name, role: 'BRANCHE_ECLAIREURS' },
      create: {
        email: branche.email.toLowerCase(),
        password: branchePassword,
        name: branche.name,
        role: 'BRANCHE_ECLAIREURS',
        forcePasswordChange: true,
      },
    });
    createdBrancheUsers.push(brancheUser);
    console.log(`  Branche: ${brancheUser.email}`);
  }

  // Give all branche users access to all districts
  for (const brancheUser of createdBrancheUsers) {
    for (const [, districtId] of districtMap) {
      await prisma.userDistrictAccess.upsert({
        where: {
          userId_districtId: {
            userId: brancheUser.id,
            districtId: districtId,
          },
        },
        update: {},
        create: {
          userId: brancheUser.id,
          districtId: districtId,
        },
      });
    }
  }
  console.log(`  Granted ${createdBrancheUsers.length} branche users access to all ${districtMap.size} districts\n`);

  // 7. Create Chef Troupe users using real CT data from Excel
  console.log('Creating Chef Troupe users...');
  let chefTroupeCount = 0;
  let chefTroupeMatchedCount = 0;
  const troupesWithCT = new Set();

  // First, try to match CT data with troupes by group name and troupe name
  for (const ct of ctData) {
    // Find the group by name (fuzzy match)
    const group = await prisma.group.findFirst({
      where: {
        name: {
          contains: ct.groupe.split(',')[0].trim(), // Match first part of group name
        },
      },
    });

    if (!group) {
      console.log(`    Warning: Group not found for CT ${ct.name} (${ct.groupe})`);
      continue;
    }

    // Find the troupe in this group
    const troupe = await prisma.troupe.findFirst({
      where: {
        groupId: group.id,
        name: {
          contains: ct.troupe.replace('Troupe ', '').trim(),
        },
      },
    });

    if (!troupe) {
      // Try exact match
      const troupeExact = await prisma.troupe.findFirst({
        where: {
          groupId: group.id,
        },
      });

      if (troupeExact && !troupesWithCT.has(troupeExact.id)) {
        // Use the first troupe in the group if no exact match
        const existing = await prisma.user.findUnique({
          where: { email: ct.email.toLowerCase() },
        });

        if (!existing) {
          await prisma.user.create({
            data: {
              email: ct.email.toLowerCase(),
              password: ctPassword,
              name: ct.name,
              role: 'CHEF_TROUPE',
              troupeId: troupeExact.id,
              forcePasswordChange: true,
            },
          });
          troupesWithCT.add(troupeExact.id);
          chefTroupeMatchedCount++;
        }
      }
      continue;
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: ct.email.toLowerCase() },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          email: ct.email.toLowerCase(),
          password: ctPassword,
          name: ct.name,
          role: 'CHEF_TROUPE',
          troupeId: troupe.id,
          forcePasswordChange: true,
        },
      });
      troupesWithCT.add(troupe.id);
      chefTroupeMatchedCount++;
    }
  }

  console.log(`  Created ${chefTroupeMatchedCount} Chef Troupe users from CT data`);

  // Create placeholder users for troupes that don't have a CT assigned
  for (const [originalTroupeId, dbTroupeId] of troupeMap) {
    if (troupesWithCT.has(dbTroupeId)) continue;

    // Check if troupe already has a CT user
    const existingCT = await prisma.user.findFirst({
      where: {
        troupeId: dbTroupeId,
        role: 'CHEF_TROUPE',
      },
    });

    if (existingCT) continue;

    // Generate a placeholder email based on troupe code
    const troupeCode = `T${originalTroupeId.toString().padStart(3, '0')}`;
    const email = `ct.${troupeCode.toLowerCase()}@nodus.temp`;

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          email: email,
          password: ctPassword,
          name: 'CT Placeholder', // Default name - to be filled later
          role: 'CHEF_TROUPE',
          troupeId: dbTroupeId,
          forcePasswordChange: true,
        },
      });
      chefTroupeCount++;
    }
  }
  console.log(`  Created ${chefTroupeCount} placeholder Chef Troupe users for remaining troupes\n`);

  // 8. Create Categories
  console.log('Creating categories...');
  let categoryCount = 0;

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const existing = await prisma.category.findFirst({
      where: { name: category.name },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          name: category.name,
          type: category.type,
          displayOrder: i,
          isSchematicEnabled: true,
        },
      });
      categoryCount++;
    }
  }
  console.log(`  Created ${categoryCount} categories\n`);

  console.log('='.repeat(50));
  console.log('Seed completed successfully!');
  console.log('='.repeat(50));
  console.log('\nDefault credentials:');
  console.log('  Admin: admin@nodus.com / password123');
  console.log('  Branche: 16 users with real emails / branche123');
  console.log('  Chef Troupe: Real emails from CT.xlsx or ct.txxx@nodus.temp / password123');
  console.log('  All Branche and CT users have forcePasswordChange: true');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
