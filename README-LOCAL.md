# Deep Front — OpenFront standalone edition

Black interface with a world map background, minimal header icons, and solo and multiplayer. Includes the original engine and maps, server-local creator accounts, a community Map Studio and admin review. Clans, rankings, purchases, ads and streams are absent from the menu. No upstream account API or CAPTCHA is needed.

## Install

Use Node 24.15+ (Node 24) and npm 12.1+ (npm 12), as required by upstream:

```sh
npx --yes npm@12.1.0 run inst
```

## Run locally

```sh
npm run dev
```

Open **http://localhost:9000**. For other devices on your network, use `npm run dev:host`, then open `http://YOUR-LAN-IP:9000` on each device. Allow the application through your firewall if prompted.

## Build and host

```sh
npm run build
npm start
```

The built game runs at **http://localhost:9000**, listening on all network interfaces. `PORT` changes the public port; `BIND_HOST` changes the bind address; `NUM_WORKERS` selects 1–32 game workers (default 2). Internal game processes use ports 3000–3032. Expose only the public port. When using a domain, proxy HTTP and WebSocket upgrades to this port and terminate HTTPS at your reverse proxy.

On Windows, you can also double-click **Start Deep Front.cmd** after installing dependencies.

Each browser keeps its own local gameplay identity. Creators and administrators sign into accounts on this server to create and manage maps. Multiplayer players must open the same server. Choose **Host a game**, share its invite link, then start when everyone is ready. Solo simulations run in the browser.

Development exposes the Vite source server and should be used for local development. For an internet-facing instance use the built `npm start` command. See [public multiplayer hosting](docs/Hosting.md) for the included Render deployment configuration.

## Oil Factory

Oil Factories generate gold every ten seconds of game time. Each player may own five separate buildings, each upgradable to level three. Capturing an extra factory while at the limit destroys it.

| Level | Build / upgrade cost | Gold every 10 seconds |
| ----- | -------------------- | --------------------- |
| 1     | 1,200,000            | 50,000                |
| 2     | 1,300,000            | 75,000                |
| 3     | 1,500,000            | 90,000                |

Oil Factory can be switched off in **Disable Units** in both solo and multiplayer settings.

## Copper Mine

Each player may own two Copper Mines, each with at most two levels. Level 1 costs 650,000 gold and pays 25,000 every ten game seconds. The level 2 upgrade costs 1,000,000 and pays 40,000 every ten seconds. Copper Mine is available in solo and multiplayer and can be switched off in **Disable Units**.

AI tribes and nations build and upgrade both resource buildings when they have gold and space, following the same limits and disable settings. Bombs destroy both buildings and stop their income; human-versus-human peace-time protection still applies. Captured buildings beyond the ownership limit are destroyed.

Oil Factories and Copper Mines connect to nearby cities, ports, factories and resource buildings using the existing railroad network and placement preview. They also serve as train trade stops. Ordinary factories supply trains; resource buildings retain their separate ten-second income.

## Logistics Center

A Logistics Center costs **1,000,000 gold**, takes **35 game seconds** to build,
and is limited to **one building at level 1** per player. Lobby Instant Build
applies to it like other buildings. It connects to nearby rail structures and
serves as a train stop; ordinary factories still supply trains.

After completion, all of its owner's train earnings increase by **15%**,
including revenue from other players' trains stopping at owned stations.
Each recipient receives their own bonus; owning a center does not boost another
player's earnings. Fractions of gold round down. This bonus does not change
oil, copper, worker or ship income. Capture transfers the benefit to the new
owner; destruction, including bombs, removes it. An excess captured center is
destroyed, just as excess Oil Factories and Copper Mines are. Buildings under
construction count toward these ownership limits.

The building is available in solo and multiplayer and can be switched off in
**Disable Units**. `node scripts/oil-factory-check.mjs --logistics` checks its
client construction, icon, lobby synchronization, level cap and mobile menu.
`npx vitest run tests/economy/LogisticsCenter.test.ts` covers its economy,
construction timing, conquest limits, bombs, rail connections and snapshots.

## Customs Office

Customs Offices cost **1,000,000 gold**, take **25 game seconds** to build, and
have one level. Place one on your own land directly touching another player's
land. Interior locations, neutral borders and diagonal contact do not qualify.
The placement preview uses the same rule as the server and does not move an
invalid interior placement onto a nearby border.

You may own **one office per neighboring player**, including unfinished offices.
An office stays linked to the player it was built beside, even if borders move.
It adds **10% to its owner's train earnings from trade with that player**, in
either direction. Domestic trade and trade with other players receive no Customs
bonus. Each side needs its own office to receive its own bonus. With a completed
Logistics Center, the bonuses add to **25%**, rounded down to whole gold.

Offices connect to nearby rail buildings and serve as train stops. Destruction
removes their bonus and frees that neighbor's slot. Capture retains the trade
partner; if the partner captures the office, it instead links to the previous
owner. A captured office is destroyed if it would duplicate the captor's office
for that partner.

Both AI tribes and nations build Logistics Centers and Customs Offices with real
gold after developing their resource economy, obeying placement, limits and
disabled-unit settings. They retain these buildings and can rebuild them after
loss. Customs Office is available in solo and multiplayer under **Disable Units**.
`npx vitest run tests/economy/CustomsOffice.test.ts tests/economy/EconomyAI.test.ts`
checks these rules, income, construction, capture, bombs and save restoration.
With a server using an isolated `COMMUNITY_DATA_DIR`, `npm run test:customs`
checks real solo and two-player multiplayer border placement, disabled units,
the icon and the mobile building menu. It publishes a tiny test map into that
test database; use your normal database again after verification.

## DeepPlace

Select **DeepPlace** in the map picker's **Fictional** or **New** category, or search for its name. This original 2048 × 1440 map is available in solo and multiplayer, at normal and compact size. Four main land regions surround Deep Strait, with two cross passages, island chains, mountain ridges, sheltered gulfs and twelve fictional nations.

To regenerate its source terrain, run `node scripts/create-deepplace.mjs`. With Go 1.24.4 or newer installed, run `go run -tags nodynamic . --maps=deepplace` from `map-generator` to regenerate the playable assets and map registry. Hosting builds use the committed map files and do not require Go.

## Verification

The header's map icon opens account sign-in, the community Map Studio and the
Admin review panel. New servers start with **Admin / Admin123**; this account
only manages maps and users. Approved maps become playable in solo and
multiplayer without a rebuild. See [community maps and persistent Render storage](docs/Community.md)
for the complete workflow and deployment steps.

`npm run typecheck` checks all workspace packages. With a server running and Chrome installed, `npm run test:browser` verifies a solo simulation, a two-player multiplayer match, mobile layouts, settings/help, health, and the source download. Screenshots are saved under `artifacts/`.

Compatible security updates have been applied. Six audit findings remain in development tooling (`vite-plugin-html` and `oxfmt` dependency trees); the production dependency audit is checked separately by CI.

## Source and attribution

Based on https://github.com/openfrontio/OpenFrontIO at commit 8989303c1e65b0670c7f51b8724b141bcf1f5950. © OpenFront and Contributors. The original licenses and notices are retained. Modified source is available from the in-app **Source code** link after building. See `LICENSE`, `LICENSE-ASSETS`, and `LICENSING.md`.

See [Bunker Missile Site](docs/BunkerMissileSite.md) for advanced missile costs, upgrades, SAM behavior and bot support. Run `npm run test:bunker` against the local production server to check the real solo and multiplayer controls.

[CIWS Defense and additional shortcuts](docs/CIWSDefense.md) describes guaranteed defense coverage and the capped-building upgrade controls. Verify solo and multiplayer controls with `npm run test:defense`.
