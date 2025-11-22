import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create Districts
  const districtNord = await prisma.district.upsert({
    where: { code: 'DN' },
    update: {},
    create: {
      name: 'District Nord',
      code: 'DN',
    },
  });

  const districtSud = await prisma.district.upsert({
    where: { code: 'DS' },
    update: {},
    create: {
      name: 'District Sud',
      code: 'DS',
    },
  });

  console.log('Districts created:', { districtNord, districtSud });

  // Create Groups
  const groupCasablanca = await prisma.group.upsert({
    where: { code: 'GC' },
    update: {},
    create: {
      name: 'Groupe Casablanca',
      code: 'GC',
      districtId: districtNord.id,
    },
  });

  const groupRabat = await prisma.group.upsert({
    where: { code: 'GR' },
    update: {},
    create: {
      name: 'Groupe Rabat',
      code: 'GR',
      districtId: districtNord.id,
    },
  });

  const groupMarrakech = await prisma.group.upsert({
    where: { code: 'GM' },
    update: {},
    create: {
      name: 'Groupe Marrakech',
      code: 'GM',
      districtId: districtSud.id,
    },
  });

  console.log('Groups created:', { groupCasablanca, groupRabat, groupMarrakech });

  // Create Troupes
  const troupeEclaireurs = await prisma.troupe.upsert({
    where: { code: 'TE-GC' },
    update: {},
    create: {
      name: 'Troupe Éclaireurs Casablanca',
      code: 'TE-GC',
      groupId: groupCasablanca.id,
    },
  });

  const troupeRabat = await prisma.troupe.upsert({
    where: { code: 'TE-GR' },
    update: {},
    create: {
      name: 'Troupe Éclaireurs Rabat',
      code: 'TE-GR',
      groupId: groupRabat.id,
    },
  });

  console.log('Troupes created:', { troupeEclaireurs, troupeRabat });

  // Hash password for users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nodus.com' },
    update: {},
    create: {
      email: 'admin@nodus.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  console.log('Admin user created:', adminUser.email);

  // Create Branche User (Anthony Kraimaty)
  const brancheUser = await prisma.user.upsert({
    where: { email: 'anthonykraimaty@nodus.com' },
    update: {},
    create: {
      email: 'anthonykraimaty@nodus.com',
      password: hashedPassword,
      name: 'Anthony Kraimaty',
      role: 'BRANCHE_ECLAIREURS',
    },
  });

  console.log('Branche user created:', brancheUser.email);

  // Create Categories
  const categories = [
    { name: 'Mât', type: 'INSTALLATION_PHOTO' },
    { name: "Porte d'entrée", type: 'INSTALLATION_PHOTO' },
    { name: 'Autel', type: 'INSTALLATION_PHOTO' },
    { name: 'Tente', type: 'INSTALLATION_PHOTO' },
    { name: 'Tente sur élevé', type: 'INSTALLATION_PHOTO' },
    { name: 'Tente indienne', type: 'INSTALLATION_PHOTO' },
    { name: 'Hutte', type: 'INSTALLATION_PHOTO' },
    { name: 'Tour', type: 'INSTALLATION_PHOTO' },
    { name: 'Pont', type: 'INSTALLATION_PHOTO' },
    { name: 'Ascenseur', type: 'INSTALLATION_PHOTO' },
    { name: 'Balançoire', type: 'INSTALLATION_PHOTO' },
    { name: 'Bateau', type: 'INSTALLATION_PHOTO' },
    { name: 'Lit', type: 'INSTALLATION_PHOTO' },
    { name: "Tableau d'affichage", type: 'INSTALLATION_PHOTO' },
    { name: 'Banc', type: 'INSTALLATION_PHOTO' },
    { name: 'Table', type: 'INSTALLATION_PHOTO' },
    { name: 'Four', type: 'INSTALLATION_PHOTO' },
    { name: 'Poubelle', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte Fanion', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte Habit', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte linge', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte soulier', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte vaisselle', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte matériel', type: 'INSTALLATION_PHOTO' },
    { name: 'Porte Lanterne', type: 'INSTALLATION_PHOTO' },
    { name: "Zone d'eau", type: 'INSTALLATION_PHOTO' },
    { name: 'Douche', type: 'INSTALLATION_PHOTO' },
    { name: 'Vestiaire', type: 'INSTALLATION_PHOTO' },
    { name: 'Coin de prière', type: 'INSTALLATION_PHOTO' },
    { name: 'Coin de secours', type: 'INSTALLATION_PHOTO' },
    { name: 'Coin de veillée', type: 'INSTALLATION_PHOTO' },
    { name: "Coin d'intendance", type: 'INSTALLATION_PHOTO' },
    { name: 'Coin Morse/Notebook', type: 'INSTALLATION_PHOTO' },
    { name: 'Barrière', type: 'INSTALLATION_PHOTO' },
    { name: 'Toilette', type: 'INSTALLATION_PHOTO' },
    { name: 'Vaisselier', type: 'INSTALLATION_PHOTO' },
    { name: 'Feuillet', type: 'INSTALLATION_PHOTO' },
    { name: 'Cuisine', type: 'INSTALLATION_PHOTO' },
    { name: 'Sentier', type: 'INSTALLATION_PHOTO' },
    { name: 'Feu', type: 'INSTALLATION_PHOTO' },
  ];

  let displayOrder = 0;
  let createdCount = 0;

  for (const category of categories) {
    // Check if category already exists
    const existing = await prisma.category.findFirst({
      where: { name: category.name },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          name: category.name,
          type: category.type,
          displayOrder: displayOrder,
          isSchematicEnabled: true,
        },
      });
      createdCount++;
    }
    displayOrder++;
  }

  console.log(`Created ${createdCount} new categories (${categories.length - createdCount} already existed)`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
