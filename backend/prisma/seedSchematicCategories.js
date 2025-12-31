import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const schematicCategories = [
  // Set 1: Coin couchage et Abri
  { setName: 'Coin couchage et Abri', setOrder: 1, itemName: 'Tente', itemOrder: 1 },
  { setName: 'Coin couchage et Abri', setOrder: 1, itemName: 'Tente surélevée', itemOrder: 2 },
  { setName: 'Coin couchage et Abri', setOrder: 1, itemName: 'Tente indienne', itemOrder: 3 },
  { setName: 'Coin couchage et Abri', setOrder: 1, itemName: 'Hutte', itemOrder: 4 },
  { setName: 'Coin couchage et Abri', setOrder: 1, itemName: 'Lit', itemOrder: 5 },

  // Set 2: Hygiène et Sanitaire
  { setName: 'Hygiène et Sanitaire', setOrder: 2, itemName: 'Poubelle', itemOrder: 1 },
  { setName: 'Hygiène et Sanitaire', setOrder: 2, itemName: 'Porte-vaisselle', itemOrder: 2 },
  { setName: 'Hygiène et Sanitaire', setOrder: 2, itemName: 'Douche', itemOrder: 3 },
  { setName: 'Hygiène et Sanitaire', setOrder: 2, itemName: 'Vaisselier', itemOrder: 4 },
  { setName: 'Hygiène et Sanitaire', setOrder: 2, itemName: 'Feuillée', itemOrder: 5 },

  // Set 3: Feu et Cuisine
  { setName: 'Feu et Cuisine', setOrder: 3, itemName: 'Feu et Porte-bûches', itemOrder: 1 },
  { setName: 'Feu et Cuisine', setOrder: 3, itemName: 'Four', itemOrder: 2 },
  { setName: 'Feu et Cuisine', setOrder: 3, itemName: 'Cuisine', itemOrder: 3 },
  { setName: 'Feu et Cuisine', setOrder: 3, itemName: "Zone d'eau", itemOrder: 4 },
  { setName: 'Feu et Cuisine', setOrder: 3, itemName: "Coin d'intendance", itemOrder: 5 },

  // Set 4: Vie de patrouille et Animation
  { setName: 'Vie de patrouille et Animation', setOrder: 4, itemName: 'Coin de prière', itemOrder: 1 },
  { setName: 'Vie de patrouille et Animation', setOrder: 4, itemName: 'Coin de veillée', itemOrder: 2 },
  { setName: 'Vie de patrouille et Animation', setOrder: 4, itemName: "Tableau d'affichage", itemOrder: 3 },
  { setName: 'Vie de patrouille et Animation', setOrder: 4, itemName: 'Porte-fanion', itemOrder: 4 },

  // Set 5: Organisation et rangement
  { setName: 'Organisation et rangement', setOrder: 5, itemName: 'Porte-habits', itemOrder: 1 },
  { setName: 'Organisation et rangement', setOrder: 5, itemName: 'Porte-linge', itemOrder: 2 },
  { setName: 'Organisation et rangement', setOrder: 5, itemName: 'Porte-souliers', itemOrder: 3 },
  { setName: 'Organisation et rangement', setOrder: 5, itemName: 'Porte-matériel', itemOrder: 4 },
  { setName: 'Organisation et rangement', setOrder: 5, itemName: 'Vestiaire', itemOrder: 5 },

  // Set 6: Circulation et sécurité
  { setName: 'Circulation et sécurité', setOrder: 6, itemName: 'Coin de secours', itemOrder: 1 },
  { setName: 'Circulation et sécurité', setOrder: 6, itemName: 'Barrière', itemOrder: 2 },
  { setName: 'Circulation et sécurité', setOrder: 6, itemName: 'Sentier', itemOrder: 3 },
  { setName: 'Circulation et sécurité', setOrder: 6, itemName: 'Porte-lanterne', itemOrder: 4 },
  { setName: 'Circulation et sécurité', setOrder: 6, itemName: 'Banc', itemOrder: 5 },

  // Set 7: Structures et techniques
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Mât', itemOrder: 1 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: "Porte d'entrée", itemOrder: 2 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Tour', itemOrder: 3 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Pont', itemOrder: 4 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Balançoire', itemOrder: 5 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Table', itemOrder: 6 },
  { setName: 'Structures et techniques', setOrder: 7, itemName: 'Autel', itemOrder: 7 },
];

async function seedSchematicCategories() {
  console.log('Seeding schematic categories...');

  for (const category of schematicCategories) {
    await prisma.schematicCategory.upsert({
      where: {
        setName_itemName: {
          setName: category.setName,
          itemName: category.itemName,
        },
      },
      update: {
        setOrder: category.setOrder,
        itemOrder: category.itemOrder,
      },
      create: category,
    });
  }

  const count = await prisma.schematicCategory.count();
  console.log(`Seeded ${count} schematic categories across 7 sets.`);
}

seedSchematicCategories()
  .then(() => {
    console.log('Schematic categories seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding schematic categories:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
