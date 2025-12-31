/**
 * Production Branche Seed Script
 *
 * This script seeds Branche Eclaireurs users.
 * Run this script to add/update Branche users in production:
 *
 *   node prisma/seedBranche.js
 *
 * It will:
 * 1. Create or update Branche users with real names and emails
 * 2. Grant all Branche users access to all districts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Branche users data
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

async function main() {
  console.log('Starting Branche seed...\n');

  // Hash password for users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Get all districts
  const allDistricts = await prisma.district.findMany();
  console.log(`Found ${allDistricts.length} districts\n`);

  let created = 0;
  let updated = 0;

  console.log('Processing Branche users...');
  const createdUsers = [];

  for (const branche of brancheUsers) {
    const email = branche.email.toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Update existing user
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: branche.name,
          role: 'BRANCHE_ECLAIREURS',
        },
      });
      createdUsers.push(updatedUser);
      updated++;
      console.log(`  Updated: ${branche.name} (${email})`);
    } else {
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: branche.name,
          role: 'BRANCHE_ECLAIREURS',
          forcePasswordChange: true,
        },
      });
      createdUsers.push(newUser);
      created++;
      console.log(`  Created: ${branche.name} (${email})`);
    }
  }

  console.log(`\nProcessed ${brancheUsers.length} Branche users:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);

  // Grant access to all districts
  console.log('\nGranting district access...');
  let accessCount = 0;

  for (const user of createdUsers) {
    for (const district of allDistricts) {
      await prisma.userDistrictAccess.upsert({
        where: {
          userId_districtId: {
            userId: user.id,
            districtId: district.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          districtId: district.id,
        },
      });
      accessCount++;
    }
  }

  console.log(`  Granted ${createdUsers.length} users access to ${allDistricts.length} districts (${accessCount} access records)`);

  console.log('\n' + '='.repeat(50));
  console.log('Branche seed completed successfully!');
  console.log('='.repeat(50));
  console.log('\nAll Branche users have password: password123');
  console.log('All new Branche users must change password on first login');
}

main()
  .catch((e) => {
    console.error('Error during Branche seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
