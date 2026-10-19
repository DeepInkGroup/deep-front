import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { CommunityStore, communityStore, sessionCookie } from "./Store";
import { draftThumbnail } from "./MapCompiler";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const Credentials = z
  .object({
    username: z.string().trim().min(3).max(24),
    password: z.string().min(8).max(128),
  })
  .strict();
function user(req: Request, store: CommunityStore) {
  return store.session(sessionCookie(req.headers.cookie));
}
function cookie(res: Response, req: Request, token: string | undefined) {
  res.cookie("deepfront_session", token || "", {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/",
    maxAge: token ? 14 * 24 * 60 * 60 * 1000 : 0,
  });
}
export function createCommunityRouter(store = communityStore()) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      if (
        req.get("X-DeepFront") !== "1" ||
        (origin && new URL(origin).host !== req.get("host"))
      )
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
    }
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Account creation limit reached. Try again later." },
  });
  const requireUser = (req: Request, res: Response, next: NextFunction) => {
    if (!user(req, store))
      return res.status(401).json({ error: "Sign in to continue." });
    next();
  };
  const admin = (req: Request, res: Response, next: NextFunction) => {
    if (user(req, store)?.role !== "admin")
      return res.status(403).json({ error: "Administrator access required." });
    next();
  };
  router.get("/session", (req, res) => res.json({ user: user(req, store) }));
  router.get("/profile", requireUser, (req, res) =>
    res.json(store.profile(user(req, store)!)),
  );
  router.post("/signup", signupLimiter, (req, res) => {
    const input = Credentials.parse(req.body);
    const account = store.createUser(input.username, input.password);
    cookie(res, req, store.createSession(account.id));
    res.status(201).json({ user: account });
  });
  router.post("/login", authLimiter, (req, res) => {
    const input = Credentials.parse(req.body),
      account = store.authenticate(input.username, input.password);
    if (!account)
      return res.status(401).json({
        error: "Incorrect username or password, or account disabled.",
      });
    cookie(res, req, store.createSession(account.id));
    res.json({ user: account });
  });
  router.post("/logout", (req, res) => {
    store.logout(sessionCookie(req.headers.cookie));
    cookie(res, req, undefined);
    res.json({ ok: true });
  });
  router.post("/password", requireUser, (req, res) => {
    const input = z
      .object({
        current: z.string().max(128),
        password: z.string().min(8).max(128),
      })
      .strict()
      .parse(req.body);
    store.changePassword(user(req, store)!, input.current, input.password);
    cookie(res, req, undefined);
    res.json({ ok: true });
  });
  router.get("/maps", (_req, res) =>
    res.json({ maps: store.listMaps("published") }),
  );
  router.get("/my-maps", requireUser, (req, res) =>
    res.json({ maps: store.listMaps(user(req, store)!.id) }),
  );
  router.post(
    "/maps",
    requireUser,
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Submission limit reached. Try again later." },
    }),
    (req, res) =>
      res.status(201).json({ map: store.submit(user(req, store)!, req.body) }),
  );
  router.get("/maps/:id/draft", requireUser, (req, res) => {
    const draft = store.draft(
      z.string().uuid().parse(req.params.id),
      user(req, store)!,
    );
    if (!draft) return res.status(404).json({ error: "Map not found." });
    res.json({ draft });
  });
  router.get("/maps/:id/preview", requireUser, (req, res) => {
    const draft = store.draft(
      z.string().uuid().parse(req.params.id),
      user(req, store)!,
    );
    if (!draft) return res.status(404).json({ error: "Map not found." });
    res.type("image/svg+xml").send(draftThumbnail(draft));
  });
  router.get("/maps/:id/:file", (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      file = String(req.params.file);
    if (
      ![
        "map.bin",
        "map4x.bin",
        "map16x.bin",
        "manifest.json",
        "thumbnail.svg",
      ].includes(file)
    )
      return res.status(404).end();
    const data = store.asset(id, file);
    if (!data)
      return res.status(404).json({ error: "Published map not found." });
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (file.endsWith(".bin")) res.setHeader("Content-Disposition", "inline");
    res
      .type(
        file.endsWith(".json")
          ? "application/json"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "application/vnd.deepfront.terrain",
      )
      .send(data);
  });
  router.get("/admin", admin, (_req, res) => res.json(store.dashboard()));
  router.post("/admin/maps/:id/review", admin, (req, res) => {
    const input = z
      .object({
        action: z.enum(["approve", "reject"]),
        notes: z.string().max(600),
      })
      .strict()
      .parse(req.body);
    store.review(
      z.string().uuid().parse(req.params.id),
      input.action,
      input.notes,
      user(req, store)!.username,
    );
    res.json({ ok: true });
  });
  router.post("/admin/maps/:id/withdraw", admin, (req, res) => {
    store.withdraw(
      z.string().uuid().parse(req.params.id),
      user(req, store)!.username,
    );
    res.json({ ok: true });
  });
  router.post("/admin/maps/:id/republish", admin, (req, res) => {
    store.republish(
      z.string().uuid().parse(req.params.id),
      user(req, store)!.username,
    );
    res.json({ ok: true });
  });
  router.post("/admin/users/:id/revoke-sessions", admin, (req, res) => {
    store.revokeSessions(
      z.string().uuid().parse(req.params.id),
      user(req, store)!.username,
    );
    res.json({ ok: true });
  });
  router.post("/admin/users/:id", admin, (req, res) => {
    const input = z.object({ disabled: z.boolean() }).strict().parse(req.body);
    store.setDisabled(
      z.string().uuid().parse(req.params.id),
      input.disabled,
      user(req, store)!.username,
    );
    res.json({ ok: true });
  });
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const message =
        error instanceof z.ZodError
          ? error.issues.map((i) => i.message).join(" ")
          : error instanceof Error
            ? error.message
            : "Request failed.";
      res.status(400).json({
        error: message.startsWith("UNIQUE")
          ? "That username is already taken."
          : message,
      });
    },
  );
  return router;
}

export function communityGameGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.headers.cookie?.includes("deepfront_session=")) return next();
  if (
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/community/") &&
    communityStore().session(sessionCookie(req.headers.cookie))?.role ===
      "admin"
  )
    return res.status(403).json({
      error: "Admin accounts can only manage the server and cannot play.",
    });
  next();
}
export function rejectAdminUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  store?: CommunityStore,
): boolean {
  if (!req.headers.cookie?.includes("deepfront_session=")) return false;
  if (
    (store ?? communityStore()).session(sessionCookie(req.headers.cookie))
      ?.role !== "admin"
  )
    return false;
  socket.end(
    "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nAdmin accounts cannot play.",
  );
  return true;
}
