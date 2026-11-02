import type { Database } from "bun:sqlite";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { BadRequest } from "./fields";
import { createStore } from "./store";
import { BACKUP_DIR, listBackups, snapshot } from "./backup";
import { join } from "node:path";
import { FILES_DIR, now } from "./db";
import { parseCarNotes, readXlsx } from "./carnotes";
import { createFiles } from "./files";

type Opts = { password?: string; filesDir?: string };

export function createApp(db: Database, { password, filesDir = FILES_DIR }: Opts = {}) {
  const store = createStore(db);
  const files = createFiles(db, filesDir);
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  const body = async (c: Context) => {
    try {
      return (await c.req.json()) as Record<string, unknown>;
    } catch {
      throw new BadRequest("invalid JSON body");
    }
  };
  const found = (c: Context, v: unknown) => (v ? c.json(v) : c.json({ error: "not found" }, 404));

  // ---- auth: a single shared password (APP_PASSWORD). No password = open (trusted LAN only).
  // ?token= exists for <img>/<a> pointing at attachments from the Android app, which can't send headers or cookies.
  const tokenOf = (c: Context) =>
    c.req.header("authorization")?.replace(/^Bearer /, "") ??
    getCookie(c, "car_info_token") ??
    (c.req.method === "GET" && c.req.path.endsWith("/file") ? c.req.query("token") : undefined);
  const validToken = (t?: string) =>
    !!t && !!db.prepare("SELECT 1 FROM sessions WHERE token = ?").get(t);

  // The Android (Capacitor) app loads from its own origin and talks to the API with a bearer token.
  api.use(
    "*",
    cors({
      origin: ["https://localhost", "http://localhost", "capacitor://localhost"],
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE"],
      exposeHeaders: ["content-disposition"],
    }),
  );
  api.get("/health", (c) => c.json({ ok: true }));
  api.get("/session", (c) =>
    c.json({ auth_required: !!password, authenticated: !password || validToken(tokenOf(c)) }),
  );
  api.post("/login", async (c) => {
    if (!password) return c.json({ token: null });
    const { password: given } = await body(c);
    const a = new TextEncoder().encode(String(given ?? ""));
    const b = new TextEncoder().encode(password);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      await Bun.sleep(500);
      return c.json({ error: "wrong password" }, 401);
    }
    const token = crypto.randomUUID() + crypto.randomUUID();
    db.prepare("INSERT INTO sessions (token, created_at) VALUES (?, ?)").run(token, now());
    // Cookie lets plain links (backup downloads) work; the SPA also sends the bearer header.
    setCookie(c, "car_info_token", token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/api",
      maxAge: 60 * 60 * 24 * 365,
    });
    return c.json({ token });
  });
  api.post("/logout", (c) => {
    const t = tokenOf(c);
    if (t) db.prepare("DELETE FROM sessions WHERE token = ?").run(t);
    return c.json({ ok: true });
  });
  api.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    if (password && !validToken(tokenOf(c))) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  // ---- vehicles
  api.get("/vehicles", (c) => c.json(store.listVehicles()));
  api.post("/vehicles", async (c) => c.json(store.createVehicle(await body(c)), 201));
  api.get("/vehicles/:id", (c) => found(c, store.getVehicle(c.req.param("id"))));
  api.patch("/vehicles/:id", async (c) =>
    found(c, store.updateVehicle(c.req.param("id"), await body(c))),
  );
  api.delete("/vehicles/:id", (c) => {
    const ok = store.deleteVehicle(c.req.param("id"));
    files.prune();
    return found(c, ok && { ok: true });
  });

  // ---- entries
  api.get("/entries", (c) =>
    c.json(store.listEntries({ vehicle_id: c.req.query("vehicle_id"), kind: c.req.query("kind") })),
  );
  api.post("/entries", async (c) => c.json(store.createEntry(await body(c)), 201));
  api.get("/entries/:id", (c) => found(c, store.getEntry(c.req.param("id"))));
  api.patch("/entries/:id", async (c) => found(c, store.updateEntry(c.req.param("id"), await body(c))));
  api.delete("/entries/:id", (c) => {
    const ok = store.deleteEntry(c.req.param("id"));
    files.prune();
    return found(c, ok && { ok: true });
  });

  // ---- attachments (receipts, invoices, documents)
  api.get("/attachments", (c) =>
    c.json(files.list({ vehicle_id: c.req.query("vehicle_id"), entry_id: c.req.query("entry_id") })),
  );
  api.post("/attachments", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new BadRequest("send the file as multipart field `file`");
    const target = { vehicle_id: c.req.query("vehicle_id"), entry_id: c.req.query("entry_id") };
    return c.json(await files.save(file, target), 201);
  });
  api.get("/attachments/:id/file", (c) => {
    const a = files.get(c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const disposition = c.req.query("download") ? "attachment" : "inline";
    return c.body(files.file(a.id).stream(), 200, {
      "content-type": a.mime,
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "cache-control": "private, max-age=31536000, immutable",
    });
  });
  api.delete("/attachments/:id", (c) => found(c, files.remove(c.req.param("id")) && { ok: true }));

  // ---- reminders
  api.get("/reminders", (c) => c.json(store.listReminders(c.req.query("vehicle_id"))));
  api.post("/reminders", async (c) => c.json(store.createReminder(await body(c)), 201));
  api.patch("/reminders/:id", async (c) =>
    found(c, store.updateReminder(c.req.param("id"), await body(c))),
  );
  api.delete("/reminders/:id", (c) => found(c, store.deleteReminder(c.req.param("id")) && { ok: true }));

  // ---- backups
  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  api.get("/export", (c) => {
    c.header("content-disposition", `attachment; filename="car-info-${stamp()}.json"`);
    return c.json(store.exportAll());
  });
  api.post("/import", async (c) => {
    snapshot(db, `pre-import-${stamp()}.sqlite`); // safety net before replacing everything
    const result = store.importAll(await body(c), (id) => files.file(id).size > 0);
    files.prune();
    return c.json(result);
  });
  // Car Notes (Android app) Excel export. ?dry_run=1 previews; ?exported_at=YYYY-MM-DD fixes typo'd years.
  api.post("/import/carnotes", async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    let sheets;
    try {
      sheets = readXlsx(bytes);
    } catch {
      throw new BadRequest("not an .xlsx file");
    }
    const exportedOn = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("exported_at") ?? "")
      ? c.req.query("exported_at")!
      : now().slice(0, 10);
    const { vehicles, warnings } = parseCarNotes(sheets, exportedOn);
    if (!vehicles.length) throw new BadRequest("no vehicles found in this file");
    const dryRun = c.req.query("dry_run") === "1";
    if (!dryRun) snapshot(db, `pre-import-${stamp()}.sqlite`);
    return c.json({ vehicles: store.mergeImport(vehicles, dryRun), warnings, dry_run: dryRun });
  });
  api.get("/backups", (c) => c.json(listBackups()));
  api.post("/backups", (c) => {
    snapshot(db, `manual-${stamp()}.sqlite`);
    files.mirror(join(BACKUP_DIR, "files"));
    return c.json({ ok: true });
  });
  api.get("/backup.sqlite", (c) => {
    const file = snapshot(db, "download.sqlite");
    c.header("content-disposition", `attachment; filename="car-info-${stamp()}.sqlite"`);
    return c.body(Bun.file(file).stream(), 200, { "content-type": "application/vnd.sqlite3" });
  });

  api.all("*", (c) => c.json({ error: "not found" }, 404));

  return new Hono().route("/api", api);
}
