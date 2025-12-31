/**
 * Production CT Seed Script
 *
 * This script seeds Chef Troupe users from the CT data.
 * Run this script to update CT users in production:
 *
 *   node prisma/seedCTs.js
 *
 * It will:
 * 1. Match CT data to existing troupes by group and troupe name
 * 2. Create CT users with real names and emails
 * 3. Create placeholder users for troupes without CT data
 * 4. Delete old placeholder CT users (ct.txxx@nodus.temp) that have been replaced
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ctData } from './ctData.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting CT seed...\n');

  // Hash password for users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Get all districts for lookup
  const allDistricts = await prisma.district.findMany();
  const districtByCode = new Map(allDistricts.map(d => [d.code, d]));

  // Get all groups
  const allGroups = await prisma.group.findMany({
    include: { district: true },
  });

  // Get all troupes
  const allTroupes = await prisma.troupe.findMany({
    include: {
      group: {
        include: { district: true },
      },
    },
  });

  console.log(`Found ${allDistricts.length} districts, ${allGroups.length} groups, ${allTroupes.length} troupes\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  const troupesWithCT = new Set();
  const processedEmails = new Set();

  // Process CT data
  console.log('Processing CT data...');
  for (const ct of ctData) {
    // Skip duplicate emails
    if (processedEmails.has(ct.email.toLowerCase())) {
      console.log(`  Skipping duplicate email: ${ct.email}`);
      skipped++;
      continue;
    }
    processedEmails.add(ct.email.toLowerCase());

    // Find district by code
    const district = districtByCode.get(ct.district);
    if (!district) {
      console.log(`  Warning: District ${ct.district} not found for CT ${ct.name}`);
      notFound++;
      continue;
    }

    // Find group by name in district
    const group = allGroups.find(g =>
      g.districtId === district.id &&
      (g.name.includes(ct.groupe.split(',')[0].trim()) ||
       ct.groupe.includes(g.name.split(',')[0].trim()))
    );

    if (!group) {
      console.log(`  Warning: Group "${ct.groupe}" not found in district ${ct.district} for CT ${ct.name}`);
      notFound++;
      continue;
    }

    // Find troupe by name in group
    const troupeName = ct.troupe.replace(/^Troupe\s+/i, '').trim();
    let troupe = allTroupes.find(t =>
      t.groupId === group.id &&
      (t.name.toLowerCase().includes(troupeName.toLowerCase()) ||
       troupeName.toLowerCase().includes(t.name.replace(/^Troupe\s+/i, '').toLowerCase()))
    );

    // If no match, try to find any troupe in the group
    if (!troupe) {
      troupe = allTroupes.find(t => t.groupId === group.id && !troupesWithCT.has(t.id));
    }

    if (!troupe) {
      console.log(`  Warning: Troupe "${ct.troupe}" not found in group "${group.name}" for CT ${ct.name}`);
      notFound++;
      continue;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ct.email.toLowerCase() },
    });

    if (existingUser) {
      // Update existing user
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: ct.name,
          troupeId: troupe.id,
          role: 'CHEF_TROUPE',
        },
      });
      troupesWithCT.add(troupe.id);
      updated++;
      console.log(`  Updated: ${ct.name} (${ct.email}) -> ${troupe.name}`);
    } else {
      // Create new user
      await prisma.user.create({
        data: {
          email: ct.email.toLowerCase(),
          password: hashedPassword,
          name: ct.name,
          role: 'CHEF_TROUPE',
          troupeId: troupe.id,
          forcePasswordChange: true,
        },
      });
      troupesWithCT.add(troupe.id);
      created++;
      console.log(`  Created: ${ct.name} (${ct.email}) -> ${troupe.name}`);
    }
  }

  console.log(`\nProcessed ${ctData.length} CT entries:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Not found (group/troupe): ${notFound}`);

  // Delete old placeholder users that have been replaced
  console.log('\nCleaning up old placeholder users...');
  const oldPlaceholders = await prisma.user.findMany({
    where: {
      email: { endsWith: '@nodus.temp' },
      troupeId: { in: Array.from(troupesWithCT) },
    },
  });

  for (const oldUser of oldPlaceholders) {
    await prisma.user.delete({ where: { id: oldUser.id } });
    console.log(`  Deleted placeholder: ${oldUser.email}`);
  }
  console.log(`  Deleted ${oldPlaceholders.length} old placeholder users`);

  // Create placeholder users for troupes without CT
  console.log('\nCreating placeholder users for troupes without CT...');
  let placeholderCount = 0;

  for (const troupe of allTroupes) {
    if (troupesWithCT.has(troupe.id)) continue;

    // Check if troupe already has a CT user
    const existingCT = await prisma.user.findFirst({
      where: {
        troupeId: troupe.id,
        role: 'CHEF_TROUPE',
      },
    });

    if (existingCT) continue;

    // Generate placeholder email
    const email = `ct.t${troupe.id.toString().padStart(3, '0')}@nodus.temp`;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: 'CT Placeholder',
          role: 'CHEF_TROUPE',
          troupeId: troupe.id,
          forcePasswordChange: true,
        },
      });
      placeholderCount++;
    }
  }

  console.log(`  Created ${placeholderCount} placeholder CT users`);

  console.log('\n' + '='.repeat(50));
  console.log('CT seed completed successfully!');
  console.log('='.repeat(50));
  console.log('\nAll CT users have password: password123');
  console.log('All CT users must change password on first login');
}

main()
  .catch((e) => {
    console.error('Error during CT seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
