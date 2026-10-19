import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  CommunityUser,
  CommunityMapSummary,
  CommunityAdminData,
  communityMapId,
  MAP_EDITOR_WIDTH,
  MAP_EDITOR_HEIGHT,
} from "@openfront/engine-api/game/CommunityMaps";
import { compileDraft, validateDraft } from "./MapCompiler";
import { catalogMaps, CATALOG_AUTHOR } from "./CatalogMaps";

const SESSION_LIFETIME = 14 * 24 * 60 * 60 * 1000;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function passwordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export class CommunityStore {
  readonly db: DatabaseSync;
  constructor(
    directory: string,
    adminPassword = process.env.COMMUNITY_ADMIN_PASSWORD || "Admin123",
  ) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "community.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','player')),created_at INTEGER NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS maps(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,draft TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',notes TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,reviewed_at INTEGER,approved_at INTEGER,scale INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS map_assets(map_id TEXT NOT NULL REFERENCES maps(id),name TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(map_id,name));
      CREATE INDEX IF NOT EXISTS map_status ON maps(status);
      CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);`);
    // Serialize the migration across master and worker processes.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !this.db
          .prepare("PRAGMA table_info(users)")
          .all()
          .some((r) => r.name === "last_login_at")
      )
        this.db.exec("ALTER TABLE users ADD COLUMN last_login_at INTEGER");
      if (
        !this.db
          .prepare("PRAGMA table_info(maps)")
          .all()
          .some((r) => r.name === "author_credit")
      )
        this.db.exec("ALTER TABLE maps ADD COLUMN author_credit TEXT");
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL)`,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (
      !this.db.prepare("SELECT id FROM users WHERE username=?").get("Admin")
    ) {
      const salt = randomBytes(16).toString("hex");
      this.db
        .prepare(
          "INSERT OR IGNORE INTO users(id,username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          "Admin",
          passwordHash(adminPassword, salt),
          salt,
          "admin",
          Date.now(),
        );
    }
  }
  close() {
    this.db.close();
  }
  /** Install the release's curated maps once. Never undo administrator moderation. */
  installCatalogMaps() {
    const entries = catalogMaps();
    if (
      entries.every(({ id }) =>
        this.db.prepare("SELECT id FROM maps WHERE id=?").get(id),
      )
    )
      return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const owner = this.db
        .prepare("SELECT id FROM users WHERE username='Admin'")
        .get()!;
      for (const { id, draft } of entries) {
        if (this.db.prepare("SELECT id FROM maps WHERE id=?").get(id)) continue;
        const compiled = compileDraft(draft),
          now = Date.now();
        this.db
          .prepare(`INSERT INTO maps(id,owner_id,name,description,draft,status,notes,created_at,reviewed_at,approved_at,scale,author_credit)
          VALUES(?,?,?,?,?,'approved',?,?,?,?,?,?)`)
          .run(
            id,
            owner.id,
            draft.name,
            draft.description,
            JSON.stringify(draft),
            "Curated release map. Build By Artin Zomorodian.",
            now,
            now,
            now,
            draft.scale,
            CATALOG_AUTHOR,
          );
        for (const [name, data] of Object.entries(compiled.files))
          this.db
            .prepare("INSERT INTO map_assets VALUES(?,?,?)")
            .run(id, name, data);
        this.record(CATALOG_AUTHOR, "Catalog map published", draft.name);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private record(actor: string, action: string, target: string) {
    this.db
      .prepare("INSERT INTO activity(at,actor,action,target) VALUES(?,?,?,?)")
      .run(Date.now(), actor, action, target);
  }
  private publicUser(row: any): CommunityUser {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      disabled: !!row.disabled,
    };
  }
  createUser(username: string, password: string): CommunityUser {
    if (
      !/^[A-Za-z0-9_]{3,24}$/.test(username) ||
      username.toLowerCase() === "admin"
    )
      throw new Error(
        "Choose a username of 3–24 letters, numbers or underscores.",
      );
    if (password.length < 8 || password.length > 128)
      throw new Error("Password must contain 8–128 characters.");
    if (this.db.prepare("SELECT id FROM users WHERE username=?").get(username))
      throw new Error("That username is already taken.");
    const id = randomUUID(),
      salt = randomBytes(16).toString("hex"),
      now = Date.now();
    this.db
      .prepare(
        "INSERT INTO users(id,username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(id, username, passwordHash(password, salt), salt, "player", now);
    this.record(username, "Account created", username);
    return { id, username, role: "player", createdAt: now, disabled: false };
  }
  authenticate(username: string, password: string): CommunityUser | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username) as any;
    // Do the same expensive hash for nonexistent users to avoid a cheap enumeration path.
    const expected = Buffer.from(row?.password_hash || "0".repeat(128), "hex");
    const actual = Buffer.from(
      passwordHash(password, row?.salt || "unknown-account"),
      "hex",
    );
    if (!timingSafeEqual(expected, actual) || !row || row.disabled) return null;
    return this.publicUser(row);
  }
  createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url"),
      now = Date.now();
    this.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), userId, now + SESSION_LIFETIME);
    this.db
      .prepare("UPDATE users SET last_login_at=? WHERE id=?")
      .run(now, userId);
    return token;
  }
  session(token: string | undefined): CommunityUser | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
      )
      .get(digest(token), Date.now());
    return row ? this.publicUser(row) : null;
  }
  logout(token: string | undefined) {
    if (token)
      this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(digest(token));
  }
  changePassword(user: CommunityUser, current: string, next: string) {
    if (next.length < 8 || next.length > 128)
      throw new Error("Password must contain 8–128 characters.");
    if (!this.authenticate(user.username, current))
      throw new Error("Current password is incorrect.");
    const salt = randomBytes(16).toString("hex");
    this.db
      .prepare("UPDATE users SET password_hash=?,salt=? WHERE id=?")
      .run(passwordHash(next, salt), salt, user.id);
    this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    this.record(user.username, "Password changed", user.username);
  }
  profile(user: CommunityUser) {
    const counts = this.db
      .prepare(
        "SELECT COUNT(*) AS total,SUM(status='approved') AS published,SUM(status='pending') AS pending FROM maps WHERE owner_id=?",
      )
      .get(user.id) as any;
    const sessions = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND expires_at>?",
      )
      .get(user.id, Date.now()) as any;
    return {
      user,
      submissions: counts.total,
      published: counts.published || 0,
      pending: counts.pending || 0,
      sessions: sessions.n,
    };
  }
  dashboard(): CommunityAdminData {
    const now = Date.now();
    const users = this.db
      .prepare(`SELECT u.*,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) AS sessions,
      (SELECT COUNT(*) FROM maps m WHERE m.owner_id=u.id) AS submissions,
      (SELECT COUNT(*) FROM maps m WHERE m.owner_id=u.id AND m.status='approved') AS published
      FROM users u ORDER BY u.created_at DESC LIMIT 1000`)
      .all(now)
      .map((r: any) => ({
        ...this.publicUser(r),
        lastLoginAt: r.last_login_at ?? null,
        sessions: r.sessions,
        submissions: r.submissions,
        published: r.published,
      }));
    const count = (sql: string, ...args: (string | number)[]) =>
      Number((this.db.prepare(sql).get(...args) as any).n);
    return {
      maps: this.listMaps("admin"),
      users,
      activity: this.db
        .prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 100")
        .all()
        .map((r: any) => ({
          id: r.id,
          at: r.at,
          actor: r.actor,
          action: r.action,
          target: r.target,
        })),
      stats: {
        accounts: count("SELECT COUNT(*) AS n FROM users WHERE role='player'"),
        disabled: count("SELECT COUNT(*) AS n FROM users WHERE disabled=1"),
        sessions: count(
          "SELECT COUNT(*) AS n FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>? AND u.disabled=0",
          now,
        ),
        pending: count("SELECT COUNT(*) AS n FROM maps WHERE status='pending'"),
        approved: count(
          "SELECT COUNT(*) AS n FROM maps WHERE status='approved'",
        ),
        rejected: count(
          "SELECT COUNT(*) AS n FROM maps WHERE status='rejected'",
        ),
        withdrawn: count(
          "SELECT COUNT(*) AS n FROM maps WHERE status='withdrawn'",
        ),
        assetBytes: count(
          "SELECT COALESCE(SUM(length(data)),0) AS n FROM map_assets",
        ),
      },
    };
  }
  revokeSessions(id: string, actor: string) {
    const account = this.db
      .prepare("SELECT username FROM users WHERE id=? AND role='player'")
      .get(id) as any;
    if (!account) throw new Error("Player account not found.");
    this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    this.record(actor, "Sessions revoked", account.username);
  }
  users(): CommunityUser[] {
    return this.db
      .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 1000")
      .all()
      .map((r) => this.publicUser(r));
  }
  setDisabled(id: string, disabled: boolean, actor = "System") {
    const result = this.db
      .prepare("UPDATE users SET disabled=? WHERE id=? AND role='player'")
      .run(disabled ? 1 : 0, id);
    if (!result.changes) throw new Error("Player account not found.");
    this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    const account = this.db
      .prepare("SELECT username FROM users WHERE id=?")
      .get(id) as any;
    this.record(
      actor,
      disabled ? "Account disabled" : "Account enabled",
      account.username,
    );
  }
  private summary(row: any): CommunityMapSummary {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      author: row.author_credit || row.username,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? null,
      width: MAP_EDITOR_WIDTH * row.scale,
      height: MAP_EDITOR_HEIGHT * row.scale,
    };
  }
  listMaps(scope: "published" | "admin" | string): CommunityMapSummary[] {
    const base =
      "SELECT m.*,u.username FROM maps m JOIN users u ON u.id=m.owner_id";
    const rows =
      scope === "admin"
        ? this.db.prepare(base + " ORDER BY m.created_at DESC LIMIT 1000").all()
        : scope === "published"
          ? this.db
              .prepare(
                base +
                  " WHERE m.status='approved' ORDER BY m.reviewed_at DESC LIMIT 500",
              )
              .all()
          : this.db
              .prepare(
                base +
                  " WHERE m.owner_id=? ORDER BY m.created_at DESC LIMIT 100",
              )
              .all(scope);
    return rows.map((r) => this.summary(r));
  }
  submit(user: CommunityUser, input: unknown): CommunityMapSummary {
    if (user.role !== "player")
      throw new Error(
        "Administrators manage maps; only player accounts can submit them.",
      );
    const draft = validateDraft(input),
      id = randomUUID();
    const count = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM maps WHERE owner_id=? AND status='pending'",
      )
      .get(user.id) as any;
    if (count.n >= 3)
      throw new Error("You already have three maps awaiting review.");
    this.db
      .prepare(
        "INSERT INTO maps(id,owner_id,name,description,draft,created_at,scale) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        user.id,
        draft.name,
        draft.description,
        JSON.stringify(draft),
        Date.now(),
        draft.scale,
      );
    this.record(user.username, "Map submitted", draft.name);
    return this.listMaps(user.id).find((m) => m.id === id)!;
  }
  draft(id: string, user: CommunityUser) {
    const row = this.db.prepare("SELECT * FROM maps WHERE id=?").get(id) as any;
    if (!row || (row.owner_id !== user.id && user.role !== "admin"))
      return null;
    return JSON.parse(row.draft);
  }
  review(
    id: string,
    action: "approve" | "reject",
    notes: string,
    actor = "System",
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare("SELECT * FROM maps WHERE id=? AND status='pending'")
        .get(id) as any;
      if (!row) throw new Error("This map is no longer awaiting review.");
      if (action === "reject" && !notes.trim())
        throw new Error("Add feedback before rejecting a map.");
      if (action === "approve") {
        const compiled = compileDraft(JSON.parse(row.draft));
        for (const [name, data] of Object.entries(compiled.files))
          this.db
            .prepare("INSERT INTO map_assets VALUES(?,?,?)")
            .run(id, name, data);
      }
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE maps SET status=?,notes=?,reviewed_at=?,approved_at=? WHERE id=?",
        )
        .run(
          action === "approve" ? "approved" : "rejected",
          notes.trim(),
          now,
          action === "approve" ? now : null,
          id,
        );
      this.record(
        actor,
        action === "approve" ? "Map approved" : "Map rejected",
        row.name,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  withdraw(id: string, actor = "System") {
    const result = this.db
      .prepare(
        "UPDATE maps SET status='withdrawn' WHERE id=? AND status='approved'",
      )
      .run(id);
    if (!result.changes) throw new Error("Published map not found.");
    this.record(
      actor,
      "Map unpublished",
      (this.db.prepare("SELECT name FROM maps WHERE id=?").get(id) as any).name,
    );
  }
  republish(id: string, actor: string) {
    const result = this.db
      .prepare(
        "UPDATE maps SET status='approved' WHERE id=? AND status='withdrawn' AND approved_at IS NOT NULL",
      )
      .run(id);
    if (!result.changes) throw new Error("Withdrawn map not found.");
    this.record(
      actor,
      "Map republished",
      (this.db.prepare("SELECT name FROM maps WHERE id=?").get(id) as any).name,
    );
  }
  isPublished(id: string) {
    return !!this.db
      .prepare("SELECT id FROM maps WHERE id=? AND status='approved'")
      .get(id);
  }
  asset(id: string, name: string): Buffer | null {
    const row = this.db
      .prepare(
        "SELECT a.data FROM map_assets a JOIN maps m ON m.id=a.map_id WHERE a.map_id=? AND a.name=? AND m.approved_at IS NOT NULL",
      )
      .get(id, name) as any;
    return row ? Buffer.from(row.data) : null;
  }
}
let store: CommunityStore | undefined;
export function communityStore() {
  if (!store) {
    const opened = new CommunityStore(
      process.env.COMMUNITY_DATA_DIR || path.resolve(".data"),
    );
    try {
      opened.installCatalogMaps();
      store = opened;
    } catch (error) {
      opened.close();
      throw error;
    }
  }
  return store;
}
export function mapIsAvailable(map: string) {
  const id = communityMapId(map);
  return !id || communityStore().isPublished(id);
}
export function sessionCookie(header: string | undefined): string | undefined {
  return header
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("deepfront_session="))
    ?.slice("deepfront_session=".length);
}
