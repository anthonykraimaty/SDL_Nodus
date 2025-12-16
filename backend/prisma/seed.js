import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { districts, groupsData, troupesData, patrouillesData, categories } from './seedData.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...\n');

  // Hash password for users
  const hashedPassword = await bcrypt.hash('password123', 10);

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
  console.log(`  Created ${patrouilleCount} patrouilles\n`);

  // 5. Create Admin User
  console.log('Creating users...');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nodus.com' },
    update: {},
    create: {
      email: 'admin@nodus.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
      forcePasswordChange: false,
    },
  });
  console.log(`  Admin: ${adminUser.email}`);

  // 6. Create Branche User (Anthony Kraimaty)
  const brancheUser = await prisma.user.upsert({
    where: { email: 'anthonykraimaty@nodus.com' },
    update: {},
    create: {
      email: 'anthonykraimaty@nodus.com',
      password: hashedPassword,
      name: 'Anthony Kraimaty',
      role: 'BRANCHE_ECLAIREURS',
      forcePasswordChange: false,
    },
  });
  console.log(`  Branche: ${brancheUser.email}`);

  // Give branche user access to all districts
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
  console.log(`  Granted branche user access to all ${districtMap.size} districts\n`);

  // 7. Create Chef Troupe users for each troupe
  console.log('Creating Chef Troupe users...');
  let chefTroupeCount = 0;

  for (const [originalTroupeId, dbTroupeId] of troupeMap) {
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
          password: hashedPassword,
          name: 'CT CT', // Default name - to be changed on first login
          role: 'CHEF_TROUPE',
          troupeId: dbTroupeId,
          forcePasswordChange: true, // Force password change on first login
        },
      });
      chefTroupeCount++;
    }
  }
  console.log(`  Created ${chefTroupeCount} Chef Troupe users\n`);

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
  console.log('  Branche: anthonykraimaty@nodus.com / password123');
  console.log('  Chef Troupe: ct.t001@nodus.temp / password123 (forcePasswordChange: true)');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
