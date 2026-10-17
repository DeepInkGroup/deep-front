# Deep Front — OpenFront standalone edition

Black interface with a world map background, minimal header icons, and solo and multiplayer. Includes the original engine and maps. Accounts, clans, rankings, purchases, ads, and streams are absent from the menu. No upstream account API or CAPTCHA is needed.

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

This is an anonymous game server. Each browser keeps its own local identity; no account system is required. Multiplayer players must open the same server. Choose **Host a game**, share its invite link, then start when everyone is ready. Solo simulations run in the browser.

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

## DeepPlace

Select **DeepPlace** in the map picker's **Fictional** or **New** category, or search for its name. This original 2048 × 1440 map is available in solo and multiplayer, at normal and compact size. Four main land regions surround Deep Strait, with two cross passages, island chains, mountain ridges, sheltered gulfs and twelve fictional nations.

To regenerate its source terrain, run `node scripts/create-deepplace.mjs`. With Go 1.24.4 or newer installed, run `go run -tags nodynamic . --maps=deepplace` from `map-generator` to regenerate the playable assets and map registry. Hosting builds use the committed map files and do not require Go.

## Verification

`npm run typecheck` checks all workspace packages. With a server running and Chrome installed, `npm run test:browser` verifies a solo simulation, a two-player multiplayer match, mobile layouts, settings/help, health, and the source download. Screenshots are saved under `artifacts/`.

Compatible security updates have been applied. Six audit findings remain in development tooling (`vite-plugin-html` and `oxfmt` dependency trees); the production dependency audit is checked separately by CI.

## Source and attribution

Based on https://github.com/openfrontio/OpenFrontIO at commit 8989303c1e65b0670c7f51b8724b141bcf1f5950. © OpenFront and Contributors. The original licenses and notices are retained. Modified source is available from the in-app **Source code** link after building. See `LICENSE`, `LICENSE-ASSETS`, and `LICENSING.md`.
