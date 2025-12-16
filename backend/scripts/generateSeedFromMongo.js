/**
 * Script to extract data from MongoDB (suivi2025) and generate seed data
 *
 * This script:
 * 1. Connects to MongoDB and extracts districts, groups, and Eclaireurs units
 * 2. Maps patrouilles from RNE25 SQL to units using TroupeId -> Unit mapping
 * 3. Generates seedData.js with all the extracted data
 *
 * Run with: node scripts/generateSeedFromMongo.js
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'suivi2025';

// Patrouilles data from rne25_patrouilles.sql (TroupeId references SQL troupes table)
const patrouillesFromSQL = [
  { id: 1, totem: 'Loup', cri: 'Feroces', troupeId: 1 },
  { id: 2, totem: 'Chevaux', cri: 'Rapides', troupeId: 1 },
  { id: 3, totem: 'Aigle', cri: '', troupeId: 2 },
  { id: 4, totem: 'Jaguar', cri: 'Rapid', troupeId: 3 },
  { id: 5, totem: 'Lion', cri: 'Plus Fort', troupeId: 3 },
  { id: 6, totem: 'Eagle', cri: '', troupeId: 4 },
  { id: 7, totem: 'Bear', cri: '', troupeId: 4 },
  { id: 8, totem: 'Bull', cri: '', troupeId: 4 },
  { id: 9, totem: 'Dragon', cri: '', troupeId: 4 },
  { id: 10, totem: 'Mustang', cri: 'Fougueux', troupeId: 5 },
  { id: 11, totem: 'Guépard', cri: 'Enthousiaste', troupeId: 5 },
  { id: 12, totem: 'Aigle', cri: 'Joviale', troupeId: 5 },
  { id: 13, totem: 'Épaulard', cri: 'Fidele', troupeId: 5 },
  { id: 14, totem: 'Loup', cri: 'Tenace', troupeId: 5 },
  { id: 15, totem: 'Castor', cri: 'Hardis', troupeId: 6 },
  { id: 16, totem: 'Rorqual', cri: 'Capables', troupeId: 6 },
  { id: 17, totem: 'Faucon', cri: 'Vigilants', troupeId: 6 },
  { id: 18, totem: 'Poulain', cri: 'Au Vent', troupeId: 7 },
  { id: 19, totem: 'Aigle', cri: 'Plus Haut', troupeId: 7 },
  { id: 20, totem: 'Renard', cri: 'Rusé', troupeId: 7 },
  { id: 21, totem: 'Aigle', cri: 'Plus Haut', troupeId: 8 },
  { id: 22, totem: 'Faucon', cri: 'Puissant', troupeId: 8 },
  { id: 23, totem: 'Guépard', cri: 'Vigilant', troupeId: 8 },
  { id: 24, totem: 'Tigre', cri: 'Intrepide', troupeId: 8 },
  { id: 25, totem: 'Renard', cri: 'Rusé', troupeId: 9 },
  { id: 26, totem: 'Lion', cri: 'Feroce', troupeId: 9 },
  { id: 27, totem: 'Panthère', cri: 'Foudroyante', troupeId: 9 },
  { id: 28, totem: 'Loup', cri: 'Intripide', troupeId: 9 },
  { id: 29, totem: 'Léopard', cri: 'Agile', troupeId: 10 },
  { id: 30, totem: 'Aigle', cri: 'Plus Haut', troupeId: 10 },
  { id: 31, totem: 'Requin', cri: 'Vorace', troupeId: 10 },
  { id: 32, totem: 'Renard', cri: 'Ruse', troupeId: 10 },
  { id: 33, totem: 'Cerf', cri: 'Alerte', troupeId: 10 },
  { id: 34, totem: 'Renard', cri: 'Rusés', troupeId: 11 },
  { id: 35, totem: 'Lion', cri: 'Féroces', troupeId: 11 },
  { id: 36, totem: 'Aigle', cri: 'Plus Hauts', troupeId: 11 },
  { id: 37, totem: 'Requin', cri: 'Gaillard', troupeId: 12 },
  { id: 38, totem: 'Léopard', cri: 'Acharné', troupeId: 12 },
  { id: 39, totem: 'Ours', cri: 'Aimable', troupeId: 12 },
  { id: 40, totem: 'Chacal', cri: 'Rusé', troupeId: 12 },
  { id: 41, totem: 'Aigle', cri: 'Plus Haut', troupeId: 12 },
  { id: 42, totem: 'Grizzly', cri: 'Vigoureux', troupeId: 13 },
  { id: 43, totem: 'Mustang', cri: 'Endurants', troupeId: 13 },
  { id: 44, totem: 'Caïman', cri: 'Hargneux', troupeId: 13 },
  { id: 45, totem: 'Faucon', cri: 'Lestes', troupeId: 13 },
  { id: 46, totem: 'Loup', cri: 'Vigilant', troupeId: 14 },
  { id: 47, totem: 'Gazelle', cri: 'rapide', troupeId: 14 },
  { id: 48, totem: 'Loup', cri: 'Féroces', troupeId: 15 },
  { id: 49, totem: 'Aigle', cri: 'Plus Haut', troupeId: 15 },
  { id: 50, totem: 'Coq', cri: 'Sportifs', troupeId: 15 },
  { id: 51, totem: 'Panthère', cri: 'Agiles', troupeId: 15 },
  { id: 52, totem: 'Lion', cri: 'Féroces', troupeId: 16 },
  { id: 53, totem: 'Requin', cri: 'Voraces', troupeId: 16 },
  { id: 54, totem: 'Serpent', cri: 'Sages', troupeId: 16 },
  { id: 55, totem: 'Cougar', cri: 'Barbares', troupeId: 16 },
  { id: 56, totem: 'Aigle', cri: 'Plus Haut', troupeId: 16 },
  { id: 57, totem: 'Gazelle', cri: 'Rapides', troupeId: 16 },
  { id: 58, totem: 'Panthère', cri: 'Agiles', troupeId: 17 },
  { id: 59, totem: 'Renard', cri: 'Rusés', troupeId: 17 },
  { id: 60, totem: 'Loup', cri: 'Féroces', troupeId: 17 },
  { id: 61, totem: 'Cobra', cri: 'Alertes', troupeId: 17 },
  { id: 62, totem: 'Faucon', cri: 'Vivace', troupeId: 18 },
  { id: 63, totem: 'Renard', cri: 'Rusé', troupeId: 18 },
  { id: 64, totem: 'Panthère', cri: 'Active', troupeId: 18 },
  { id: 65, totem: 'Cobra', cri: 'Alerte', troupeId: 18 },
  { id: 66, totem: 'Chamois', cri: 'Sur Le Roc', troupeId: 19 },
  { id: 67, totem: 'Ours', cri: 'Jovial', troupeId: 19 },
  { id: 68, totem: 'Panthère', cri: 'Agile', troupeId: 19 },
  { id: 69, totem: 'Aigle', cri: 'Loyal', troupeId: 19 },
  { id: 70, totem: 'Espadon', cri: 'Tenaces', troupeId: 19 },
  { id: 71, totem: 'Faucon', cri: 'Voraces', troupeId: 19 },
  { id: 72, totem: 'Dingo', cri: 'Devoué', troupeId: 19 },
  { id: 73, totem: 'Léopards', cri: 'Vigilants', troupeId: 20 },
  { id: 74, totem: 'Bison', cri: 'Robustes', troupeId: 20 },
  { id: 75, totem: 'Tigres', cri: 'Acharnés', troupeId: 20 },
  { id: 76, totem: 'Condor', cri: 'Ardents', troupeId: 20 },
  { id: 77, totem: 'Épervier', cri: "À L'Affut", troupeId: 20 },
  { id: 78, totem: 'Etalon', cri: 'Tenas', troupeId: 20 },
  { id: 79, totem: 'Requin', cri: 'Résilients', troupeId: 20 },
  { id: 80, totem: 'Castor', cri: 'Dynamiques', troupeId: 21 },
  { id: 81, totem: 'Alouette', cri: 'Gaies', troupeId: 21 },
  { id: 82, totem: 'Renard', cri: 'Rusés', troupeId: 21 },
  { id: 83, totem: 'Belier', cri: 'Fougueux', troupeId: 21 },
  { id: 84, totem: 'Mouette', cri: 'Aux Larges', troupeId: 21 },
  { id: 85, totem: 'Abeille', cri: 'Actives', troupeId: 21 },
  { id: 86, totem: 'Élans', cri: 'Vaillants', troupeId: 21 },
  { id: 87, totem: 'Leopard', cri: 'Agile', troupeId: 22 },
  { id: 88, totem: 'Bison', cri: 'Actif', troupeId: 22 },
  { id: 89, totem: 'Poulain', cri: 'Au Vent', troupeId: 22 },
  { id: 90, totem: 'Renard', cri: 'Ruse', troupeId: 22 },
  { id: 91, totem: 'Cobre', cri: 'Alerte', troupeId: 23 },
  { id: 92, totem: 'Dauphin', cri: 'Aimable', troupeId: 23 },
  { id: 93, totem: 'Aigle', cri: 'Plus Haut', troupeId: 23 },
  { id: 94, totem: 'Guépard', cri: 'Jovial', troupeId: 23 },
  { id: 95, totem: 'Vautour', cri: 'Vivace', troupeId: 24 },
  { id: 96, totem: 'Orque', cri: 'Vaillant', troupeId: 24 },
  { id: 97, totem: 'Sanglier', cri: 'Temeraire', troupeId: 24 },
  { id: 98, totem: 'Dromadaire', cri: 'Endurant', troupeId: 24 },
  { id: 99, totem: 'Leopard', cri: 'Vigoureux', troupeId: 25 },
  { id: 100, totem: 'Grizzly', cri: 'Jovial', troupeId: 25 },
  { id: 101, totem: 'Épervier', cri: 'Fulgurant', troupeId: 25 },
  { id: 102, totem: 'Aigle', cri: '', troupeId: 26 },
  { id: 103, totem: 'Tigre', cri: '', troupeId: 26 },
  { id: 104, totem: 'Guépard', cri: 'Rapide', troupeId: 27 },
  { id: 105, totem: 'Loup', cri: 'Voit Tout', troupeId: 27 },
  { id: 106, totem: 'Aigle', cri: 'Veilleur', troupeId: 27 },
  { id: 107, totem: 'Bison', cri: 'Sauvage', troupeId: 27 },
  { id: 108, totem: 'Guépard', cri: 'Rapides', troupeId: 28 },
  { id: 109, totem: 'Lynx', cri: 'Vigilents', troupeId: 28 },
  { id: 110, totem: 'Bison', cri: 'Sauvages', troupeId: 28 },
  { id: 111, totem: 'Chacal', cri: 'Brillant', troupeId: 29 },
  { id: 112, totem: 'Lynx', cri: 'Vigilant', troupeId: 29 },
  { id: 113, totem: 'Guépard', cri: 'Rapide', troupeId: 29 },
  { id: 114, totem: 'Bison', cri: 'Sauvage', troupeId: 29 },
  { id: 115, totem: 'Loup', cri: "Jusqu'Au Bout", troupeId: 29 },
  { id: 116, totem: 'Aigle', cri: 'Plushaut', troupeId: 30 },
  { id: 117, totem: 'Loup', cri: 'Ferosse', troupeId: 30 },
  { id: 118, totem: 'Lion', cri: 'Aggressive', troupeId: 31 },
  { id: 119, totem: 'Eagle', cri: 'Plus Haut', troupeId: 31 },
  { id: 120, totem: 'Tigre', cri: 'Firas', troupeId: 31 },
  { id: 121, totem: 'Panthère', cri: 'Vivaces', troupeId: 32 },
  { id: 122, totem: 'Tigre', cri: 'Rall', troupeId: 33 },
  { id: 123, totem: 'Aigle', cri: 'Rapace', troupeId: 33 },
  { id: 124, totem: 'Cobra', cri: 'Venimeux', troupeId: 33 },
  { id: 125, totem: 'Lion', cri: 'Feroce', troupeId: 33 },
  { id: 126, totem: 'Requin', cri: 'Cruels', troupeId: 34 },
  { id: 127, totem: 'Faucon', cri: 'Rapides', troupeId: 34 },
  { id: 128, totem: 'Renard', cri: 'Rusés', troupeId: 34 },
  { id: 129, totem: 'Cobra', cri: 'Mortels', troupeId: 34 },
  { id: 130, totem: 'Requin', cri: 'Feroce', troupeId: 35 },
  { id: 131, totem: 'Hyène', cri: 'Plus Fort', troupeId: 35 },
  { id: 132, totem: 'Serpent', cri: 'Puissant', troupeId: 35 },
  { id: 133, totem: 'Aigle', cri: 'Plus Haut', troupeId: 35 },
  { id: 134, totem: 'Loup', cri: 'Garou', troupeId: 35 },
  { id: 135, totem: 'Puma', cri: 'Prédateur', troupeId: 36 },
  { id: 136, totem: 'Loup', cri: 'Féroce', troupeId: 36 },
  { id: 137, totem: 'Aigle', cri: 'Plus Haut', troupeId: 36 },
  { id: 138, totem: 'Lion', cri: 'Féroce', troupeId: 37 },
  { id: 139, totem: 'Renard', cri: 'Rusé', troupeId: 37 },
  { id: 140, totem: 'Loup', cri: 'Vigilant', troupeId: 37 },
  { id: 141, totem: 'Lion', cri: 'Feroce', troupeId: 38 },
  { id: 142, totem: 'Loup', cri: 'Vigilan', troupeId: 38 },
  { id: 143, totem: 'Panthère', cri: 'Acharne', troupeId: 38 },
  { id: 144, totem: 'Tigre', cri: 'Dinamique', troupeId: 38 },
  { id: 145, totem: 'Dragon', cri: 'Robust', troupeId: 39 },
  { id: 146, totem: 'Loup', cri: 'Vigilant', troupeId: 39 },
  { id: 147, totem: 'Jaguar', cri: 'Terrible', troupeId: 39 },
  { id: 148, totem: 'Lion', cri: 'Courageux', troupeId: 40 },
  { id: 149, totem: 'Guépard', cri: 'Rapide', troupeId: 40 },
  { id: 150, totem: 'Aigle', cri: 'Élevé', troupeId: 40 },
  { id: 151, totem: 'Tigre', cri: 'Puissant', troupeId: 41 },
  { id: 152, totem: 'Aigle', cri: 'Plus Haut', troupeId: 41 },
  { id: 153, totem: 'Lion', cri: 'Ardent', troupeId: 41 },
  { id: 154, totem: 'Lion', cri: 'Fort', troupeId: 42 },
  { id: 155, totem: 'Tigre', cri: 'Rapide', troupeId: 42 },
  { id: 156, totem: 'Faucon', cri: 'Chasson', troupeId: 42 },
  { id: 157, totem: 'Tigres', cri: 'Cruels', troupeId: 43 },
  { id: 158, totem: 'Cobra', cri: 'Alertes', troupeId: 43 },
  { id: 159, totem: 'Aigle', cri: 'Plus Haut', troupeId: 43 },
  { id: 160, totem: 'Lion', cri: 'Fort', troupeId: 44 },
  { id: 161, totem: 'Aiglon', cri: 'Plus Hauts', troupeId: 44 },
  { id: 162, totem: 'Cobra', cri: 'Sage', troupeId: 44 },
  { id: 163, totem: 'Guépard', cri: 'Rapide', troupeId: 44 },
  { id: 164, totem: 'Tigre', cri: 'Courageux', troupeId: 44 },
  { id: 165, totem: 'Loup', cri: 'Féroces', troupeId: 44 },
  { id: 166, totem: 'Aigle', cri: 'Rapace', troupeId: 45 },
  { id: 167, totem: 'Tigre', cri: 'feroce', troupeId: 45 },
  { id: 168, totem: 'Ours', cri: 'Furieux', troupeId: 46 },
  { id: 169, totem: 'Aigle', cri: 'Plus Haut', troupeId: 46 },
  { id: 170, totem: 'Taureau', cri: 'Nerveux', troupeId: 46 },
  { id: 171, totem: 'Jaguar', cri: 'Féroce', troupeId: 47 },
  { id: 172, totem: 'Aspic', cri: 'Trompeur', troupeId: 47 },
  { id: 173, totem: 'Renard', cri: 'Rusé', troupeId: 47 },
  { id: 174, totem: 'Once', cri: 'Dynamique', troupeId: 47 },
  { id: 175, totem: 'Faucon', cri: 'Courageux', troupeId: 47 },
  { id: 176, totem: 'Dauphin', cri: 'Tenace', troupeId: 48 },
  { id: 177, totem: 'Aiglon', cri: 'Plus Haut', troupeId: 48 },
  { id: 178, totem: 'Panthère', cri: 'Agile', troupeId: 48 },
  { id: 179, totem: 'في', cri: 'كل غاب ذئاب', troupeId: 49 },
  { id: 180, totem: 'وعل', cri: 'جلود', troupeId: 49 },
  { id: 181, totem: 'Aigle', cri: 'Hauts', troupeId: 50 },
  { id: 182, totem: 'Gazelle', cri: 'Rapides', troupeId: 50 },
  { id: 183, totem: 'Loup', cri: 'Forts', troupeId: 50 },
  { id: 184, totem: 'Renard', cri: 'Rusés', troupeId: 50 },
  { id: 185, totem: 'Tigres', cri: 'Agiles', troupeId: 50 },
  { id: 186, totem: 'Lion', cri: 'Vive Le Roi', troupeId: 51 },
  { id: 187, totem: 'Dauphin', cri: 'Joi Des Mers', troupeId: 51 },
  { id: 188, totem: 'Panthère', cri: 'Rapid', troupeId: 51 },
  { id: 189, totem: 'Aigle', cri: 'Roi Des Cimes', troupeId: 51 },
  { id: 190, totem: 'أسد', cri: 'ملك الغاب', troupeId: 52 },
  { id: 191, totem: 'نسر', cri: 'فارس سماء', troupeId: 52 },
  { id: 192, totem: 'فهد', cri: 'جريء', troupeId: 52 },
  { id: 193, totem: 'حوت', cri: 'جبّار', troupeId: 52 },
  { id: 194, totem: 'دب', cri: 'متوحش', troupeId: 52 },
  { id: 195, totem: 'Lion', cri: 'Feroce', troupeId: 53 },
  { id: 196, totem: 'Tigre', cri: 'Agile', troupeId: 53 },
  { id: 197, totem: 'Aigle', cri: 'Plus Haut', troupeId: 53 },
  { id: 198, totem: 'Bison', cri: 'Actife', troupeId: 53 },
  { id: 199, totem: 'Baribal', cri: 'Fort', troupeId: 54 },
  { id: 200, totem: 'Eppérvier', cri: 'Impérial', troupeId: 54 },
  { id: 201, totem: 'Orgue', cri: 'Puissant', troupeId: 54 },
  { id: 202, totem: 'Serval', cri: 'Feroce', troupeId: 54 },
  { id: 203, totem: 'Renard', cri: 'Rusé', troupeId: 55 },
  { id: 204, totem: 'Lion', cri: 'Feroce', troupeId: 55 },
  { id: 205, totem: 'Aigle', cri: 'Plus Haut', troupeId: 55 },
  { id: 206, totem: 'Loup', cri: 'Actif', troupeId: 55 },
  { id: 207, totem: 'Aigle', cri: 'Chassant', troupeId: 56 },
  { id: 208, totem: 'Pieuvre', cri: 'Invincible', troupeId: 56 },
  { id: 209, totem: 'Lion', cri: 'Tenace', troupeId: 56 },
  { id: 210, totem: 'Rhinoceros', cri: 'Endurant', troupeId: 56 },
  { id: 211, totem: 'Aigle', cri: 'Plus Haut', troupeId: 57 },
  { id: 212, totem: 'Gerboise', cri: 'Intelligente', troupeId: 57 },
  { id: 213, totem: 'Bouquetin', cri: 'Habile', troupeId: 57 },
  { id: 214, totem: 'Jaguar', cri: 'Vigoureux', troupeId: 57 },
  { id: 215, totem: 'Loup', cri: 'Actifs', troupeId: 58 },
  { id: 216, totem: 'Lion', cri: 'Féroces', troupeId: 58 },
  { id: 217, totem: 'Panthère', cri: 'Agiles', troupeId: 58 },
  { id: 218, totem: 'Renard', cri: 'Rusés', troupeId: 58 },
  { id: 219, totem: 'Lion', cri: 'Courageuz', troupeId: 59 },
  { id: 220, totem: 'Faucon', cri: 'Percant', troupeId: 59 },
  { id: 221, totem: 'Guépard', cri: 'Rapide', troupeId: 59 },
  { id: 222, totem: 'Tigre', cri: 'Malin', troupeId: 59 },
  { id: 223, totem: 'Dauphin', cri: 'Affable', troupeId: 60 },
  { id: 224, totem: 'Gazelle', cri: 'Dynamique', troupeId: 60 },
  { id: 225, totem: 'Lynx', cri: 'Vif', troupeId: 60 },
  { id: 226, totem: 'Renard', cri: 'Rusé', troupeId: 60 },
  { id: 227, totem: 'Loup', cri: 'Feroces', troupeId: 61 },
  { id: 228, totem: 'Bison', cri: 'Puisson', troupeId: 61 },
  { id: 229, totem: 'Panthère', cri: 'Agiles', troupeId: 61 },
  { id: 230, totem: 'Castor', cri: 'Ardi', troupeId: 61 },
  { id: 231, totem: 'Aigle', cri: '- Plus Haut', troupeId: 62 },
  { id: 232, totem: 'Lion', cri: '- Tenace', troupeId: 62 },
  { id: 233, totem: 'Ours', cri: '- Féroce', troupeId: 62 },
  { id: 234, totem: 'Cheval', cri: 'Actif', troupeId: 63 },
  { id: 235, totem: 'Aigle', cri: 'Plus Haut', troupeId: 63 },
  { id: 236, totem: 'Tigre', cri: 'Vaillant', troupeId: 63 },
  { id: 237, totem: 'Requin', cri: 'Tenace', troupeId: 63 },
  { id: 238, totem: 'Gazelle', cri: 'Rapide', troupeId: 63 },
  { id: 239, totem: 'Renard', cri: 'Habiles', troupeId: 64 },
  { id: 240, totem: 'Gazelle', cri: 'Rapides', troupeId: 64 },
  { id: 241, totem: 'Aiglon', cri: 'Plus Haut', troupeId: 64 },
  { id: 242, totem: 'Alouette', cri: 'Gais', troupeId: 64 },
  { id: 243, totem: 'Panthère', cri: 'Agiles', troupeId: 65 },
  { id: 244, totem: 'Pinson', cri: 'Gaies', troupeId: 65 },
  { id: 245, totem: 'Cerf', cri: 'Alertes', troupeId: 65 },
  { id: 246, totem: 'Requin', cri: 'Tenaces', troupeId: 65 },
  { id: 247, totem: 'Faucon', cri: 'Hardis', troupeId: 66 },
  { id: 248, totem: 'Lievres', cri: 'Vifs', troupeId: 66 },
  { id: 249, totem: 'Dauphin', cri: 'Vivaces', troupeId: 66 },
  { id: 250, totem: 'Chacal', cri: 'Agiles', troupeId: 66 },
  { id: 251, totem: 'Loup', cri: "Jusqu'au Bout", troupeId: 67 },
  { id: 252, totem: 'Castor', cri: 'Habiles', troupeId: 67 },
  { id: 253, totem: 'Panthère', cri: 'Agiles', troupeId: 67 },
  { id: 254, totem: 'Léopard', cri: 'Vaillants', troupeId: 67 },
  { id: 255, totem: 'Chamois', cri: 'Altier', troupeId: 68 },
  { id: 256, totem: 'Lion', cri: 'Ardents', troupeId: 68 },
  { id: 257, totem: 'Dauphin', cri: 'Affables', troupeId: 68 },
  { id: 258, totem: 'Faucon', cri: 'Percants', troupeId: 68 },
  { id: 259, totem: 'Renard', cri: 'Habiles', troupeId: 69 },
  { id: 260, totem: 'Aiglon', cri: 'Plus Haut', troupeId: 69 },
  { id: 261, totem: 'Panthère', cri: 'Agiles', troupeId: 69 },
  { id: 262, totem: 'Lynx', cri: 'Prudent', troupeId: 69 },
  { id: 263, totem: 'Aiglon', cri: 'Plus Haut', troupeId: 70 },
  { id: 264, totem: 'Panthère', cri: 'Agile', troupeId: 70 },
  { id: 265, totem: 'Dauphin', cri: 'Vivace', troupeId: 70 },
  { id: 266, totem: 'Cerf', cri: 'Alerte', troupeId: 70 },
  { id: 267, totem: 'Renard', cri: 'Rusé', troupeId: 70 },
  { id: 268, totem: 'Gazelle', cri: 'Rapide', troupeId: 70 },
  { id: 269, totem: 'Loup', cri: "Jusqu'Au Bout", troupeId: 71 },
  { id: 270, totem: 'Aigle', cri: 'Plus Haut', troupeId: 71 },
  { id: 271, totem: 'Requin', cri: 'Voraces', troupeId: 71 },
  { id: 272, totem: 'Panthère', cri: 'Agiles', troupeId: 71 },
  { id: 273, totem: 'Lion', cri: 'Plus Forts', troupeId: 72 },
  { id: 274, totem: 'Dauphin', cri: 'Aimables', troupeId: 72 },
  { id: 275, totem: 'Rossignol', cri: 'Gais', troupeId: 72 },
  { id: 276, totem: 'Chacal', cri: 'Rusés', troupeId: 72 },
  { id: 277, totem: 'Panthère', cri: 'Agile', troupeId: 73 },
  { id: 278, totem: 'Faucon', cri: 'Hardi', troupeId: 73 },
  { id: 279, totem: 'Lion', cri: 'Vaillant', troupeId: 73 },
  { id: 280, totem: 'Requin', cri: 'Tenace', troupeId: 73 },
  { id: 281, totem: 'Gorille', cri: 'Ardant', troupeId: 73 },
  { id: 282, totem: 'Aigle', cri: 'Plus Haut', troupeId: 74 },
  { id: 283, totem: 'Renard', cri: 'Rusé', troupeId: 74 },
  { id: 284, totem: 'Pegase', cri: 'Plus Loin', troupeId: 74 },
  { id: 285, totem: 'Aigle', cri: 'Plus Haut', troupeId: 75 },
  { id: 286, totem: 'Ours', cri: 'Geant', troupeId: 75 },
  { id: 287, totem: 'Panther', cri: 'Rapid', troupeId: 75 },
  { id: 288, totem: 'Léopard', cri: 'Voyants', troupeId: 76 },
  { id: 289, totem: 'Aigle', cri: 'Plus Haut', troupeId: 76 },
  { id: 290, totem: 'Cobra', cri: 'Prudent', troupeId: 77 },
  { id: 291, totem: 'Aigle', cri: 'Plus-Haut', troupeId: 77 },
  { id: 292, totem: 'Aigle', cri: 'Fougueux', troupeId: 78 },
  { id: 293, totem: 'Grizzly', cri: 'Robustes', troupeId: 78 },
  { id: 294, totem: 'Jaguar', cri: 'Agile', troupeId: 78 },
  { id: 295, totem: 'Lion', cri: 'Redoutables', troupeId: 78 },
  { id: 296, totem: 'Poulain', cri: 'Au Vent', troupeId: 78 },
  { id: 297, totem: 'Bélier', cri: 'Fougue', troupeId: 79 },
  { id: 298, totem: 'Condor', cri: 'Perçant', troupeId: 79 },
  { id: 299, totem: 'Loup', cri: "Jusqu'Au Bout", troupeId: 79 },
  { id: 300, totem: 'Renard', cri: 'Rusé', troupeId: 79 },
  { id: 301, totem: 'Tigres', cri: 'Vigilant', troupeId: 79 },
  { id: 302, totem: 'Ecureuils', cri: 'Vifs', troupeId: 80 },
  { id: 303, totem: 'Loutre', cri: 'Dévouées', troupeId: 80 },
  { id: 304, totem: 'Boas', cri: 'Acharnés', troupeId: 80 },
  { id: 305, totem: 'Pélican', cri: 'Fidèles', troupeId: 80 },
  { id: 306, totem: 'Requin', cri: 'Voraces', troupeId: 80 },
  { id: 307, totem: 'Loup', cri: "Jusqu'Au Bout", troupeId: 81 },
  { id: 308, totem: 'Faucon', cri: 'Plus Haut', troupeId: 81 },
  { id: 309, totem: 'Castor', cri: 'À Droit', troupeId: 81 },
  { id: 310, totem: 'Cobra', cri: 'Vigilants', troupeId: 81 },
  { id: 311, totem: 'Buffalo', cri: 'Féroce', troupeId: 82 },
  { id: 312, totem: 'Dauphin', cri: 'Tenace', troupeId: 82 },
  { id: 313, totem: 'Guépard', cri: 'Rapide', troupeId: 82 },
  { id: 314, totem: 'Vipère', cri: 'Rusé', troupeId: 82 },
  { id: 315, totem: 'Aigle', cri: 'Plus Haut', troupeId: 82 },
  { id: 316, totem: 'Loup', cri: 'Féroces', troupeId: 83 },
  { id: 317, totem: 'Lynx', cri: 'Agiles', troupeId: 83 },
  { id: 318, totem: 'Milan', cri: 'Persan', troupeId: 83 },
  { id: 319, totem: 'Béluga', cri: 'Alerte', troupeId: 83 },
  { id: 320, totem: 'Espadon', cri: 'Rapide', troupeId: 83 },
  { id: 321, totem: 'Requin', cri: 'Voraces', troupeId: 84 },
  { id: 322, totem: 'Léopard', cri: 'Vigilants', troupeId: 84 },
  { id: 323, totem: 'Panda', cri: 'Effrayants', troupeId: 84 },
  { id: 324, totem: 'Faucon', cri: 'Hardis', troupeId: 84 },
  { id: 325, totem: 'Bison', cri: 'Vigoureux', troupeId: 84 },
  { id: 326, totem: 'Lion', cri: 'Puissants', troupeId: 85 },
  { id: 327, totem: 'Tigre', cri: 'Agiles', troupeId: 85 },
  { id: 328, totem: 'Aigle', cri: 'Plus Haut', troupeId: 85 },
  { id: 329, totem: 'Dauphin', cri: 'Rapides', troupeId: 85 },
  { id: 330, totem: 'Aigle', cri: 'Plus Haut', troupeId: 86 },
  { id: 331, totem: 'Faucon', cri: 'Puissant', troupeId: 87 },
  { id: 332, totem: 'Jaguar', cri: 'Persistant', troupeId: 87 },
  { id: 333, totem: 'Kangourou', cri: 'Motivé', troupeId: 88 },
  { id: 334, totem: 'Loup', cri: 'Vigilant', troupeId: 88 },
  { id: 335, totem: 'Renard', cri: 'Rusé', troupeId: 88 },
  { id: 336, totem: 'Cobra', cri: 'Cordial', troupeId: 88 },
  { id: 337, totem: 'Gazelle', cri: 'Rapide', troupeId: 88 },
  { id: 338, totem: 'Lion', cri: 'Féroces', troupeId: 89 },
  { id: 339, totem: 'Panthère', cri: 'Intrépides', troupeId: 89 },
  { id: 340, totem: 'Requin', cri: 'Voraces', troupeId: 89 },
  { id: 341, totem: 'Bison', cri: 'Prévalents', troupeId: 89 },
  { id: 342, totem: 'Aigle', cri: 'Audacieux', troupeId: 89 },
  { id: 343, totem: 'Taureau', cri: 'Puissant', troupeId: 90 },
  { id: 344, totem: 'Lynx', cri: 'Rapid', troupeId: 90 },
  { id: 345, totem: 'Panthère', cri: 'Foudroyants', troupeId: 91 },
  { id: 346, totem: 'Bison', cri: 'Farouches', troupeId: 91 },
  { id: 347, totem: 'Aigle', cri: 'Plus Haut', troupeId: 91 },
  { id: 348, totem: 'Lion', cri: 'Ferroces', troupeId: 91 },
  { id: 349, totem: 'Faucon', cri: 'Persans', troupeId: 92 },
  { id: 350, totem: 'Chacal', cri: 'Ardit', troupeId: 92 },
  { id: 351, totem: 'Lynx', cri: 'Vaillant', troupeId: 93 },
  { id: 352, totem: 'Puma', cri: 'Alerte', troupeId: 93 },
  { id: 353, totem: 'Panthère', cri: 'Agile', troupeId: 93 },
  { id: 354, totem: 'Guépard', cri: 'Ardent', troupeId: 93 },
  { id: 355, totem: 'Cougar', cri: 'Patient', troupeId: 93 },
  { id: 356, totem: 'Alouette', cri: 'Gai', troupeId: 94 },
  { id: 357, totem: 'Pelican', cri: 'Affable', troupeId: 94 },
  { id: 358, totem: 'Aiglon', cri: 'Plus-Haut', troupeId: 94 },
  { id: 359, totem: 'Faucon', cri: 'Hardi', troupeId: 94 },
  { id: 360, totem: 'Toucan', cri: 'Dévoué', troupeId: 94 },
  { id: 361, totem: 'Lion', cri: 'Vaillant', troupeId: 95 },
  { id: 362, totem: 'Faucon', cri: 'Hardis', troupeId: 95 },
  { id: 363, totem: 'Loup', cri: "Jusqu'Au Bout", troupeId: 95 },
  { id: 364, totem: 'Aigle', cri: 'Plus Hauts', troupeId: 95 },
  { id: 365, totem: 'Renard', cri: 'Rusés', troupeId: 95 },
  { id: 366, totem: 'Lion', cri: 'Vivaces', troupeId: 96 },
  { id: 367, totem: 'Renard', cri: 'Rusés', troupeId: 96 },
  { id: 368, totem: 'Aigle', cri: 'Plus Hauts', troupeId: 96 },
  { id: 369, totem: 'Lion', cri: 'Feroces', troupeId: 97 },
  { id: 370, totem: 'Loup', cri: 'Loyals', troupeId: 97 },
  { id: 371, totem: 'Taureau', cri: 'Terribles', troupeId: 97 },
  { id: 372, totem: 'Lynx', cri: 'Sauvage', troupeId: 98 },
  { id: 373, totem: 'Aigle', cri: 'Plus Haut', troupeId: 98 },
  { id: 374, totem: 'Tigre', cri: 'Terrible', troupeId: 98 },
  { id: 375, totem: 'Bison', cri: 'Ardent', troupeId: 99 },
  { id: 376, totem: 'Requin', cri: 'Tenace', troupeId: 99 },
  { id: 377, totem: 'Loup', cri: "jusque'au bout", troupeId: 99 },
  { id: 378, totem: 'Aigle', cri: 'Coriace', troupeId: 99 },
  { id: 379, totem: 'Grizzly', cri: 'stoïque', troupeId: 99 },
  { id: 380, totem: 'Lynx', cri: 'Hardi', troupeId: 99 },
  { id: 381, totem: 'Lion', cri: 'Certain', troupeId: 100 },
  { id: 382, totem: 'Faucon', cri: 'Plus Haut', troupeId: 100 },
  { id: 383, totem: 'Cheval', cri: 'Empressé', troupeId: 100 },
  { id: 384, totem: 'Panthère', cri: 'Agile', troupeId: 100 },
  { id: 385, totem: 'Tigre', cri: 'Majestueux', troupeId: 100 },
  { id: 386, totem: 'Renard', cri: 'Vaillant', troupeId: 100 },
  { id: 387, totem: 'Leopard', cri: 'Rapid', troupeId: 101 },
  { id: 388, totem: 'Fox', cri: 'Cunning', troupeId: 101 },
  { id: 389, totem: 'Dragon', cri: 'Fiery', troupeId: 101 },
  { id: 390, totem: 'Bear', cri: 'Giant', troupeId: 101 },
  { id: 391, totem: 'Wolf', cri: 'Strong', troupeId: 101 },
  { id: 392, totem: 'Renard', cri: 'Rusée', troupeId: 102 },
  { id: 393, totem: 'Lion', cri: 'Féroce', troupeId: 102 },
  { id: 394, totem: 'Jaguar', cri: 'Redoutable', troupeId: 102 },
  { id: 395, totem: 'Loup', cri: 'Hardi', troupeId: 102 },
  { id: 396, totem: 'Panthère', cri: 'Foudroyante', troupeId: 103 },
  { id: 397, totem: 'Guépard', cri: 'Intrepide', troupeId: 103 },
  { id: 398, totem: 'Dauphin', cri: 'Devoue', troupeId: 103 },
  { id: 399, totem: 'Aigle', cri: 'Plus Haut', troupeId: 103 },
  { id: 400, totem: 'Requin', cri: 'Feroce', troupeId: 104 },
  { id: 401, totem: 'Lion', cri: 'Vaillant', troupeId: 104 },
  { id: 402, totem: 'Faucon', cri: 'Vigilant', troupeId: 104 },
  { id: 403, totem: 'Taureau', cri: 'Vivace', troupeId: 104 },
  { id: 404, totem: 'Orque', cri: 'Audacieux', troupeId: 104 },
  { id: 405, totem: 'Grizzly', cri: 'Robuste', troupeId: 105 },
  { id: 406, totem: 'Condor', cri: 'Imposant', troupeId: 105 },
  { id: 407, totem: 'Espadon', cri: 'Viril', troupeId: 105 },
  { id: 408, totem: 'Guépard', cri: 'Diligent', troupeId: 105 },
  { id: 409, totem: 'Aigle', cri: 'Plus Haut', troupeId: 106 },
  { id: 410, totem: 'Lion', cri: 'Courageux', troupeId: 106 },
  { id: 411, totem: 'Panthère', cri: 'Féroce', troupeId: 106 },
  { id: 412, totem: 'Goelands', cri: 'Au Large', troupeId: 107 },
  { id: 413, totem: 'Lion', cri: 'Vaillants', troupeId: 107 },
  { id: 414, totem: 'Guépard', cri: 'Rapides', troupeId: 107 },
  { id: 415, totem: 'Orcs', cri: 'Puissants', troupeId: 107 },
  { id: 416, totem: 'Renard', cri: 'Rusés', troupeId: 107 },
  { id: 417, totem: 'Tauraux', cri: 'Vivaces', troupeId: 107 },
  { id: 418, totem: 'Renard', cri: 'Rusé', troupeId: 108 },
  { id: 419, totem: 'Poulin', cri: 'Agile', troupeId: 108 },
  { id: 420, totem: 'Aigle', cri: 'Plus Haut', troupeId: 108 },
  { id: 421, totem: 'Lion', cri: 'Courageux', troupeId: 109 },
  { id: 422, totem: 'Aigle', cri: 'Percant', troupeId: 109 },
  { id: 423, totem: 'Lynx', cri: 'Prudent', troupeId: 109 },
  { id: 424, totem: 'Requin', cri: 'Vorace', troupeId: 109 },
  { id: 425, totem: 'Loup', cri: 'Feroce', troupeId: 109 },
  { id: 426, totem: 'Pony', cri: 'Dossil', troupeId: 110 },
  { id: 427, totem: 'Requin', cri: 'Tenas', troupeId: 110 },
  { id: 428, totem: 'Castor', cri: 'Hardi', troupeId: 110 },
  { id: 429, totem: 'Boa', cri: 'Percent', troupeId: 110 },
  { id: 430, totem: 'Bison', cri: 'Fougueux', troupeId: 111 },
  { id: 431, totem: 'Épaulard', cri: 'Puissant', troupeId: 111 },
  { id: 432, totem: 'Panthère', cri: 'Agile', troupeId: 111 },
  { id: 433, totem: 'Aigle', cri: 'Plus Haut', troupeId: 111 },
  { id: 434, totem: 'Cobra', cri: 'Ardan', troupeId: 112 },
  { id: 435, totem: 'Condore', cri: 'Coriasse', troupeId: 112 },
  { id: 436, totem: 'Grizzly', cri: 'Tenace', troupeId: 112 },
  { id: 437, totem: 'Tigre', cri: 'Vigilant', troupeId: 112 },
  { id: 438, totem: 'Boa', cri: 'Placide', troupeId: 113 },
  { id: 439, totem: 'Milan', cri: 'Tonique', troupeId: 113 },
  { id: 440, totem: 'Panthère', cri: 'Agile', troupeId: 113 },
  { id: 441, totem: 'Requin', cri: 'Vorace', troupeId: 113 },
  { id: 442, totem: 'Lion', cri: 'Puissant', troupeId: 114 },
  { id: 443, totem: 'Loup', cri: 'Feroce', troupeId: 114 },
  { id: 444, totem: 'Guépard', cri: 'Rapide', troupeId: 114 },
  { id: 445, totem: 'Mustang', cri: 'Endurant', troupeId: 114 },
  { id: 446, totem: 'Oryx', cri: 'Dévoués', troupeId: 115 },
  { id: 447, totem: 'Bison', cri: 'Robustes', troupeId: 115 },
  { id: 448, totem: 'Aigle', cri: 'Perçants', troupeId: 115 },
  { id: 449, totem: 'Jaguar', cri: 'Rapides', troupeId: 115 },
  { id: 450, totem: 'Bison', cri: 'Sauvage', troupeId: 116 },
  { id: 451, totem: 'Aigle', cri: 'Plus Haut', troupeId: 116 },
  { id: 452, totem: 'Renard', cri: 'Russe', troupeId: 116 },
  { id: 453, totem: 'Ours', cri: 'Gourmad', troupeId: 116 },
  { id: 454, totem: 'Elan', cri: 'Endurant', troupeId: 117 },
  { id: 455, totem: 'Faucon', cri: 'Hardi', troupeId: 117 },
  { id: 456, totem: 'Orque', cri: 'Acharnée', troupeId: 117 },
  { id: 457, totem: 'Lion', cri: 'Vaillant', troupeId: 117 },
  { id: 458, totem: 'Poulain', cri: 'Agile', troupeId: 118 },
  { id: 459, totem: 'Panthère', cri: 'Rapide', troupeId: 118 },
  { id: 460, totem: 'Requin', cri: 'Tenace', troupeId: 118 },
  { id: 461, totem: 'Loup', cri: 'Malin', troupeId: 118 },
  { id: 462, totem: 'Renard', cri: 'Ruse', troupeId: 119 },
  { id: 463, totem: 'Aigle', cri: 'Plus-Haut', troupeId: 119 },
  { id: 464, totem: 'Béluga', cri: 'Serein', troupeId: 119 },
  { id: 465, totem: 'Cerf', cri: 'Alert', troupeId: 119 },
  { id: 466, totem: 'Loup', cri: 'Veilleur', troupeId: 120 },
  { id: 467, totem: 'Lynx', cri: 'Rusée', troupeId: 120 },
  { id: 468, totem: 'Buffalo', cri: 'Agressive', troupeId: 120 },
  { id: 469, totem: 'Lion', cri: 'Plus Fort', troupeId: 121 },
  { id: 470, totem: 'Eagle', cri: 'Plus Haut', troupeId: 121 },
  { id: 471, totem: 'Daulphins', cri: 'Emable', troupeId: 121 },
  { id: 472, totem: 'Loup', cri: 'Fidèle', troupeId: 122 },
  { id: 473, totem: 'Requin', cri: 'Agressive', troupeId: 122 },
  { id: 474, totem: 'Aigle', cri: 'Tout-Voiyant', troupeId: 122 },
  { id: 475, totem: 'Bison', cri: 'Resistant', troupeId: 122 },
  { id: 476, totem: 'Requin', cri: 'Vorace', troupeId: 123 },
  { id: 477, totem: 'Renard', cri: 'Rusé', troupeId: 123 },
  { id: 478, totem: 'Lion', cri: 'Feroce', troupeId: 123 },
  { id: 479, totem: 'Guépard', cri: 'Vigilant', troupeId: 123 },
  { id: 480, totem: 'Boa', cri: 'Acharné', troupeId: 123 },
  { id: 481, totem: 'Faucon', cri: 'Plus Haut', troupeId: 123 },
  { id: 482, totem: 'Grizzly', cri: 'Coriace', troupeId: 123 },
  { id: 483, totem: 'Hyène', cri: '', troupeId: 124 },
  { id: 484, totem: 'Cerf', cri: 'Agile', troupeId: 124 },
  { id: 485, totem: 'Tigre', cri: 'Féroce', troupeId: 124 },
  { id: 486, totem: 'Lion', cri: '', troupeId: 124 },
  { id: 487, totem: 'Faucon', cri: 'Rapace', troupeId: 124 },
  { id: 488, totem: 'Dauphin', cri: '', troupeId: 11 },
  { id: 489, totem: 'Ours', cri: 'Feroce', troupeId: 34 },
  { id: 490, totem: 'Requin', cri: 'Ardent', troupeId: 18 },
  { id: 491, totem: 'Lion', cri: 'Feroce', troupeId: 43 },
];

// SQL Troupes mapping: SQL troupe id -> {name, groupe, districtId}
// This maps the TroupeId in patrouilles to the actual troupe data
const sqlTroupesMapping = [
  { id: 1, name: '', groupe: 'Christ Roi, Zahlé', districtId: 1 },
  { id: 2, name: '', groupe: 'Notre Dame du Secours, Maalka', districtId: 1 },
  { id: 3, name: '', groupe: 'Saint Antoine, Jdeidet El Fekha', districtId: 1 },
  { id: 4, name: '', groupe: 'Antranik Sevan, Sin El Fil', districtId: 2 },
  { id: 5, name: '', groupe: 'Baden Powell, N.D. de Nazareth, Achrafieh', districtId: 2 },
  { id: 6, name: 'Troupe Étoile', groupe: 'Sacré-Coeur, Gemmayzé', districtId: 2 },
  { id: 7, name: 'Troupe Flamme', groupe: 'Sacré-Coeur, Gemmayzé', districtId: 2 },
  { id: 8, name: 'Troupe Saint Augustin', groupe: 'Sagesse, Achrafieh', districtId: 2 },
  { id: 9, name: 'Troupe Saint Ignace', groupe: 'Sagesse, Achrafieh', districtId: 2 },
  { id: 10, name: '', groupe: 'Saint Antoine De Padoue, Horch Tabet', districtId: 2 },
  { id: 11, name: '', groupe: 'Saint Vincent de Paul, Achrafieh', districtId: 2 },
  { id: 12, name: '', groupe: 'Sainte Rita Di Cascia, Sin El Fil', districtId: 2 },
  { id: 13, name: '', groupe: 'Besançon, Baabda', districtId: 3 },
  { id: 14, name: '', groupe: 'Carmel-Elysée, Hazmieh', districtId: 3 },
  { id: 15, name: '', groupe: 'Franciscaines, Badaro', districtId: 3 },
  { id: 16, name: '', groupe: 'Frères Notre Dame, Furn El Chebbak', districtId: 3 },
  { id: 17, name: '', groupe: 'Melkart, Louaizeh', districtId: 3 },
  { id: 18, name: '', groupe: 'Notre Dame de la Délivrande, Araya', districtId: 3 },
  { id: 19, name: 'Troupe 10', groupe: 'Notre Dame, Jamhour', districtId: 3 },
  { id: 20, name: 'Troupe 2', groupe: 'Notre Dame, Jamhour', districtId: 3 },
  { id: 21, name: 'Troupe 3', groupe: 'Notre Dame, Jamhour', districtId: 3 },
  { id: 22, name: 'Troupe Flamme', groupe: 'Sagesse, St Jean, Brasilia', districtId: 3 },
  { id: 23, name: 'Troupe Lumiere', groupe: 'Sagesse, St Jean, Brasilia', districtId: 3 },
  { id: 24, name: 'Troupe Zenith', groupe: 'Sagesse, St Jean, Brasilia', districtId: 3 },
  { id: 25, name: 'Troupe Prémice', groupe: 'Saints Coeurs, Hadath', districtId: 3 },
  { id: 26, name: '', groupe: '40 Martyrs, Alma', districtId: 4 },
  { id: 27, name: '', groupe: 'Bayader Rachiine', districtId: 4 },
  { id: 28, name: '', groupe: 'C.J.C., Tripoli', districtId: 4 },
  { id: 29, name: '', groupe: 'De La Salle, Kfaryachit', districtId: 4 },
  { id: 30, name: '', groupe: 'Harf Ardeh', districtId: 4 },
  { id: 31, name: '', groupe: 'Notre Dame du Mont Carmel, Mejdlaya', districtId: 4 },
  { id: 32, name: '', groupe: 'Saint Esprit, Zgharta Zawyeh', districtId: 4 },
  { id: 33, name: '', groupe: 'Saint Joseph, Dahr el Ain', districtId: 4 },
  { id: 34, name: '', groupe: 'Saint Joseph, Capucins, Batroun', districtId: 5 },
  { id: 35, name: '', groupe: 'Saints Coeurs, Batroun', districtId: 5 },
  { id: 36, name: '', groupe: 'Notre Dame de la Paix, Kobayat', districtId: 6 },
  { id: 37, name: '', groupe: 'Notre Dame du Mont Carmel, Kobayat', districtId: 6 },
  { id: 38, name: '', groupe: 'Saint Joseph, Andaket', districtId: 6 },
  { id: 39, name: '', groupe: 'Sainte Moura, Kobayat', districtId: 6 },
  { id: 40, name: '', groupe: 'Notre Dame, Ain Ebel', districtId: 7 },
  { id: 41, name: '', groupe: 'Notre Dame, Maghdouché', districtId: 7 },
  { id: 42, name: '', groupe: 'Saint Georges, Debel', districtId: 7 },
  { id: 43, name: '', groupe: 'Saint Georges, Mieh w Mieh', districtId: 7 },
  { id: 44, name: '', groupe: 'Saint Georges, Rmeich', districtId: 7 },
  { id: 45, name: '', groupe: 'Saints Coeurs, Jezzine', districtId: 7 },
  { id: 46, name: '', groupe: 'Mar Doumit, Sin El Fil', districtId: 8 },
  { id: 47, name: '', groupe: 'Notre Dame des Apotres, Sabtieh', districtId: 8 },
  { id: 48, name: '', groupe: 'Notre Dame, Fanar', districtId: 8 },
  { id: 49, name: '', groupe: 'Saint Maron, Bauchrieh', districtId: 8 },
  { id: 50, name: '', groupe: 'Saint Mesrob, Borj Hammoud', districtId: 8 },
  { id: 51, name: '', groupe: 'Saint Vincent de Paul, Borj Hammoud', districtId: 8 },
  { id: 52, name: '', groupe: 'Sainte Rita, Sin El Fil', districtId: 8 },
  { id: 53, name: '', groupe: 'Frères, Baskinta', districtId: 9 },
  { id: 54, name: '', groupe: 'Jesus and Mary, Kornet Chehwan', districtId: 9 },
  { id: 55, name: '', groupe: 'Notre Dame de la Delivrance, Bikfaya', districtId: 9 },
  { id: 56, name: '', groupe: 'Notre Dame de la Délivrance, Breij', districtId: 9 },
  { id: 57, name: '', groupe: 'Notre Dame du Rosaire, Kornet El Hamra', districtId: 9 },
  { id: 58, name: '', groupe: 'Saint Antoine, Beit Chabeb', districtId: 9 },
  { id: 59, name: 'Troupe Cabestan', groupe: 'Saint Joseph, Kornet Chehwan', districtId: 9 },
  { id: 60, name: 'Troupe Carré', groupe: 'Saint Joseph, Kornet Chehwan', districtId: 9 },
  { id: 61, name: 'Troupe Carrick', groupe: 'Saint Joseph, Kornet Chehwan', districtId: 9 },
  { id: 62, name: '', groupe: 'Saint Maron, Mazraat Yachouh', districtId: 9 },
  { id: 63, name: '', groupe: 'Animation Sportive, Zouk Mikael', districtId: 10 },
  { id: 64, name: '1ère Troupe', groupe: 'Apôtres, Jounieh', districtId: 10 },
  { id: 65, name: '2ème Troupe', groupe: 'Apôtres, Jounieh', districtId: 10 },
  { id: 66, name: '3eme Troupe', groupe: 'Apôtres, Jounieh', districtId: 10 },
  { id: 67, name: 'Troupe Pegase', groupe: 'G.S.S., Jounieh', districtId: 10 },
  { id: 68, name: 'Troupe Boréale', groupe: 'G.S.S., Jounieh', districtId: 10 },
  { id: 69, name: '', groupe: 'Sahel Alma', districtId: 10 },
  { id: 70, name: '', groupe: "Saint Francois d'Assise, Paradis d'enfants, Jounieh", districtId: 10 },
  { id: 71, name: 'Troupe A', groupe: 'Saint Joseph, Antoura', districtId: 10 },
  { id: 72, name: 'Troupe B', groupe: 'Saint Joseph, Antoura', districtId: 10 },
  { id: 73, name: '', groupe: 'Sainte Famille Française, Jounieh', districtId: 10 },
  { id: 74, name: '', groupe: 'Saint Antoine, Hammana', districtId: 11 },
  { id: 75, name: '', groupe: 'Saint Georges, Majed El Meouch', districtId: 11 },
  { id: 76, name: '', groupe: 'Saint Michel, Damour', districtId: 11 },
  { id: 77, name: '', groupe: 'Saydet El Talleh, Deir El Kamar', districtId: 11 },
  { id: 78, name: 'Troupe Peaux-Rouges', groupe: 'Mont La Salle, Ain Saadé', districtId: 12 },
  { id: 79, name: 'Troupe chevaliers', groupe: 'Mont La Salle, Ain Saadé', districtId: 12 },
  { id: 80, name: 'Troupe Mousquetaires', groupe: 'Mont La Salle, Ain Saadé', districtId: 12 },
  { id: 81, name: '', groupe: 'Sagesse High School, Ain Saadé', districtId: 12 },
  { id: 82, name: '', groupe: 'Saint Antoine, Baabdat', districtId: 12 },
  { id: 83, name: 'Troupe Centaure', groupe: 'Sainte Famille, Fanar', districtId: 12 },
  { id: 84, name: 'Troupe Griffon', groupe: 'Sainte Famille, Fanar', districtId: 12 },
  { id: 85, name: '', groupe: 'Sainte Marie, Beit Mery', districtId: 12 },
  { id: 86, name: '', groupe: 'Sainte Marina, Daychounieh', districtId: 12 },
  { id: 87, name: '', groupe: 'Sainte Rafqa, Tilal Ain Saadé', districtId: 12 },
  { id: 88, name: 'Troupe Cavalier', groupe: 'Saints Coeurs, Ain Najm', districtId: 12 },
  { id: 89, name: 'Troupe Ouragan', groupe: 'Saints Coeurs, Ain Najm', districtId: 12 },
  { id: 90, name: '', groupe: 'Club Amchit, Amchit', districtId: 13 },
  { id: 91, name: '', groupe: 'Daroun, Daroun-Harissa', districtId: 13 },
  { id: 92, name: '', groupe: 'Ecole Allemande, Jounieh', districtId: 13 },
  { id: 93, name: 'Troupe Orion', groupe: 'Frères Maristes, Jbeil', districtId: 13 },
  { id: 94, name: 'Troupe Phoenix', groupe: 'Frères Maristes, Jbeil', districtId: 13 },
  { id: 95, name: '', groupe: 'Notre Dame Habchieh, Ghazir', districtId: 13 },
  { id: 96, name: '', groupe: 'Saint Jacques, Bouar', districtId: 13 },
  { id: 97, name: '', groupe: 'Saint Sacrement, Beit Habbak', districtId: 13 },
  { id: 98, name: '', groupe: 'Saints Coeurs, Jbeil', districtId: 13 },
  { id: 99, name: 'Troupe 2', groupe: 'Saints Coeurs, Kfarhbab', districtId: 13 },
  { id: 100, name: 'Troupe I', groupe: 'Saints Coeurs, Kfarhbab', districtId: 13 },
  { id: 101, name: '', groupe: 'Antranik, Antelias', districtId: 14 },
  { id: 102, name: '', groupe: 'Athénée de Beyrouth, Bsalim', districtId: 14 },
  { id: 103, name: '', groupe: 'Sagesse Saint Marons, Jdeideh', districtId: 14 },
  { id: 104, name: 'Troupe Pégase', groupe: 'Saint Esprit, Kobeize', districtId: 14 },
  { id: 105, name: 'Troupe Phénix', groupe: 'Saint Esprit, Kobeize', districtId: 14 },
  { id: 106, name: '', groupe: 'Saint Georges, Zalka', districtId: 14 },
  { id: 107, name: '', groupe: 'Saint Vincent de Paul, Naccache', districtId: 14 },
  { id: 108, name: '', groupe: 'Sainte Rita, Dbayeh', districtId: 14 },
  { id: 109, name: '', groupe: 'Saints Coeurs, Bauchrieh', districtId: 14 },
  { id: 110, name: 'Troupe Impessa', groupe: 'Val Père Jacques, Bkenaya', districtId: 14 },
  { id: 111, name: 'Troupe Koudou', groupe: 'Val Père Jacques, Bkenaya', districtId: 14 },
  { id: 112, name: 'Troupe Apache', groupe: 'Champville, Dik El Mehdi', districtId: 15 },
  { id: 113, name: 'Troupe Bannocks', groupe: 'Champville, Dik El Mehdi', districtId: 15 },
  { id: 114, name: 'Troupe Cherokees', groupe: 'Champville, Dik El Mehdi', districtId: 15 },
  { id: 115, name: 'Troupe Comanches', groupe: 'Champville, Dik El Mehdi', districtId: 15 },
  { id: 116, name: '', groupe: 'Mar Ephrem, Kfardebian', districtId: 15 },
  { id: 117, name: 'Troupe Ouragan', groupe: 'Notre Dame de Louaizé, Zouk Mosbeh', districtId: 15 },
  { id: 118, name: 'Troupe Soleil', groupe: 'Notre Dame de Louaizé, Zouk Mosbeh', districtId: 15 },
  { id: 119, name: 'Troupe Eclair', groupe: 'Notre Dame de Louaizé, Zouk Mosbeh', districtId: 15 },
  { id: 120, name: '', groupe: 'Notre Dame, Zakrit', districtId: 15 },
  { id: 121, name: '', groupe: 'Saint Michel, Jeita', districtId: 15 },
  { id: 122, name: '', groupe: 'Saint Vincent de Paul, Ajaltoun', districtId: 15 },
  { id: 123, name: '', groupe: 'Saints Coeurs, Sioufi', districtId: 2 },
  { id: 124, name: '', groupe: 'Saint Maron, Chekka', districtId: 5 },
];

async function main() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // 1. Extract districts from MongoDB
    console.log('\n1. Extracting districts from MongoDB...');
    const mongoDistricts = await db.collection('districts').find({}).toArray();
    console.log(`   Found ${mongoDistricts.length} districts`);

    // 2. Extract groups from MongoDB
    console.log('\n2. Extracting groups from MongoDB...');
    const mongoGroups = await db.collection('groups').find({}).toArray();
    console.log(`   Found ${mongoGroups.length} groups`);

    // 3. Extract units (Eclaireurs only) from MongoDB
    console.log('\n3. Extracting Eclaireurs units from MongoDB...');
    const mongoUnits = await db.collection('units').find({ brancheExternalId: 'Eclaireurs' }).toArray();
    console.log(`   Found ${mongoUnits.length} Eclaireurs units`);

    // Build district externalId to MongoDB _id mapping
    const districtExternalToMongo = new Map();
    mongoDistricts.forEach(d => {
      districtExternalToMongo.set(d.externalId, d);
    });

    // Build group externalId to MongoDB _id mapping
    const groupExternalToMongo = new Map();
    mongoGroups.forEach(g => {
      groupExternalToMongo.set(g.externalId, g);
    });

    // Create SQL district mapping (SQL DistrictId -> district abbreviation)
    // The SQL troupes have DistrictId 1-15 matching the order in districts
    const sqlDistrictIdToAbbr = {
      1: 'BEK', 2: 'BEY1', 3: 'BEY2', 4: 'LN1', 5: 'LN2', 6: 'LN3',
      7: 'LS', 8: 'ML1', 9: 'ML2', 10: 'ML3', 11: 'ML4', 12: 'ML5',
      13: 'ML6', 14: 'ML7', 15: 'ML8'
    };

    // Build district data for seed file
    const districts = mongoDistricts.map((d, idx) => ({
      id: idx + 1,
      name: d.name,
      code: d.abbreviation,
      externalId: d.externalId
    }));

    // Build group data for seed file
    // Find district id for each group
    const groups = [];
    mongoGroups.forEach((g, idx) => {
      const districtExternalId = g.districtExternalId;
      const district = districts.find(d => d.externalId === districtExternalId);
      if (district) {
        groups.push({
          id: idx + 1,
          name: g.name,
          districtId: district.id,
          externalId: g.externalId
        });
      }
    });

    // Build troupe (unit) data for seed file
    const troupes = [];
    mongoUnits.forEach((u, idx) => {
      const group = groups.find(g => g.externalId === u.groupExternalId);
      if (group) {
        troupes.push({
          id: idx + 1,
          name: u.name,
          groupId: group.id,
          groupName: group.name,
          districtId: group.districtId,
          externalId: u.externalId
        });
      }
    });

    console.log(`\n4. Building unit mapping for patrouilles...`);

    // Now we need to map SQL TroupeId to MongoDB units
    // SQL troupe = {name, groupe, districtId}
    // MongoDB unit = {name, group.name, district.abbreviation}
    //
    // Strategy: Match by (troupeName + groupeName + districtAbbr)
    // If troupeName is empty, match by (groupeName + districtAbbr)

    const sqlTroupeToMongoUnit = new Map();

    for (const sqlTroupe of sqlTroupesMapping) {
      const districtAbbr = sqlDistrictIdToAbbr[sqlTroupe.districtId];
      const district = districts.find(d => d.code === districtAbbr);

      if (!district) continue;

      // Find matching group
      const matchingGroups = groups.filter(g =>
        g.districtId === district.id &&
        (g.name === sqlTroupe.groupe ||
         g.name.toLowerCase().includes(sqlTroupe.groupe.toLowerCase().split(',')[0].trim()) ||
         sqlTroupe.groupe.toLowerCase().includes(g.name.toLowerCase().split(',')[0].trim()))
      );

      if (matchingGroups.length === 0) {
        // Try partial match
        const groupNameParts = sqlTroupe.groupe.toLowerCase().split(',')[0].trim();
        const partialMatch = groups.filter(g =>
          g.districtId === district.id &&
          g.name.toLowerCase().includes(groupNameParts)
        );
        if (partialMatch.length > 0) {
          matchingGroups.push(...partialMatch);
        }
      }

      if (matchingGroups.length > 0) {
        // Find matching unit
        for (const group of matchingGroups) {
          const matchingUnits = troupes.filter(t =>
            t.groupId === group.id &&
            (sqlTroupe.name === '' ||
             t.name.toLowerCase() === sqlTroupe.name.toLowerCase() ||
             t.name.toLowerCase().includes(sqlTroupe.name.toLowerCase()) ||
             sqlTroupe.name.toLowerCase().includes(t.name.toLowerCase()))
          );

          if (matchingUnits.length > 0) {
            // If multiple matches and we have a troupe name, prefer exact match
            let bestMatch = matchingUnits[0];
            if (sqlTroupe.name && matchingUnits.length > 1) {
              const exactMatch = matchingUnits.find(u =>
                u.name.toLowerCase() === sqlTroupe.name.toLowerCase()
              );
              if (exactMatch) bestMatch = exactMatch;
            }

            sqlTroupeToMongoUnit.set(sqlTroupe.id, bestMatch.id);
            break;
          } else if (sqlTroupe.name === '') {
            // If no troupe name, just use first unit in group
            const anyUnit = troupes.find(t => t.groupId === group.id);
            if (anyUnit) {
              sqlTroupeToMongoUnit.set(sqlTroupe.id, anyUnit.id);
              break;
            }
          }
        }
      }
    }

    console.log(`   Mapped ${sqlTroupeToMongoUnit.size} of ${sqlTroupesMapping.length} SQL troupes to MongoDB units`);

    // Build patrouilles data with new unit mapping
    const patrouilles = [];
    let unmappedCount = 0;

    for (const p of patrouillesFromSQL) {
      const unitId = sqlTroupeToMongoUnit.get(p.troupeId);
      if (unitId) {
        patrouilles.push({
          id: p.id,
          totem: p.totem,
          cri: p.cri || '',
          troupeId: unitId  // Now mapped to MongoDB unit id
        });
      } else {
        unmappedCount++;
      }
    }

    console.log(`   Created ${patrouilles.length} patrouilles (${unmappedCount} unmapped)`);

    // Generate the seed data file
    console.log('\n5. Generating seedData.js...');

    const seedDataContent = `// Auto-generated seed data from MongoDB (suivi2025)
// Generated on: ${new Date().toISOString()}

// Districts from MongoDB
export const districts = ${JSON.stringify(districts.map(d => ({
  id: d.id,
  name: d.name,
  code: d.code
})), null, 2)};

// Groups extracted from MongoDB
export const groupsData = ${JSON.stringify(groups.map(g => ({
  id: g.id,
  name: g.name,
  districtId: g.districtId
})), null, 2)};

// Troupes (Units) from MongoDB - Eclaireurs branch only
export const troupesData = ${JSON.stringify(troupes.map(t => ({
  id: t.id,
  name: t.name,
  groupId: t.groupId,
  groupName: t.groupName
})), null, 2)};

// Patrouilles from RNE25 SQL mapped to MongoDB units
export const patrouillesData = ${JSON.stringify(patrouilles, null, 2)};

// Categories
export const categories = [
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
`;

    const seedDataPath = path.join(__dirname, '../prisma/seedData.js');
    fs.writeFileSync(seedDataPath, seedDataContent);
    console.log(`   Written to: ${seedDataPath}`);

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Districts: ${districts.length}`);
    console.log(`Groups: ${groups.length}`);
    console.log(`Troupes (Eclaireurs units): ${troupes.length}`);
    console.log(`Patrouilles: ${patrouilles.length}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\nMongoDB connection closed.');
  }
}

main().catch(console.error);
