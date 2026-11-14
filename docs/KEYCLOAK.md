# Keycloak sign-in for Nodus

Chiefs sign in to Nodus with their **Scouts du Liban account** — the Keycloak of
the QG CMS (`https://inscription-auth.scoutsduliban.org`, realm `QG_CMS`), the
same login as the registration portal.

Nodus never stores a Keycloak password or token: the browser is sent to Keycloak
(authorization code + PKCE, confidential client), comes back to
`/api/auth/keycloak/callback`, and Nodus opens its usual JWT session.

---

## What happens to the existing 170 password accounts

Read this before switching anything on.

| | |
|---|---|
| **Accounts deleted?** | No. All 170 stay, active, with their password hash untouched. |
| **Can they still use their password?** | **No.** As soon as `KEYCLOAK_URL` is set, password login returns 403 for everyone. |
| **Do they lose their pictures?** | No. At their first Keycloak sign-in the account is matched **by email** and reused — same uploads, same history. |
| **What if their Keycloak email differs?** | A second account is created. Fix the email in Admin → Users *before* they first sign in. |
| **Do the 14 Branche reviewers lose approval rights?** | Not immediately: they all have `branches: []`, which means *every* branche. But their first Keycloak sign-in **overwrites** that from your approver rules. |

So: nothing is revoked in the database, but **the only way in becomes Keycloak**.
Two ways to soften that:

- `LOCAL_LOGIN=true` — keeps the old passwords working alongside Keycloak during
  a transition. Remove it when everyone has moved.
- The break-glass admin (step 5) — one `.env`-defined administrator who can
  always get in, even if Keycloak is down.

---

## Step 1 — Create the client in Keycloak

Keycloak admin console → realm `QG_CMS` → **Clients → Create client**.

**Page 1 (General settings):**

| Field | Value |
|---|---|
| Client type | OpenID Connect |
| Client ID | `nodus` |
| Name | Nodus |

**Page 2 (Capability config):**

| Field | Value |
|---|---|
| Client authentication | **On** (makes it confidential) |
| Authorization | Off |
| Standard flow | **On** |
| Direct access grants | **Off** |
| Implicit flow | Off |
| Service accounts roles | **On** (needed for steps 7 and 8) |

**Page 3 (Login settings):**

| Field | Value |
|---|---|
| Root URL | `https://nodus.scoutsduliban.org` |
| Home URL | `https://nodus.scoutsduliban.org` |
| Valid redirect URIs | `https://nodus.scoutsduliban.org/api/auth/keycloak/callback` |
| Valid post logout redirect URIs | `https://nodus.scoutsduliban.org/login` |
| Web origins | `https://nodus.scoutsduliban.org` |

**No `localhost` entries here.** Local development runs against the QG CMS test
Keycloak (see **Testing on a laptop** at the end), which has its own `nodus`
client carrying the localhost URIs. Keeping localhost out of the production client of a realm shared by
several SDL applications means a developer's machine can never take part in a
production sign-in.

**Root URL** is only a convenience: Keycloak prefixes any *relative* URL in the
other fields with it. The URIs above are absolute, so it changes nothing — set
it anyway, it makes the client readable in the console. **Home URL** is where
Keycloak sends someone who opens Nodus from their Keycloak account console.
Neither takes part in the sign-in flow; both can be left empty.

**Web origins** controls the CORS headers Keycloak returns. `+` means "the same
origins as the redirect URIs" and is the easiest correct answer; the explicit
host above is equivalent. Never use `*`.

> **The redirect URI is an API path, not a page of the SPA.** nginx serves the
> SPA at `/` and proxies `/api/` to the backend on port 5020, so both live on
> `nodus.scoutsduliban.org` and the callback is simply
> `/api/auth/keycloak/callback` on that same host.
>
> It must match what the backend builds from `PUBLIC_BASE_URL` (step 4),
> character for character — scheme, host, path, no trailing slash. A mismatch
> is refused by Keycloak before the login form even appears, with
> `Invalid parameter: redirect_uri`. This is the most common setup mistake.

Then **Advanced → Advanced settings → Proof Key for Code Exchange (PKCE)
method → `S256`** → Save.

<details>
<summary>What that setting does</summary>

PKCE (RFC 7636) stops a stolen authorization code from being usable. Before
redirecting, Nodus generates a random secret — the *verifier* — and sends
Keycloak only its SHA-256 hash, the *challenge*. When it later exchanges the
code, it sends the raw verifier; Keycloak hashes it and compares. A code
intercepted in a URL, a proxy log or browser history is worthless without the
verifier, which never leaves the server (it waits in a 10-minute httpOnly
cookie scoped to `/api/auth/keycloak`).

**Code Challenge Method** picks how the challenge is derived:

| Value | Meaning |
|---|---|
| `S256` | challenge = SHA-256(verifier). **Use this.** |
| `plain` | challenge = the verifier itself — pointless, anyone who sees the first request learns the secret. |

Leaving the field empty means "accept whatever the client asks for", which
allows a downgrade to `plain`. Setting `S256` makes Keycloak **enforce** it.
Nodus always sends `code_challenge_method=S256`
([utils/oidc.js](../backend/src/utils/oidc.js)), so this setting simply holds it
to its word.

</details>

---

## Step 2 — Copy the client secret

Client `nodus` → **Credentials** tab → copy **Client Secret**.

That value goes into `OIDC_CLIENT_SECRET` in step 4.

---

## Step 3 — Add the groups mapper

Without this, Nodus cannot see which groups a person belongs to, and every
group-based rule silently matches nothing.

Client `nodus` → **Client scopes** → `nodus-dedicated` → **Add mapper → By
configuration → Group Membership**:

| Field | Value |
|---|---|
| Name | `groups` |
| Token Claim Name | `groups` |
| Full group path | **On** |
| Add to ID token | **On** |
| Add to access token | **On** |
| Add to userinfo | On |

With *Full group path* on, the flat QG CMS groups (`CU`, `CG`, `QG_Animation`…)
arrive as `/CU`, `/QG_Animation`. Nodus matches them with or without the leading
slash, and a subgroup matches its parent rule (`/CU` matches `/CU/Sagesse`).

---

## Step 4 — Add this to `backend/.env`

Paste this block at the end of `backend/.env` and fill in the secret.

### For production

> **Copy the contents of the block below, not its opening and closing fence
> lines.** Docker Compose's env parser is stricter than dotenv's: a stray fence
> stops the whole container with
> *unexpected character in variable name*.
>
> This check should print nothing — anything it lists is not a valid
> `KEY=value` line or comment, and must go:
>
>     grep -nvE '^[[:space:]]*(#|$)|^[A-Za-z_][A-Za-z0-9_]*=' backend/.env

```ini
# --- Keycloak ---------------------------------------------------------------
KEYCLOAK_URL=https://inscription-auth.scoutsduliban.org
KEYCLOAK_REALM=QG_CMS
OIDC_CLIENT_ID=nodus
OIDC_CLIENT_SECRET=paste-the-secret-from-step-2

# The public origin of THIS API. The OIDC redirect URI is built from it, so it
# must match the redirect URI registered in step 1 exactly. Behind nginx this is
# the public site, NOT 127.0.0.1:5020 — nginx proxies /api/ to the backend, so
# the API's public origin is the site itself.
PUBLIC_BASE_URL=https://nodus.scoutsduliban.org

# The SPA. Same host in production, since nginx serves both.
CLIENT_URL=https://nodus.scoutsduliban.org

# SDL's public Keycloak blocks /admin/, so the group and role dropdowns on
# Admin → Accès read from the admin hostname instead.
KEYCLOAK_ADMIN_URL=https://admin.auth.scoutsduliban.org

# Who becomes an ADMIN: the `admin` role on Nodus's own client (step 6).
KEYCLOAK_ADMIN_ROLES=admin

# Left empty on purpose. Per-branche approval is configured in the app
# (Admin → Accès) so Eclaireurs and Eclaireuses can differ.
KEYCLOAK_APPROVE_ROLES=
KEYCLOAK_CHEF_ROLES=
# Empty = any account of the realm may sign in.
KEYCLOAK_LOGIN_ROLES=

# --- Inscription (QG) API ---------------------------------------------------
SDL_REGISTRY_URL=https://inscription-api.scoutsduliban.org/api
INSCRIPTION_AUTO_LINK_TROUPE=true

# --- Break-glass administrator (step 5) -------------------------------------
LOCAL_ADMIN_ENABLED=true
LOCAL_ADMIN_USERNAME=nodus-admin
LOCAL_ADMIN_PASSWORD=change-this-to-20-random-characters
LOCAL_ADMIN_NAME=Service account
```

### For your laptop

Two separate situations — do not mix them.

**(a) Working on Nodus without touching Keycloak.** The common case. Leave
`KEYCLOAK_URL` out of your local `.env` entirely: Keycloak stays off, and the
existing nodus passwords keep working exactly as before.

```ini
# no KEYCLOAK_URL at all
CLIENT_URL=http://localhost:5173
```

**(b) Testing the Keycloak flow itself.** Point at the QG CMS **test** Keycloak,
never the production realm — the production client deliberately has no localhost
redirect URI, so it would refuse. Full instructions in **Testing on a laptop**
at the end of this document.

```ini
KEYCLOAK_URL=http://localhost:8080      # the test Keycloak, not production
KEYCLOAK_REALM=QG_CMS
OIDC_CLIENT_ID=nodus
OIDC_CLIENT_SECRET=<the test client's secret>
PUBLIC_BASE_URL=http://localhost:3001   # the API: Vite is on 5173, the API on 3001
CLIENT_URL=http://localhost:5173
```

Restart the backend. It tells you what it decided:

```
[auth] Keycloak: https://inscription-auth.scoutsduliban.org/realms/QG_CMS (client nodus)
[auth] break-glass admin: nodus-admin
```

If you see `[auth] Keycloak off — email + password login only`, then
`KEYCLOAK_URL` was not read: check it is in `backend/.env` (not the frontend's)
and that the backend was restarted.

---

## Step 5 — The break-glass administrator

Do this one. Without it, a Keycloak outage, a wrong secret, or a mistake in the
access rules locks **everyone** out, including you.

`LOCAL_ADMIN_USERNAME` / `LOCAL_ADMIN_PASSWORD` define an administrator that
never touches Keycloak. It signs in on the password form (behind the discreet
**"Connexion de secours"** link on the login page), even with `LOCAL_LOGIN`
unset, is always `ADMIN`, and its password is compared against `.env` on every
sign-in — never written to the database.

Requirements in production: **12+ characters**, not a placeholder like
`change-me` or `password`. Otherwise it is disabled and the backend warns at
startup. Set `LOCAL_ADMIN_ENABLED=false` to switch it off while keeping the
values.

---

## Step 6 — Give someone admin rights, explicitly

Nodus reads the **`admin` role on its own client** (that is what
`KEYCLOAK_ADMIN_ROLES=admin` means). Create the role once, then assign it.

### 6a. Create the role (once)

Client `nodus` → **Roles** tab → **Create role**:

| Field | Value |
|---|---|
| Role name | `admin` |
| Description | Nodus administrator |

### 6b. Assign it to a person

**Users** → search the person → open them → **Role mapping** tab →
**Assign role** → change the filter dropdown from *Filter by realm roles* to
**Filter by clients** → search `admin` → tick **`nodus admin`** → **Assign**.

> The filter dropdown is the step people miss. If you leave it on *Filter by
> realm roles* you will not see `nodus admin` in the list at all.

They become a Nodus administrator **at their next sign-in** — not instantly. If
they are already signed in, they must sign out and back in.

### 6c. Or assign it to a group (optional)

**Groups** → pick the group (e.g. `Admin`) → **Role mapping** → **Assign role**
→ **Filter by clients** → `nodus admin` → **Assign**.

> A client role attached **to a person** survives the QG CMS group
> resynchronisation. A manual group membership does not — the resync can remove
> people from groups. For a permanent administrator, prefer 6b.

### Verify it worked

Have them sign in, then open `/api/auth/keycloak/whoami` (while signed in). You
should see:

```json
{ "clientRoles": ["admin"], "role": "ADMIN" }
```

If `clientRoles` is empty, the role was assigned as a realm role instead of a
client role — redo 6b with the filter on *Filter by clients*.

> Keycloak **promotes but never demotes**. Someone made ADMIN by hand in
> Admin → Users keeps that role even if Keycloak would grant less. Removing the
> `admin` client role does **not** demote an account that was promoted manually
> — change it in Admin → Users.

---

## Step 7 — Service account: the group and role dropdowns

Optional but recommended. It lets Admin → Accès offer the realm's real groups
and roles in dropdowns instead of free text.

Client `nodus` → **Service accounts roles** tab → **Assign role** → **Filter by
clients** → assign from `realm-management`:

- `view-realm`
- `view-users`
- `view-clients`

**Nothing else — never any `manage-*` role.**

Without this the page still works: dropdowns become free text, completed by the
groups and roles actually seen on accounts that have already signed in. The list
is cached for a minute; **"Recharger depuis Keycloak"** refreshes it and shows
the exact error when the lookup fails.

---

## Step 8 — Service account: link chiefs to their troupe

Needed for `INSCRIPTION_AUTO_LINK_TROUPE=true`.

Same **Service accounts roles** tab → **Assign role** → *Filter by realm roles*
→ assign:

- `Read_Group`
- `Read_Unit`
- `Read_District` — optional, see below

Read-only, as for SEVA — never `Manage_*`.

**`Read_District` is optional and harmless.** If you have already assigned it,
leave it: it changes nothing and breaks nothing. It is simply redundant. The QG CMS API
treats these as a ladder — `Read_QG` > `Read_District` > `Read_Group` >
`Read_Unit` — and a caller gets the scope of its *highest* tier. A service
account holding `Read_Group` with **no scope claims** already reads every
district and group nationally, so adding `Read_District` widens nothing. Nodus
only calls `/Profile`, `/Districts`, `/Groups` and `/Units`, all
covered by `Read_Group` + `Read_Unit`. The sync script also reads `/Districts`
to refresh district names, but that call works on the same tier — it needs no
role of its own.

District rows in Nodus do **not** come from this API: their codes (`BEK`,
`ML3`…) already matched, so the migration linked all 15 by code.

Then sync the structure from Inscription:

```bash
cd backend
npm run sync:inscription          # dry run — prints a plan, writes nothing
npm run sync:inscription:apply    # apply everything (= --apply --all)

# or step by step:
node scripts/syncInscription.js --apply               # create, rename, link ids
node scripts/syncInscription.js --apply --branche     # also set Eclaireurs/Eclaireuses
node scripts/syncInscription.js --apply --deactivate  # also deactivate what left
```

It fetches districts, groups and units by Inscription id and keeps Nodus in
step: new groups and units are **created**, renamed ones are **renamed**, and
existing rows are **linked** to their Inscription id by name (only when the
name is unambiguous — anything doubtful is listed for a human instead).

**Read the dry run before applying.**

### Nothing is ever deleted

A group that folds or a unit that merges is **deactivated**, never removed —
the same model SEVA uses. Its pictures stay exactly where they are and remain
browsable; the row simply stops appearing where someone picks a destination for
a **new** upload (`?activeOnly=1` on `/api/groups` and `/api/troupes`). If it
reappears in Inscription later, the next sync reactivates it.

This is enforced by the database, not just by the script: `District → Group →
Troupe → PictureSet` used to be `ON DELETE CASCADE`, so deleting a single group
destroyed every picture set of its troupes (measured on the live data: one
group = 5 sets, 55 pictures). Migration `20261109090000_org_soft_delete`
changed those foreign keys to `RESTRICT`, so the database now refuses any
delete that would drop pictures. `DELETE /api/groups/:id` and
`DELETE /api/troupes/:id` deactivate instead whenever the row still holds
troupes or picture sets.

Deactivated rows show an **inactive** badge in Admin → Troupes.

Districts were already linked by the migration: their codes (`BEK`, `ML3`…) come
from the same source database.

---

## Step 9 — Set who can sign in and who can approve

In Nodus: **Admin → Accès Keycloak** (`/admin/access`). No redeploy needed.

A rule entry is written in one of three ways:

| Entry | Means |
|---|---|
| `admin` | a role on Nodus's own client |
| `realm:Read_QG` | a realm role |
| `/CU` | membership of that group, or any subgroup of it |

The page has four blocks:

**Who can sign in** — default: any account of the realm. Uncheck to restrict to
listed groups or realm roles. Administrators and approvers always get in
regardless, so you cannot lock yourself out.

**Administrators** — same as `KEYCLOAK_ADMIN_ROLES`, but editable in the app.

**Who can approve — one rule per branche team.** Each rule says *who* (a group
or role), *which branches*, and *which districts* (none ticked = all). To open
Nodus to Eclaireuses next to Eclaireurs:

| Rule | Branches | Districts |
|---|---|---|
| `/QG_Eclaireurs` | Eclaireurs | — (all) |
| `/QG_Eclaireuses` | Eclaireuses | — (all) |
| `/CB_ML3` | Eclaireurs, Eclaireuses | ML3 |

Someone in two teams reviews both branches. A rule with no district restriction
widens any district-limited rule they also match.

**Chefs de troupe** — who may upload for their troupe.

> Rules apply **at each person's next sign-in**. They do not change sessions
> that are already open, and they never remove districts granted by hand in
> Admin → District Access — Keycloak only adds.

---

## How a sign-in works

1. `/api/auth/keycloak/login` stores the PKCE verifier and state in a 10-minute
   cookie scoped to `/api/auth/keycloak`, then redirects to Keycloak.
2. `/api/auth/keycloak/callback` exchanges the code, verifies the access token
   against the realm's JWKS, and builds an identity: `sub`, username, name,
   email, realm roles, Nodus client roles, groups.
3. The Admin → Accès rules are applied (plus the `KEYCLOAK_*_ROLES` from
   `.env`). If sign-in is restricted and the account holds none of them, the
   browser returns to `/login?error=no-access` and **no account is created**.
4. The account is found by Keycloak id, then by email — a chief who had a
   password account keeps everything. Name, roles and groups are refreshed;
   `provider` becomes `KEYCLOAK`.
5. The Inscription profile is read (`GET /Profile`) and, if the chief has no
   troupe yet, their unit's troupe is assigned.
6. A **single-use ticket** (60 s, in memory) is issued and the browser goes to
   `/auth/callback?kc=…` on the SPA, which trades it for the nodus token — so
   the token never appears in a URL, a browser history or a server log.

"Sign out" clears the nodus token **and** ends the Keycloak session, so the next
"Continue with…" asks for a password instead of silently signing the same person
back in.

On a first visit Nodus makes one *silent* attempt (`prompt=none`): a chief
already signed in to the registration portal lands on their dashboard with no
click; everyone else comes back to the login page with no error shown.

---

## Branche scoping

Nodus only held Eclaireurs troupes, so the migration added `Troupe.branche`
defaulting to `Eclaireurs`, and `User.branches` (empty = every branche, which
preserves exactly what existing Branche accounts could already do).

An approver may only act on a set where **both**:

- the **district** is one of theirs (as before), and
- the **troupe's branche** is one of their branches.

Enforced on approve, reject, approve-single, classify, classify-bulk and every
listing (`checkReviewScope` in [backend/src/middleware/auth.js](../backend/src/middleware/auth.js)).

A troupe's branche is also editable by hand in Admin → Troupes, and a reviewer's
branches in Admin → Users.

---

## Troubleshooting

**`GET /api/auth/keycloak/whoami`** (while signed in) returns the claims Nodus
stored at the last sign-in: groups, realm roles, client roles, branches, nodus
role, Inscription profile. Check this first when a rule does not take effect.

**`POST /api/access/test`** (as admin) dry-runs an identity against the saved
rules:

```json
{ "groups": ["/QG_Eclaireuses"], "realmRoles": [], "clientRoles": [] }
```

It answers what that person would become (`role`, `branches`, `districtCodes`)
or why they would be refused. You can also pass `{ "userId": 42 }` to replay the
rules against an existing account.

Every refusal is logged:

```
[auth] jdupont refused — holds none of: /CU, realm:Read_Group
```

| Symptom | Cause |
|---|---|
| `Invalid parameter: redirect_uri` | The redirect URI in step 1 does not match `PUBLIC_BASE_URL` + `/api/auth/keycloak/callback` exactly (http vs https, port, trailing slash). |
| `error=keycloak-down` | Wrong `KEYCLOAK_URL`/`KEYCLOAK_REALM`, or Keycloak unreachable. The exact reason is in the backend log. |
| `error=no-access` | The account matches no login rule. Check Admin → Accès, and `whoami` for what it actually carries. |
| Groups empty in `whoami` | The mapper from step 3 is missing or *Full group path* is off. |
| `nodus admin` not in the role list | The filter is on *Filter by realm roles*; switch it to **Filter by clients**. |
| Admin rights not applied | Rules apply at the next sign-in. Sign out and back in. |
| Dropdowns empty on Admin → Accès | Step 7 not done, or `KEYCLOAK_ADMIN_URL` missing. The page shows the exact reason. |
| Chief sees "troupe not linked" | Their Inscription unit matched no nodus troupe. Run step 8, or assign the troupe by hand in Admin → Users. |

---

## Testing on a laptop

The QG CMS test stack runs Keycloak 25 on `http://localhost:8080` with the real
realm's structure. Create the `nodus` client there as above (redirect URI
`http://localhost:3001/api/auth/keycloak/callback`), then in `backend/.env`:

```ini
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=QG_CMS
OIDC_CLIENT_ID=nodus
OIDC_CLIENT_SECRET=<the client's secret>
PUBLIC_BASE_URL=http://localhost:3001
CLIENT_URL=http://localhost:5173
```

Plain-http Keycloak is accepted automatically (`allowInsecureRequests`) — only
for `http://` issuers, never in production.

The client can be created from the console, or with `kcadm` inside the container
(the admin password is already in the container's environment):

```bash
docker exec -it qgcms-test-keycloak-1 sh -c '
K=/opt/keycloak/bin/kcadm.sh
$K config credentials --server http://localhost:8080 --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD"
CID=$($K create clients -r QG_CMS -i -s clientId=nodus -s publicClient=false -s standardFlowEnabled=true \
  -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false -s serviceAccountsEnabled=true \
  -s "redirectUris=[\"http://localhost:3001/api/auth/keycloak/callback\"]" -s "webOrigins=[\"+\"]" \
  -s "attributes.pkce.code.challenge.method=S256" \
  -s "attributes.post.logout.redirect.uris=http://localhost:5173/login")
$K create clients/$CID/protocol-mappers/models -r QG_CMS -s name=groups -s protocol=openid-connect \
  -s protocolMapper=oidc-group-membership-mapper \
  -s "config.\"claim.name\"=groups" -s "config.\"full.path\"=true" \
  -s "config.\"id.token.claim\"=true" -s "config.\"access.token.claim\"=true"
$K create clients/$CID/roles -r QG_CMS -s name=admin
$K get clients/$CID/client-secret -r QG_CMS
'
```

Then give a test user the `admin` client role (step 6b) to check the admin
pages, and put another in `/QG_Eclaireuses` to check a per-branche approval
rule.

---

## Data safety: nothing is hard-deleted

Audited across every endpoint and every foreign key. Three independent layers
stop a structural or administrative change from destroying photos.

**1. The database refuses it.** Every path into the archive is `RESTRICT` or
`SET NULL`; no external cascade can reach a picture set.

| Deleting a… | Used to | Now |
|---|---|---|
| District | cascade → groups → troupes → **all their pictures** | `RESTRICT` |
| Group | cascade → troupes → **all their pictures** (measured: 1 group = 5 sets, 55 pictures) | `RESTRICT` |
| Troupe | cascade → **its picture sets** | `RESTRICT` |
| User | cascade → **every set they uploaded** (up to 179 for one account; 65 accounts exposed) | `SET NULL` + `uploaderEmail` kept |
| DesignGroup creator | cascade → the curated group | `SET NULL` |

The only cascade left into the archive is `Picture → PictureSet`, which is
intended: deleting a set removes its own photos, and that is a deliberate,
separately guarded action.

**2. The API deactivates instead of deleting.**

| Endpoint | Behaviour |
|---|---|
| `DELETE /api/groups/:id` | still has troupes → **deactivated** (`isActive=false`) |
| `DELETE /api/troupes/:id` | has picture sets → **deactivated** |
| `DELETE /api/admin/users/:id` | has uploads → **deactivated**; `?force=1` deletes the account but the sets survive, attributed by `uploaderEmail` |
| `DELETE /api/districts/:id` | refuses while it has groups |
| `DELETE /api/patrouilles/:id` | refuses while it has picture sets |
| `DELETE /api/categories/:id` | refuses while it has pictures or subcategories |
| `DELETE /api/design-groups/:id` | detaches the pictures first, deletes only the grouping |

**3. The image files are never removed.** `deleteFromR2` is a no-op unless
`ALLOW_R2_DELETE=true`, so even a deliberate picture delete leaves the file in
B2 and the row recoverable.

Deactivated rows stay fully browsable. They only disappear from the pickers
where someone chooses a destination for a **new** upload (`?activeOnly=1` on
`/api/groups` and `/api/troupes`), and they come back automatically if they
reappear in Inscription.

---

## Not done

- **Back-channel logout.** Nodus sessions are stateless JWTs (7 days); a chief
  signed out from another app stays signed in to Nodus until they sign out here
  or the token expires.
- **Live role refresh.** Rules apply at sign-in. A group change in Keycloak
  takes effect at that person's next sign-in, not immediately.
- **Exchange tickets and the token blacklist are in memory.** With several API
  instances behind a load balancer you need sticky sessions, or move both to
  Redis.
