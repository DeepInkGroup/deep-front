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
| 1     | 1,200,000            | 100,000               |
| 2     | 1,300,000            | 135,000               |
| 3     | 1,500,000            | 150,000               |

Oil Factory can be switched off in **Disable Units** in both solo and multiplayer settings.

## Verification

`npm run typecheck` checks all workspace packages. With a server running and Chrome installed, `npm run test:browser` verifies a solo simulation, a two-player multiplayer match, mobile layouts, settings/help, health, and the source download. Screenshots are saved under `artifacts/`.

Compatible security updates have been applied. Six audit findings remain in development tooling (`vite-plugin-html` and `oxfmt` dependency trees); the production dependency audit is checked separately by CI.

## Source and attribution

Based on https://github.com/openfrontio/OpenFrontIO at commit 8989303c1e65b0670c7f51b8724b141bcf1f5950. © OpenFront and Contributors. The original licenses and notices are retained. Modified source is available from the in-app **Source code** link after building. See `LICENSE`, `LICENSE-ASSETS`, and `LICENSING.md`.
