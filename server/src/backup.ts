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

function prune() {
  for (const old of listBackups().filter((f) => f.startsWith("daily-")).slice(KEEP)) {
    rmSync(join(BACKUP_DIR, old), { force: true });
  }
}

/** Takes one snapshot per day (checked hourly), keeps the newest BACKUP_KEEP, then runs `alsoBackUp` (attachments). */
export function scheduleDailyBackups(db: Database, alsoBackUp?: () => void) {
  const run = () => {
    const name = `daily-${new Date().toISOString().slice(0, 10)}.sqlite`;
    if (listBackups().includes(name)) return;
    try {
      snapshot(db, name);
      prune();
      alsoBackUp?.();
      console.log(`backup written: ${name}`);
    } catch (err) {
      console.error("backup failed", err);
    }
  };
  run();
  return setInterval(run, 60 * 60 * 1000);
}
