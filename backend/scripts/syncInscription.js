#!/usr/bin/env node
//
// Keep Nodus's organisational structure in step with Inscription
// (inscription.scoutsduliban.org), the way SEVA does: districts, groups and
// units are fetched by id, created when new, renamed when they are renamed,
// and **deactivated — never deleted — when they disappear**.
//
// Why deactivate rather than delete: a group that folds or a troupe that
// merges still has photos of the camps it ran. Those must stay browsable.
// A deactivated row keeps every picture, simply stops appearing in the
// pickers where someone would choose it for a new upload.
//
// The database enforces this too: Group → Troupe → PictureSet are ON DELETE
// RESTRICT (migration 20261109090000_org_soft_delete), so even a bug cannot
// cascade a structural change into the photo archive.
//
//   node scripts/syncInscription.js                  # dry run — prints a plan
//   node scripts/syncInscription.js --apply          # create + rename + link
//   node scripts/syncInscription.js --apply --deactivate   # also deactivate
//   node scripts/syncInscription.js --apply --branche      # also set branche
//   node scripts/syncInscription.js --apply --all          # all of the above
//
// Needs the nodus client's service account (OIDC_CLIENT_SECRET) with the realm
// roles Read_Group and Read_Unit — see docs/KEYCLOAK.md §8.

import '../src/config/env.js';
import { PrismaClient } from '@prisma/client';
import { keycloak, inscription as cfg } from '../src/config/keycloak.js';
import { BRANCHES } from '../src/utils/keycloakAccess.js';

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALL = argv.includes('--all');
const DEACTIVATE = ALL || argv.includes('--deactivate');
const WITH_BRANCHE = ALL || argv.includes('--branche');

/** Same name, ignoring case, accents, punctuation and double spaces. */
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// --- Inscription API --------------------------------------------------------

async function serviceToken() {
  if (!keycloak.enabled || !keycloak.clientSecret) {
    throw new Error(
      'KEYCLOAK_URL and OIDC_CLIENT_SECRET must be set — the service account reads Inscription'
    );
  }
  const res = await fetch(`${keycloak.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: keycloak.clientId,
      client_secret: keycloak.clientSecret,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Service account token refused (${body.error_description || body.error || res.status})`
    );
  }
  return body.access_token;
}

async function api(path, token) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Language': 'fr' },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 403) {
    throw new Error(
      `Inscription refused ${path} — give the service account Read_Group and Read_Unit`
    );
  }
  if (!res.ok) throw new Error(`Inscription responded ${res.status} on ${path}`);
  return res.json();
}

const rows = (v) => (Array.isArray(v) ? v : v?.items || []);
const extId = (o) => String(o?.externalId ?? o?.id ?? '').trim();

/** The branche of a unit, mapped onto the spelling Nodus uses. */
const brancheOf = (u) => {
  const raw =
    typeof u.branch === 'string'
      ? u.branch
      : u.branch?.nameFr || u.branch?.name || u.brancheName || u.brancheExternalId || '';
  return BRANCHES.find((b) => norm(b) === norm(raw)) || '';
};

// --- the plan ---------------------------------------------------------------

const plan = { create: [], rename: [], link: [], deactivate: [], reactivate: [], branche: [], skip: [] };
const say = (bucket, line) => plan[bucket].push(line);

async function main() {
  console.log(`Inscription : ${cfg.baseUrl}`);
  console.log(`Mode        : ${APPLY ? 'APPLY (writing)' : 'dry run — nothing will be written'}`);
  console.log(
    `Options     : deactivate=${DEACTIVATE ? 'on' : 'OFF'} branche=${WITH_BRANCHE ? 'on' : 'OFF'}\n`
  );

  const token = await serviceToken();

  // ---------- districts ----------
  // Nodus's 15 districts were linked by code in the Keycloak migration; this
  // only refreshes their names. Districts are never created or deactivated
  // here — the federation's district list is stable and nodus rows carry
  // branche-access grants.
  const insDistricts = rows(await api('/Districts', token).catch(() => []));
  const nodusDistricts = await prisma.district.findMany();
  for (const d of nodusDistricts) {
    const hit = insDistricts.find((x) => extId(x) === d.externalId);
    if (!hit) continue;
    const name = String(hit.name || hit.nameFr || '').trim();
    if (name && name !== d.name) say('rename', `district ${d.code}: "${d.name}" -> "${name}"`);
    if (APPLY) {
      await prisma.district.update({
        where: { id: d.id },
        data: { ...(name && name !== d.name ? { name } : {}), lastSyncedAt: new Date() },
      });
    }
  }
  console.log(`districts : ${nodusDistricts.length} in nodus, ${insDistricts.length} from Inscription`);

  // ---------- groups ----------
  const insGroups = rows(await api('/Groups', token));
  const nodusGroups = await prisma.group.findMany();
  const districtByExt = new Map(nodusDistricts.filter((d) => d.externalId).map((d) => [d.externalId, d]));

  // Index nodus groups by Inscription id, and by name for first-time linking.
  const gByExt = new Map(nodusGroups.filter((g) => g.externalId).map((g) => [g.externalId, g]));
  const gByName = new Map();
  for (const g of nodusGroups) {
    const k = norm(g.name);
    if (gByName.has(k)) gByName.set(k, null); // ambiguous — never guess
    else gByName.set(k, g);
  }

  const seenGroupIds = new Set();

  for (const ig of insGroups) {
    const id = extId(ig);
    if (!id) continue;
    seenGroupIds.add(id);
    const name = String(ig.name || ig.nameFr || '').trim();
    const districtExt = String(
      ig.districtExternalId ?? ig.district?.externalId ?? ig.districtId ?? ''
    ).trim();
    const district = districtByExt.get(districtExt);

    let g = gByExt.get(id);
    if (!g) {
      // First time we see this Inscription id: adopt an existing row by name,
      // or create a new one.
      const byName = gByName.get(norm(name));
      if (byName && !byName.externalId) {
        g = byName;
        say('link', `group "${name}" -> Inscription #${id}`);
        if (APPLY) {
          await prisma.group.update({
            where: { id: g.id },
            data: { externalId: id, lastSyncedAt: new Date() },
          });
        }
      } else if (!byName) {
        if (!district) {
          say('skip', `group "${name}" (#${id}): district ${districtExt} unknown in nodus`);
          continue;
        }
        say('create', `group "${name}" (#${id}) in ${district.code}`);
        if (APPLY) {
          await prisma.group.create({
            data: {
              name,
              // Groups need a unique code; Inscription has none, so derive one.
              code: `G${id}`,
              externalId: id,
              districtId: district.id,
              lastSyncedAt: new Date(),
            },
          });
        }
        continue;
      } else {
        say('skip', `group "${name}" (#${id}): nodus name is ambiguous`);
        continue;
      }
    }

    // Known group: refresh its name, and reactivate if it came back.
    const patch = { lastSyncedAt: new Date() };
    if (name && name !== g.name) {
      say('rename', `group #${g.id}: "${g.name}" -> "${name}"`);
      patch.name = name;
    }
    if (g.isActive === false) {
      say('reactivate', `group "${g.name}" (#${g.id}) is in Inscription again`);
      patch.isActive = true;
    }
    if (APPLY) await prisma.group.update({ where: { id: g.id }, data: patch });
  }

  // Groups Nodus knows that Inscription no longer lists.
  for (const g of nodusGroups) {
    if (!g.externalId || seenGroupIds.has(g.externalId) || g.isActive === false) continue;
    const troupes = await prisma.troupe.count({ where: { groupId: g.id } });
    say('deactivate', `group "${g.name}" (#${g.id}, ${troupes} troupe(s)) — gone from Inscription`);
    if (APPLY && DEACTIVATE) {
      await prisma.group.update({ where: { id: g.id }, data: { isActive: false } });
    }
  }
  console.log(`groups    : ${nodusGroups.length} in nodus, ${insGroups.length} from Inscription`);

  // ---------- units / troupes ----------
  // Only the branches Nodus tracks. A meute is not a troupe.
  // Prefer one global call; fall back to per-group when the API has no /Units.
  let insUnits = rows(await api('/Units', token).catch(() => []));
  if (!insUnits.length) insUnits = await unitsPerGroup(insGroups, token);

  const allGroups = await prisma.group.findMany();
  const groupByExt = new Map(allGroups.filter((g) => g.externalId).map((g) => [g.externalId, g]));
  const nodusTroupes = await prisma.troupe.findMany();
  const tByExt = new Map(nodusTroupes.filter((t) => t.externalId).map((t) => [t.externalId, t]));
  const seenUnitIds = new Set();

  for (const iu of insUnits) {
    const branche = brancheOf(iu);
    if (!branche) continue; // a branche Nodus does not track (Louveteaux, Route…)
    const id = extId(iu);
    if (!id) continue;
    seenUnitIds.add(id);

    const name = String(iu.name || iu.nameFr || '').trim();
    const gExt = String(iu.groupExternalId ?? iu.group?.externalId ?? iu.groupId ?? '').trim();
    const group = groupByExt.get(gExt);

    let t = tByExt.get(id);
    if (!t) {
      // Adopt by name inside the right group, else create.
      const siblings = group ? nodusTroupes.filter((x) => x.groupId === group.id) : [];
      const sameName = siblings.filter((x) => norm(x.name) === norm(name));
      if (sameName.length === 1 && !sameName[0].externalId) {
        t = sameName[0];
        say('link', `troupe "${name}" -> Inscription #${id}`);
        if (APPLY) {
          await prisma.troupe.update({
            where: { id: t.id },
            data: { externalId: id, lastSyncedAt: new Date() },
          });
        }
      } else if (sameName.length === 0) {
        if (!group) {
          say('skip', `unit "${name}" (#${id}): group ${gExt} unknown in nodus`);
          continue;
        }
        say('create', `troupe "${name}" (#${id}) in "${group.name}" [${branche}]`);
        if (APPLY) {
          await prisma.troupe.create({
            data: {
              name,
              code: `T${id}`,
              externalId: id,
              branche,
              groupId: group.id,
              lastSyncedAt: new Date(),
            },
          });
        }
        continue;
      } else {
        say('skip', `unit "${name}" (#${id}): ambiguous in nodus`);
        continue;
      }
    }

    const patch = { lastSyncedAt: new Date() };
    if (name && name !== t.name) {
      say('rename', `troupe #${t.id}: "${t.name}" -> "${name}"`);
      patch.name = name;
    }
    if (branche && branche !== t.branche) {
      say('branche', `troupe "${t.name}" (#${t.id}): ${t.branche} -> ${branche}`);
      if (WITH_BRANCHE) patch.branche = branche;
    }
    if (t.isActive === false) {
      say('reactivate', `troupe "${t.name}" (#${t.id}) is in Inscription again`);
      patch.isActive = true;
    }
    if (APPLY) await prisma.troupe.update({ where: { id: t.id }, data: patch });
  }

  // Troupes Inscription no longer lists.
  for (const t of nodusTroupes) {
    if (!t.externalId || seenUnitIds.has(t.externalId) || t.isActive === false) continue;
    const sets = await prisma.pictureSet.count({ where: { troupeId: t.id } });
    say(
      'deactivate',
      `troupe "${t.name}" (#${t.id}) — gone from Inscription${sets ? `, ${sets} picture set(s) KEPT` : ''}`
    );
    if (APPLY && DEACTIVATE) {
      await prisma.troupe.update({ where: { id: t.id }, data: { isActive: false } });
    }
  }
  console.log(`troupes   : ${nodusTroupes.length} in nodus, ${insUnits.length} units from Inscription\n`);

  // ---------- report ----------
  const show = (key, title, note = '') => {
    if (!plan[key].length) return;
    console.log(`${title} (${plan[key].length})${note}`);
    for (const l of plan[key].slice(0, 40)) console.log(`  ${l}`);
    if (plan[key].length > 40) console.log(`  … and ${plan[key].length - 40} more`);
    console.log('');
  };
  show('link', 'Linked to an Inscription id');
  show('create', 'To create');
  show('rename', 'Renamed in Inscription');
  show('branche', 'Branche changes', WITH_BRANCHE ? '' : '  — not applied, pass --branche');
  show('reactivate', 'Back in Inscription');
  show(
    'deactivate',
    'Gone from Inscription',
    DEACTIVATE ? '  — deactivated, pictures kept' : '  — NOT applied, pass --deactivate'
  );
  show('skip', 'Skipped (needs a human)');

  if (!APPLY) {
    console.log('Dry run only — nothing was written. Re-run with --apply.');
  } else {
    console.log('Done. Nothing was ever deleted: rows that left Inscription are deactivated.');
  }
}

/** Fallback when the API has no global /Units: ask per group. */
async function unitsPerGroup(insGroups, token) {
  const all = [];
  for (const g of insGroups) {
    const id = extId(g);
    if (!id) continue;
    for (const u of rows(await api(`/Groups/${encodeURIComponent(id)}/Units`, token).catch(() => []))) {
      all.push({ ...u, groupExternalId: id });
    }
  }
  return all;
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
