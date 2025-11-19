import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.announcement.deleteMany();
  await prisma.picture.deleteMany();
  await prisma.pictureSet.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.monthlyCategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.patrouille.deleteMany();
  await prisma.troupe.deleteMany();
  await prisma.group.deleteMany();
  await prisma.district.deleteMany();
  console.log('✓ Cleared existing data\n');

  // Create Districts
  console.log('Creating districts...');
  const district1 = await prisma.district.create({
    data: {
      name: 'District Nord',
      code: 'DN',
    },
  });
  const district2 = await prisma.district.create({
    data: {
      name: 'District Sud',
      code: 'DS',
    },
  });
  console.log('✓ Created 2 districts\n');

  // Create Groups
  console.log('Creating groups...');
  const group1 = await prisma.group.create({
    data: {
      name: 'Groupe Casablanca',
      code: 'GC',
      districtId: district1.id,
    },
  });
  const group2 = await prisma.group.create({
    data: {
      name: 'Groupe Rabat',
      code: 'GR',
      districtId: district1.id,
    },
  });
  const group3 = await prisma.group.create({
    data: {
      name: 'Groupe Marrakech',
      code: 'GM',
      districtId: district2.id,
    },
  });
  console.log('✓ Created 3 groups\n');

  // Create Troupes
  console.log('Creating troupes...');
  const troupe1 = await prisma.troupe.create({
    data: {
      name: 'Troupe Aigle',
      code: 'TA',
      groupId: group1.id,
    },
  });
  const troupe2 = await prisma.troupe.create({
    data: {
      name: 'Troupe Lion',
      code: 'TL',
      groupId: group1.id,
    },
  });
  const troupe3 = await prisma.troupe.create({
    data: {
      name: 'Troupe Faucon',
      code: 'TF',
      groupId: group2.id,
    },
  });
  const troupe4 = await prisma.troupe.create({
    data: {
      name: 'Troupe Gazelle',
      code: 'TG',
      groupId: group3.id,
    },
  });
  console.log('✓ Created 4 troupes\n');

  // Create Patrouilles
  console.log('Creating patrouilles...');
  const patrouille1 = await prisma.patrouille.create({
    data: {
      name: 'Patrouille Loups',
      totem: 'Loup Gris',
      cri: 'Aouuuuu!',
      troupeId: troupe1.id,
    },
  });
  const patrouille2 = await prisma.patrouille.create({
    data: {
      name: 'Patrouille Aigles',
      totem: 'Aigle Royal',
      cri: 'Kiaaa!',
      troupeId: troupe1.id,
    },
  });
  const patrouille3 = await prisma.patrouille.create({
    data: {
      name: 'Patrouille Panthers',
      totem: 'Panthère Noire',
      cri: 'Grrrr!',
      troupeId: troupe2.id,
    },
  });
  const patrouille4 = await prisma.patrouille.create({
    data: {
      name: 'Patrouille Renards',
      totem: 'Renard Rusé',
      cri: 'Yap Yap!',
      troupeId: troupe3.id,
    },
  });
  const patrouille5 = await prisma.patrouille.create({
    data: {
      name: 'Patrouille Faucons',
      totem: 'Faucon Pèlerin',
      cri: 'Criiii!',
      troupeId: troupe4.id,
    },
  });
  console.log('✓ Created 5 patrouilles\n');

  // Create Users
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@nodus.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  const branche = await prisma.user.create({
    data: {
      email: 'branche@nodus.com',
      password: hashedPassword,
      name: 'Branche Eclaireurs',
      role: 'BRANCHE_ECLAIREURS',
    },
  });

  const chef1 = await prisma.user.create({
    data: {
      email: 'chef1@nodus.com',
      password: hashedPassword,
      name: 'Chef Aigle',
      role: 'CHEF_TROUPE',
      troupeId: troupe1.id,
    },
  });

  const chef2 = await prisma.user.create({
    data: {
      email: 'chef2@nodus.com',
      password: hashedPassword,
      name: 'Chef Lion',
      role: 'CHEF_TROUPE',
      troupeId: troupe2.id,
    },
  });

  const chef3 = await prisma.user.create({
    data: {
      email: 'chef3@nodus.com',
      password: hashedPassword,
      name: 'Chef Faucon',
      role: 'CHEF_TROUPE',
      troupeId: troupe3.id,
    },
  });

  const chef4 = await prisma.user.create({
    data: {
      email: 'chef4@nodus.com',
      password: hashedPassword,
      name: 'Chef Gazelle',
      role: 'CHEF_TROUPE',
      troupeId: troupe4.id,
    },
  });

  console.log('✓ Created 6 users\n');

  // Create Categories
  console.log('Creating categories...');

  // Installation Photo Categories
  const catKitchen = await prisma.category.create({
    data: {
      name: 'Cuisine',
      description: 'Installations de cuisine de camp',
      type: 'INSTALLATION_PHOTO',
      displayOrder: 1,
    },
  });

  const catKitchenStove = await prisma.category.create({
    data: {
      name: 'Réchaud',
      description: 'Différents types de réchauds',
      type: 'INSTALLATION_PHOTO',
      parentId: catKitchen.id,
      displayOrder: 1,
    },
  });

  const catKitchenSink = await prisma.category.create({
    data: {
      name: 'Évier',
      description: 'Installations d\'éviers',
      type: 'INSTALLATION_PHOTO',
      parentId: catKitchen.id,
      displayOrder: 2,
    },
  });

  const catShelter = await prisma.category.create({
    data: {
      name: 'Abri',
      description: 'Différents types d\'abris',
      type: 'INSTALLATION_PHOTO',
      displayOrder: 2,
    },
  });

  const catTent = await prisma.category.create({
    data: {
      name: 'Tente',
      description: 'Installations de tentes',
      type: 'INSTALLATION_PHOTO',
      displayOrder: 3,
    },
  });

  const catTable = await prisma.category.create({
    data: {
      name: 'Table',
      description: 'Tables de camp',
      type: 'INSTALLATION_PHOTO',
      displayOrder: 4,
    },
  });

  // Schematic Categories
  const catSchematicKnots = await prisma.category.create({
    data: {
      name: 'Nœuds',
      description: 'Schémas de nœuds scouts',
      type: 'SCHEMATIC',
      displayOrder: 1,
    },
  });

  const catSchematicPioneering = await prisma.category.create({
    data: {
      name: 'Constructions',
      description: 'Schémas de constructions pionnières',
      type: 'SCHEMATIC',
      displayOrder: 2,
    },
  });

  const catSchematicFire = await prisma.category.create({
    data: {
      name: 'Feux',
      description: 'Différents types de feux',
      type: 'SCHEMATIC',
      displayOrder: 3,
    },
  });

  console.log('✓ Created 9 categories (with subcategories)\n');

  // Create Monthly Categories (for current month)
  console.log('Creating monthly categories...');
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  await prisma.monthlyCategory.create({
    data: {
      categoryId: catSchematicKnots.id,
      month: currentMonth,
      year: currentYear,
      isActive: true,
    },
  });

  await prisma.monthlyCategory.create({
    data: {
      categoryId: catSchematicPioneering.id,
      month: currentMonth,
      year: currentYear,
      isActive: true,
    },
  });

  console.log(`✓ Created monthly categories for ${currentMonth}/${currentYear}\n`);

  // Create Tags
  console.log('Creating tags...');
  const tagOutdoor = await prisma.tag.create({
    data: { name: 'Extérieur' },
  });
  const tagWinter = await prisma.tag.create({
    data: { name: 'Hiver' },
  });
  const tagSummer = await prisma.tag.create({
    data: { name: 'Été' },
  });
  const tagAdvanced = await prisma.tag.create({
    data: { name: 'Avancé' },
  });
  const tagBeginner = await prisma.tag.create({
    data: { name: 'Débutant' },
  });
  console.log('✓ Created 5 tags\n');

  // Create Sample Picture Sets
  console.log('Creating sample picture sets...');

  const pictureSet1 = await prisma.pictureSet.create({
    data: {
      title: 'Réchaud à trois pierres',
      description: 'Installation d\'un réchaud traditionnel à trois pierres',
      type: 'INSTALLATION_PHOTO',
      status: 'APPROVED',
      uploadedById: chef1.id,
      troupeId: troupe1.id,
      patrouilleId: patrouille1.id,
      categoryId: catKitchen.id,
      subCategoryId: catKitchenStove.id,
      classifiedById: branche.id,
      classifiedAt: new Date(),
      approvedById: branche.id,
      approvedAt: new Date(),
      location: 'Camp de Bouznika',
      isHighlight: true,
      viewCount: 45,
      tags: {
        connect: [{ id: tagOutdoor.id }, { id: tagBeginner.id }],
      },
      pictures: {
        create: [
          {
            filePath: '/uploads/pictures/sample1.jpg',
            displayOrder: 1,
            caption: 'Vue d\'ensemble du réchaud',
          },
        ],
      },
    },
  });

  const pictureSet2 = await prisma.pictureSet.create({
    data: {
      title: 'Table de patrouille',
      description: 'Table construite avec des bâtons et de la corde',
      type: 'INSTALLATION_PHOTO',
      status: 'APPROVED',
      uploadedById: chef2.id,
      troupeId: troupe2.id,
      patrouilleId: patrouille3.id,
      categoryId: catTable.id,
      classifiedById: branche.id,
      classifiedAt: new Date(),
      approvedById: branche.id,
      approvedAt: new Date(),
      location: 'Camp d\'été Ifrane',
      isHighlight: true,
      viewCount: 67,
      tags: {
        connect: [{ id: tagSummer.id }, { id: tagAdvanced.id }],
      },
      pictures: {
        create: [
          {
            filePath: '/uploads/pictures/sample2.jpg',
            displayOrder: 1,
            caption: 'Table complète',
          },
        ],
      },
    },
  });

  const pictureSet3 = await prisma.pictureSet.create({
    data: {
      title: 'Schéma nœud de chaise',
      description: 'Instructions détaillées pour faire un nœud de chaise',
      type: 'SCHEMATIC',
      status: 'APPROVED',
      uploadedById: chef3.id,
      troupeId: troupe3.id,
      categoryId: catSchematicKnots.id,
      classifiedById: branche.id,
      classifiedAt: new Date(),
      approvedById: branche.id,
      approvedAt: new Date(),
      viewCount: 89,
      tags: {
        connect: [{ id: tagBeginner.id }],
      },
      pictures: {
        create: [
          {
            filePath: '/uploads/pictures/sample3.jpg',
            displayOrder: 1,
            caption: 'Schéma complet du nœud de chaise',
          },
        ],
      },
    },
  });

  const pictureSet4 = await prisma.pictureSet.create({
    data: {
      title: 'Construction de tour',
      description: 'Schéma de construction d\'une tour pionière',
      type: 'SCHEMATIC',
      status: 'CLASSIFIED',
      uploadedById: chef4.id,
      troupeId: troupe4.id,
      categoryId: catSchematicPioneering.id,
      classifiedById: chef4.id,
      classifiedAt: new Date(),
      viewCount: 12,
      tags: {
        connect: [{ id: tagAdvanced.id }],
      },
      pictures: {
        create: [
          {
            filePath: '/uploads/pictures/sample4.jpg',
            displayOrder: 1,
            caption: 'Plan de construction',
          },
        ],
      },
    },
  });

  const pictureSet5 = await prisma.pictureSet.create({
    data: {
      title: 'Abri naturel',
      description: 'Installation d\'un abri avec des matériaux naturels',
      type: 'INSTALLATION_PHOTO',
      status: 'PENDING',
      uploadedById: chef1.id,
      troupeId: troupe1.id,
      patrouilleId: patrouille2.id,
      location: 'Forêt de Maâmora',
      viewCount: 5,
      tags: {
        connect: [{ id: tagOutdoor.id }, { id: tagWinter.id }],
      },
      pictures: {
        create: [
          {
            filePath: '/uploads/pictures/sample5.jpg',
            displayOrder: 1,
            caption: 'Abri terminé',
          },
        ],
      },
    },
  });

  console.log('✓ Created 5 sample picture sets with pictures\n');

  // Create Announcements
  console.log('Creating announcements...');

  const validFrom = new Date();
  const validTo = new Date();
  validTo.setDate(validTo.getDate() + 30);

  await prisma.announcement.create({
    data: {
      title: 'Bienvenue sur Nodus!',
      content: 'Partagez vos meilleures installations de camp et schémas scouts avec toute la communauté.',
      type: 'NEWS',
      validFrom: validFrom,
      isActive: true,
      displayOrder: 1,
    },
  });

  await prisma.announcement.create({
    data: {
      title: 'Catégories du mois',
      content: `Ce mois-ci, partagez vos schémas de nœuds et constructions pionnières!`,
      type: 'MONTHLY_UPLOAD',
      validFrom: validFrom,
      validTo: validTo,
      isActive: true,
      displayOrder: 2,
    },
  });

  await prisma.announcement.create({
    data: {
      title: 'Camp d\'été 2025',
      content: 'Préparez-vous pour le grand camp d\'été! Partagez vos meilleures idées d\'installations.',
      type: 'UPCOMING',
      validFrom: validFrom,
      isActive: true,
      displayOrder: 3,
    },
  });

  console.log('✓ Created 3 announcements\n');

  console.log('✅ Database seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log('   - 2 Districts');
  console.log('   - 3 Groups');
  console.log('   - 4 Troupes');
  console.log('   - 5 Patrouilles');
  console.log('   - 6 Users (1 admin, 1 branche, 4 chefs)');
  console.log('   - 9 Categories (6 installation, 3 schematic)');
  console.log('   - 2 Monthly categories');
  console.log('   - 5 Tags');
  console.log('   - 5 Picture Sets (2 approved highlights, 1 approved, 1 classified, 1 pending)');
  console.log('   - 5 Pictures (attached to sets)');
  console.log('   - 3 Announcements\n');
  console.log('🔑 Test credentials:');
  console.log('   Admin: admin@nodus.com / password123');
  console.log('   Branche: branche@nodus.com / password123');
  console.log('   Chef 1: chef1@nodus.com / password123');
  console.log('   Chef 2: chef2@nodus.com / password123');
  console.log('   Chef 3: chef3@nodus.com / password123');
  console.log('   Chef 4: chef4@nodus.com / password123\n');
  console.log('🚀 You can now:');
  console.log('   - Login with any of the accounts above');
  console.log('   - Browse approved picture sets as a guest');
  console.log('   - Upload new picture sets as a Chef de Troupe');
  console.log('   - Review and approve pictures as Branche Eclaireurs');
  console.log('   - Manage everything as Admin\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
