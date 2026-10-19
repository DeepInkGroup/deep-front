# Curated community maps

The release installs three original maps, each credited **Build By Artin
Zomorodian**, into the community catalog:

- **Iran: Caspian to Hormuz**: stylized Iranian geography, Caspian basin,
  Zagros corridors, Persian Gulf islands and the Strait of Hormuz.
- **Middle East: Crossroads**: Mediterranean, Red Sea and Persian Gulf
  theaters with desert interiors and fertile corridors.
- **Shattered Crown**: four fictional continents, a central crown island,
  narrow passages and island chains.

Each remastered map is 2048 x 1536 with a 512 x 384 authoring grid and 12 named
land spawns. The second edition adds detailed coasts, meandering rivers,
fertile valleys and textured relief. Shattered Crown has newly shaped
continents, sheltered bays and outer islands. Shaded relief thumbnails are
generated from the actual playable terrain rather than coarse editor rectangles.
Geometry is hand-authored
in `src/server/community/CatalogMaps.ts`; regional maps are stylized rather
than political boundary datasets. All three use the same compiler and assets
as approved player maps and are selectable in solo and multiplayer.

Startup installs missing IDs transactionally in the existing community
database, under the administrator's ownership with a separate author credit.
No author login or public credentials are created. Subsequent starts do not
duplicate maps or override moderation: an unpublished map stays unpublished.
Second-edition maps have new immutable IDs. Startup retires the first edition
from the picker while keeping its assets available for active games and replays.
If an admin withdrew an original map, its replacement also starts withdrawn.
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

## Import a map image

Signed-in players can open **Import a map image** in the map studio. PNG, JPG
and WebP images up to 20 MB / 24 million pixels are converted on the device.
Original images are not uploaded; only generated terrain is submitted for review.
The image is fitted without stretching and transparent padding becomes water.

Automatic detection recognizes blue water, transparent islands and country
outlines on white paper. Alternative modes cover dark or light land silhouettes,
custom water colors and land-only city maps. A sensitivity slider, optional
color-based hills and removal of isolated specks update a side-by-side preview.
This is color-based raster conversion, not recognition of political boundaries,
building footprints or street networks. Flat map images give the clearest results.

**Use generated map** replaces terrain at Ultra detail (512 x 384 editable
cells), clears previous spawns and supports Undo/Redo. Players can paint, place
or randomize spawns, save drafts, change world size and publish through normal
admin review. Standard/Fine/Ultra detail changes the editing grid independently
of the 1024 x 768 through 4096 x 3072 playable world sizes. Old 128 x 96 drafts
remain supported.

`npm run test:image-map` verifies real file upload, controls, responsive previews,
fine-grid editing, undo, persistence, review and solo/two-client multiplayer.
