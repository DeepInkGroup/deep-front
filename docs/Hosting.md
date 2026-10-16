# Public multiplayer hosting

Source repository: https://github.com/DeepInkGroup/deep-front

## Render

[Deploy Deep Front on Render](https://render.com/deploy?repo=https://github.com/DeepInkGroup/deep-front)

Sign into Render, connect the repository, and apply the included `render.yaml` Blueprint. It provisions **one free Node web service** in Frankfurt, with one game worker, HTTP/WebSocket routing, HTTPS, and `/api/health` readiness checks. There is no database or account API to configure. After deployment succeeds, open the URL Render assigns and share that URL with friends. Everyone must use that same server.

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
