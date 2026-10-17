# Accounts, map creation and administration

Use the map-and-plus icon in the header to open the Map Studio. Visitors can
sign up with a username and password or sign in to an existing account. An
account is required to submit maps; guests can still play.

## Create a map

1. Sign in, enter a map name and description, and choose Standard or Large.
2. Paint Water, Plains, Hills and Mountains. Use the Islands or Continents
   templates, or start with Blank. Undo restores the previous terrain stroke.
3. Select Nation spawn, enter a nation name, then click land to add it.
4. Save draft to keep an editable copy on this device. Drafts also save
   automatically after edits. They are separate for each account and browser.
5. Choose **Publish for review**. The map is private while pending.
6. Check **Your submissions** for the decision and feedback. **Edit a copy**
   creates a new revision for review without modifying a published map.

The editor has 128 × 96 cells. Standard output is 1024 × 768; Large is
1536 × 1152. The server validates the terrain, land area and nation locations,
then generates full-size and compact game binaries when the administrator
approves it. Approved maps appear under **Community maps** in both solo and
multiplayer settings and can be found using the map search. No server rebuild
or GitHub commit is needed for publication.

## Admin panel

Open the map icon and sign in with **Admin / Admin123** on a new server. The
administrator can inspect terrain and nation spawns, approve maps, reject them
with feedback, unpublish maps, and enable or disable creator accounts. An
administrator cannot create or join games. The client navigation and the game
server both enforce this restriction while the admin account is signed in.

Use **Change password** in the panel to set a new administrator password.
`COMMUNITY_ADMIN_PASSWORD` can override the bootstrap password **only when the
database is first created**. Changing that environment variable does not reset
an existing account.

Unpublishing removes a map from new selections. Its immutable game files remain
available to existing matches and replays. A new submission always receives a
new map ID. Disabled accounts cannot sign in or submit maps; guest play remains
available separately.

## Storage and Render, step by step

Users, password hashes, sessions, submissions, review feedback and published map
files live in a SQLite database. It uses WAL for access from the master and
game worker processes on one server instance. Passwords use salted scrypt;
session cookies are HttpOnly and SameSite=Lax, and use Secure on HTTPS.

Locally the default directory is `.data/`. It survives application restarts and
is excluded from Git and the source-code download. `COMMUNITY_DATA_DIR` selects
another directory. Keep the database and its WAL files private.

For persistent accounts and maps on Render:

1. Open the Deep Front service in the Render dashboard.
2. Under **Settings → Instance Type**, select a paid instance that supports
   persistent disks. The existing `render.yaml` stays on the free game-only
   configuration so this code update does not change your billing plan.
3. Under **Disks**, add a disk mounted at **`/var/data`**, with enough capacity
   for your community's maps. Keep the service at one instance.
4. Under **Environment**, set **`COMMUNITY_DATA_DIR=/var/data/deep-front`**.
5. Deploy the latest GitHub commit. Sign in as Admin and change its password.
6. Create a regular account, submit a small test map, approve it as Admin,
   then confirm it appears in the solo and multiplayer map picker.
7. Back up the SQLite database using a SQLite-aware backup or a disk snapshot.

Render preserves files only inside the persistent disk mount. Free web services
cannot attach these disks and lose local database changes on redeploy/restart;
they are suitable for temporary testing of this workflow. See the official
[persistent disk documentation](https://render.com/docs/disks) and
[free service limits](https://render.com/docs/free).

The community database belongs to this server; it is not automatically copied
to GitHub Pages or another server. GitHub Pages remains a launcher for the
running game server.

## Verification

`npx vitest run tests/server/Community.test.ts` covers password hashing, durable
sessions, role restrictions, unauthorized access, request origins, map validation,
normal/compact terrain and wire encoding, approval and withdrawal. With a local
server and Chrome available, `node scripts/community-check.mjs` checks signup,
painting, saved drafts, rejection feedback, approval, and real solo/multiplayer
games on an approved map. Run browser tests against a separate
`COMMUNITY_DATA_DIR` to keep test accounts out of your live database.
