# Curated community maps

The release installs three original maps, each credited **Build By Artin
Zomorodian**, into the community catalog:

- **Iran: Caspian to Hormuz**: stylized Iranian geography, Caspian basin,
  Zagros corridors, Persian Gulf islands and the Strait of Hormuz.
- **Middle East: Crossroads**: Mediterranean, Red Sea and Persian Gulf
  theaters with desert interiors and fertile corridors.
- **Shattered Crown**: four fictional continents, a central crown island,
  narrow passages and island chains.

Each map is 2048 x 1536 with 12 named land spawns. Geometry is hand-authored
in `src/server/community/CatalogMaps.ts`; regional maps are stylized rather
than political boundary datasets. All three use the same compiler and assets
as approved player maps and are selectable in solo and multiplayer.

Startup installs missing IDs transactionally in the existing community
database, under the administrator's ownership with a separate author credit.
No author login or public credentials are created. Subsequent starts do not
duplicate maps or override moderation: an unpublished map stays unpublished.
Admins can inspect drafts, unpublish and republish through the existing panel.
User submissions still require normal approval.

Guests see a Log in header icon and the sign-in / sign-up form. Map creation
navigation and the editor appear only for signed-in players. Admins retain
their management-only panel. The footer's How to play opens the text field
guide with current building, trade, defense and map creation information.
The old source archive download is no longer built or served.

Validation: `npx vitest run tests/server/Community.test.ts` covers installation,
terrain assets, land spawns, persistence and moderation. With the production
server running, `npm run test:catalog` checks guest access, signup and login,
responsive guide layouts, all three maps in solo and a two-client multiplayer
game. Screenshots are written under `artifacts/`.
