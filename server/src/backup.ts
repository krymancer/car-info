import type { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./db";

export const BACKUP_DIR = process.env.BACKUP_DIR ?? join(DATA_DIR, "backups");
const KEEP = Number(process.env.BACKUP_KEEP ?? 30);

/** Writes a consistent SQLite snapshot (safe while the app is running). */
export function snapshot(db: Database, name: string): string {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, name);
  rmSync(file, { force: true });
  db.prepare("VACUUM INTO ?").run(file);
  return file;
}

export function listBackups(): string[] {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".sqlite"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * A random tag stored in the database itself. Daily snapshot names carry it, so two instances sharing one
 * backup folder (e.g. a staging cluster pointed at the same NAS share) never overwrite or prune each other.
 */
export function instanceTag(db: Database): string {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('instance', ?)").run(crypto.randomUUID().slice(0, 8));
  return (db.prepare("SELECT value FROM meta WHERE key = 'instance'").get() as { value: string }).value;
}

function prune(tag: string) {
  const mine = listBackups().filter((f) => f.startsWith("daily-") && f.endsWith(`-${tag}.sqlite`));
  for (const old of mine.slice(KEEP)) rmSync(join(BACKUP_DIR, old), { force: true });
}

/** Takes one snapshot per day (checked hourly), keeps the newest BACKUP_KEEP, then runs `alsoBackUp` (attachments). */
export function scheduleDailyBackups(db: Database, alsoBackUp?: () => void) {
  const tag = instanceTag(db);
  const run = () => {
    const name = `daily-${new Date().toISOString().slice(0, 10)}-${tag}.sqlite`;
    if (listBackups().includes(name)) return;
    try {
      snapshot(db, name);
      prune(tag);
      alsoBackUp?.();
      console.log(`backup written: ${name}`);
    } catch (err) {
      console.error("backup failed", err);
    }
  };
  run();
  return setInterval(run, 60 * 60 * 1000);
}
