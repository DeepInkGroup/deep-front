import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!existsSync(path.join(root, "static/index.html"))) {
  console.error("Build the game first: npm run build");
  process.exit(1);
}
const workers = Number(process.env.NUM_WORKERS || 2);
if (!Number.isSafeInteger(workers) || workers < 1 || workers > 32) {
  throw new Error("NUM_WORKERS must be between 1 and 32");
}
const port = Number(process.env.PORT || 9000);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  (port >= 3000 && port <= 3000 + workers)
) {
  throw new Error(
    "PORT must be a valid public port outside the internal 3000..worker port range",
  );
}
const host = process.env.BIND_HOST || "0.0.0.0";
const child = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/Server.ts"],
  {
    cwd: root,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: "inherit",
    env: {
      ...process.env,
      STANDALONE: "true",
      GAME_ENV: "prod",
      DOMAIN: "localhost",
      NUM_WORKERS: String(workers),
      INSTANCE_LETTER: "a",
      GIT_COMMIT:
        process.env.GIT_COMMIT ||
        process.env.RENDER_GIT_COMMIT ||
        "DEEP_FRONT_LOCAL",
      TURNSTILE_SITE_KEY: "standalone",
      API_KEY: process.env.API_KEY || randomBytes(32).toString("hex"),
      // Standalone instances do not register with the upstream service.
      SUBDOMAIN: "",
      GAME_HOST: "",
      ADMIN_BOT_API_KEY: "",
    },
  },
);

function target(url, method) {
  const worker = /^\/w(\d+)(?:\/|$)/.exec(url);
  if (worker && Number(worker[1]) < workers) {
    return {
      port: 3001 + Number(worker[1]),
      path: url.replace(/^\/w\d+/, "") || "/",
    };
  }
  if (method === "POST" && /^\/api\/create_game(?:\?|$)/.test(url)) {
    return { port: 3001 + Math.floor(Math.random() * workers), path: url };
  }
  return { port: 3000, path: url };
}
const gateway = http.createServer((req, res) => {
  const route = target(req.url || "/", req.method);
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: route.port,
      path: route.path,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent)
      res.writeHead(503, { "Content-Type": "text/plain", "Retry-After": "2" });
    res.end("Game server is starting. Please retry in a moment.");
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});
const connections = new Set();
gateway.on("connection", (socket) => {
  connections.add(socket);
  socket.on("close", () => connections.delete(socket));
});
gateway.on("upgrade", (req, socket, head) => {
  const route = target(req.url || "/", "GET");
  const upstream = net.connect(route.port, "127.0.0.1", () => {
    upstream.write(`${req.method} ${route.path} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      upstream.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});
gateway.listen(port, host, () =>
  console.log(
    `\nDeep Front: http://localhost:${port}\nLAN: use this computer's IP address on port ${port}\n`,
  ),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  gateway.close();
  for (const socket of connections) socket.destroy();
  if (!child.pid) return;
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  gateway.close();
  for (const socket of connections) socket.destroy();
  if (!stopping) process.exitCode = code || 1;
});
child.on("error", (error) => {
  console.error("Game server failed:", error);
  stop();
  process.exitCode = 1;
});
gateway.on("error", (error) => {
  console.error("Gateway failed:", error);
  stop();
  process.exitCode = 1;
});
