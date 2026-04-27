// Read-only diagnostic for "missing BEY1 schematic images".
//
// Compares the live SCHEMATIC PictureSet state under district BEY1 against the
// PictureAudit trail, then reports:
//   1. Per-troupe / per-patrouille counts of SCHEMATIC PictureSets by status.
//   2. Every PictureAudit row whose snapshotted troupe sits under BEY1 — i.e.
//      every destructive action that touched a BEY1 schematic.
//   3. PictureSets referenced by audit rows that no longer exist (deleted).
//   4. Pictures still on PictureSets but flagged isArchived=true.
//
// Usage (from backend/):
//   node scripts/auditBey1Schematics.js
//   node scripts/auditBey1Schematics.js --district=BEY2   # any code
//   node scripts/auditBey1Schematics.js --since=2026-04-20

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
);

const DISTRICT_CODE = (args.district || 'BEY1').toUpperCase();
const SINCE = args.since ? new Date(args.since) : null;

const fmt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '—');

async function main() {
  const district = await prisma.district.findUnique({
    where: { code: DISTRICT_CODE },
    include: {
      groups: {
        include: {
          troupes: { include: { patrouilles: true } },
        },
      },
    },
  });

  if (!district) {
    console.error(`District code "${DISTRICT_CODE}" not found.`);
    process.exit(1);
  }

  const troupeIds = district.groups.flatMap((g) => g.troupes.map((t) => t.id));
  const troupeById = new Map();
  const patrouilleById = new Map();
  for (const g of district.groups) {
    for (const t of g.troupes) {
      troupeById.set(t.id, { ...t, groupName: g.name });
      for (const p of t.patrouilles) patrouilleById.set(p.id, p);
    }
  }

  console.log(`\n=== District ${district.name} (${district.code}) ===`);
  console.log(`Groups: ${district.groups.length}, Troupes: ${troupeIds.length}\n`);

  // 1. Live PictureSet counts (SCHEMATIC only).
  const liveSets = await prisma.pictureSet.findMany({
    where: { type: 'SCHEMATIC', troupeId: { in: troupeIds } },
    select: {
      id: true,
      status: true,
      troupeId: true,
      patrouilleId: true,
      categoryId: true,
      createdAt: true,
      _count: { select: { pictures: true } },
    },
  });

  // Roll up by troupe/patrouille/status.
  const roll = {};
  for (const s of liveSets) {
    const t = troupeById.get(s.troupeId);
    const tName = t ? `${t.groupName} — ${t.name}` : `troupe#${s.troupeId}`;
    const pName = s.patrouilleId
      ? (patrouilleById.get(s.patrouilleId)?.name || `pat#${s.patrouilleId}`)
      : '(no patrouille)';
    if (!roll[tName]) roll[tName] = {};
    if (!roll[tName][pName]) roll[tName][pName] = { PENDING: 0, CLASSIFIED: 0, APPROVED: 0, REJECTED: 0, pics: 0 };
    roll[tName][pName][s.status] += 1;
    roll[tName][pName].pics += s._count.pictures;
  }

  console.log('--- Live SCHEMATIC PictureSets (by troupe / patrouille / status) ---');
  for (const tName of Object.keys(roll).sort()) {
    console.log(`\n${tName}`);
    for (const pName of Object.keys(roll[tName]).sort()) {
      const r = roll[tName][pName];
      console.log(
        `   ${pName.padEnd(28)}  PENDING=${r.PENDING}  CLASSIFIED=${r.CLASSIFIED}  APPROVED=${r.APPROVED}  REJECTED=${r.REJECTED}  pictures=${r.pics}`
      );
    }
  }

  // 2. Archived pictures still attached to live sets in this district.
  const archived = await prisma.picture.findMany({
    where: {
      isArchived: true,
      pictureSet: { type: 'SCHEMATIC', troupeId: { in: troupeIds } },
    },
    select: {
      id: true,
      filePath: true,
      archivedAt: true,
      pictureSetId: true,
      pictureSet: {
        select: {
          status: true,
          troupeId: true,
          patrouilleId: true,
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { archivedAt: 'desc' },
  });

  console.log(`\n--- Archived pictures on live SCHEMATIC sets: ${archived.length} ---`);
  for (const p of archived.slice(0, 50)) {
    const t = troupeById.get(p.pictureSet.troupeId);
    const tName = t ? `${t.groupName} — ${t.name}` : `troupe#${p.pictureSet.troupeId}`;
    const pat = p.pictureSet.patrouilleId
      ? (patrouilleById.get(p.pictureSet.patrouilleId)?.name || `pat#${p.pictureSet.patrouilleId}`)
      : '—';
    console.log(
      `  pic#${p.id}  set#${p.pictureSetId}  ${fmt(p.archivedAt)}  ${tName}  /  ${pat}  /  ${p.pictureSet.category?.name || '—'}`
    );
  }
  if (archived.length > 50) console.log(`  … (${archived.length - 50} more)`);

  // 3. Audit trail. PictureAudit snapshots troupeId at the time of the action,
  //    so even if the picture/set has been deleted the trail still pins it to a troupe.
  const audit = await prisma.pictureAudit.findMany({
    where: {
      troupeId: { in: troupeIds },
      ...(SINCE ? { createdAt: { gte: SINCE } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      actor: { select: { name: true, role: true } },
      pictureSet: { select: { id: true, type: true, status: true } },
      picture: { select: { id: true, filePath: true } },
    },
  });

  // Filter to schematic-related audits when we can tell. PictureAudit doesn't
  // store the picture type, but pictureSetStatusAtAction + the live set type
  // are useful, and most schematic-vs-photo distinction lives in the set. We
  // keep everything in this district for the report and tag rows where we can
  // confirm the type.
  console.log(`\n--- PictureAudit rows for ${DISTRICT_CODE} (${audit.length} total${SINCE ? `, since ${SINCE.toISOString().slice(0,10)}` : ''}) ---`);

  const byAction = {};
  for (const a of audit) byAction[a.action] = (byAction[a.action] || 0) + 1;
  console.log('Counts by action:');
  for (const [k, v] of Object.entries(byAction).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }

  console.log('\nMost recent 60 entries:');
  for (const a of audit.slice(0, 60)) {
    const t = troupeById.get(a.troupeId);
    const tName = t ? `${t.groupName} — ${t.name}` : `troupe#${a.troupeId}`;
    const setType = a.pictureSet?.type || '?';
    const setStatus = a.pictureSet?.status || a.pictureSetStatusAtAction || '?';
    console.log(
      `  ${fmt(a.createdAt)}  ${a.action.padEnd(28)}  set#${a.pictureSetId ?? '—'} (${setType}/${setStatus})  pic#${a.pictureId ?? '—'}  by=${a.actor?.name || '—'} (${a.actorRole || '—'})  troupe=${tName}`
    );
    if (a.details) {
      const detail = String(a.details).slice(0, 200);
      console.log(`      details: ${detail}`);
    }
  }
  if (audit.length > 60) console.log(`  … (${audit.length - 60} more)`);

  // 4. Audit rows whose pictureSet is gone (was deleted).
  const lostSets = audit.filter((a) => a.pictureSetId && !a.pictureSet);
  console.log(`\n--- Audit rows whose PictureSet no longer exists: ${lostSets.length} ---`);
  const setsSeen = new Set();
  for (const a of lostSets) {
    if (setsSeen.has(a.pictureSetId)) continue;
    setsSeen.add(a.pictureSetId);
    const t = troupeById.get(a.troupeId);
    const tName = t ? `${t.groupName} — ${t.name}` : `troupe#${a.troupeId}`;
    console.log(`  set#${a.pictureSetId}  ${fmt(a.createdAt)}  last-action=${a.action}  troupe=${tName}  filePath=${a.filePath || '—'}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
