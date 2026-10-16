# Public multiplayer hosting

Source repository: https://github.com/DeepInkGroup/deep-front

Project page: https://deepinkgroup.github.io/deep-front/

## Render

[Deploy Deep Front on Render](https://render.com/deploy?repo=https://github.com/DeepInkGroup/deep-front)

Sign into Render, connect the repository, and apply the included `render.yaml` Blueprint. It provisions **one free Node web service** in Frankfurt, with one game worker, HTTP/WebSocket routing, HTTPS, and `/api/health` readiness checks. There is no database or account API to configure. After deployment succeeds, open the URL Render assigns and share that URL with friends. Everyone must use that same server.

1. Sign in at https://dashboard.render.com/ with GitHub.
2. Choose **New → Blueprint**.
3. Connect **DeepInkGroup/deep-front**. If the repository is missing, update the Render GitHub app's repository access to include it.
4. Set Blueprint name **deep-front**, branch **main**, and Blueprint Path **render.yaml**.
5. Review the proposed service: **Node**, **Free**, **Frankfurt**, **one instance**. Click **Deploy Blueprint**.
6. Open the created web service and wait for its status to become **Live**. Follow its logs if the build fails.
7. Copy its actual HTTPS `onrender.com` address. Open it to play; everyone should use the same address.
8. Choose **Host a game**, share the lobby link with friends, and start once they have joined.

To connect the project page's public Play button permanently, set `serverUrl` in `pages/config.json` to that actual HTTPS address, then commit and push. The GitHub Pages workflow republishes automatically. The page also lets each visitor paste and save a server address in their own browser.

If you create a **Web Service** manually instead of using a Blueprint, select **Node** and enter these exact values:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | Leave empty |
| Build command | `npx --yes npm@12.1.0 run inst -- --include=dev && npm run build` |
| Start command | `npm start` |
| Instance | Free, one instance |
| Region | Frankfurt |
| Health check | `/api/health` |
| `NODE_VERSION` | `24.21.0` |
| `NODE_ENV` | `production` |
| `NUM_WORKERS` | `1` |
| `BIND_HOST` | `0.0.0.0` |

Render assigns `PORT` automatically; do not set it to an internal worker port. No database, API key, or custom domain is required.

The free tier is for testing and small games. It sleeps after 15 minutes without traffic and may take about a minute to wake. Matches are held in memory: restarting, sleeping, or deploying loses active matches. A paid, continuously running service can be selected later with the account owner's approval. Usage limits apply; see https://render.com/docs/free.

The service intentionally uses **one instance**. Independently scaling replicas requires coordinated lobby routing; setting `numInstances` above one is not supported by this standalone deployment. Increase `NUM_WORKERS` only when the server has enough CPU and memory. All worker ports stay private behind the public HTTP/WebSocket gateway.

New commits deploy after the GitHub `Deep Front` checks pass. A deploy restarts the game process, so schedule updates between games.

## Any Node server

Use Node 24.21 and npm 12.1. Clone the repository, then:

```sh
npx --yes npm@12.1.0 run inst -- --include=dev
npm run build
npm start
```

Run `npm start` under a process manager or service manager so it restarts after a reboot. Expose port 9000, or set `PORT` to your hosting platform's assigned public port. Terminate HTTPS at a reverse proxy that forwards **both HTTP and WebSocket upgrades** to this port. Check readiness at `/api/health`.

This game needs a persistent Node process. GitHub Pages and static-only hosting cannot run its multiplayer server.
