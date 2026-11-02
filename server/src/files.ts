import type { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BadRequest } from "./fields";
import { newId, now } from "./db";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

export type Attachment = {
  id: string;
  vehicle_id: string;
  entry_id: string | null;
  name: string;
  mime: string;
  size: number;
  created_at: string;
};

/** Attachment rows in SQLite, bytes on disk. Deleting a vehicle/entry cascades the rows; prune() drops the files. */
export function createFiles(db: Database, dir: string) {
  mkdirSync(dir, { recursive: true });
  const path = (id: string) => join(dir, id);

  const files = {
    list(filter: { vehicle_id?: string; entry_id?: string }) {
      if (filter.entry_id) {
        return db.prepare("SELECT * FROM attachments WHERE entry_id = ? ORDER BY created_at").all(filter.entry_id) as Attachment[];
      }
      if (filter.vehicle_id) {
        return db.prepare("SELECT * FROM attachments WHERE vehicle_id = ? ORDER BY created_at DESC").all(filter.vehicle_id) as Attachment[];
      }
      return db.prepare("SELECT * FROM attachments ORDER BY created_at DESC").all() as Attachment[];
    },
    get(id: string) {
      return db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Attachment | null;
    },
    async save(file: File, target: { vehicle_id?: string; entry_id?: string }) {
      if (file.size > MAX_FILE_BYTES) throw new BadRequest("files are limited to 20 MB");
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED.test(mime)) throw new BadRequest("only photos and PDFs can be attached");
      let vehicleId = target.vehicle_id;
      if (target.entry_id) {
        const entry = db.prepare("SELECT vehicle_id FROM entries WHERE id = ?").get(target.entry_id) as { vehicle_id: string } | null;
        if (!entry) throw new BadRequest("unknown entry_id");
        vehicleId = entry.vehicle_id;
      }
      if (!vehicleId || !db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(vehicleId)) {
        throw new BadRequest("unknown vehicle_id");
      }
      const row: Attachment = {
        id: newId(),
        vehicle_id: vehicleId,
        entry_id: target.entry_id ?? null,
        name: (file.name || "file").slice(0, 200),
        mime,
        size: file.size,
        created_at: now(),
      };
      await Bun.write(path(row.id), file);
      db.prepare(
        "INSERT INTO attachments (id, vehicle_id, entry_id, name, mime, size, created_at) VALUES ($id, $vehicle_id, $entry_id, $name, $mime, $size, $created_at)",
      ).run(row);
      return row;
    },
    file(id: string) {
      return Bun.file(path(id));
    },
    remove(id: string) {
      const gone = db.prepare("DELETE FROM attachments WHERE id = ?").run(id).changes > 0;
      if (gone) rmSync(path(id), { force: true });
      return gone;
    },
    /** Deletes files whose row is gone (after a vehicle/entry delete or a JSON restore). */
    prune() {
      const known = new Set((db.prepare("SELECT id FROM attachments").all() as { id: string }[]).map((r) => r.id));
      for (const f of readdirSync(dir)) if (!known.has(f)) rmSync(path(f), { force: true });
    },
    /** Copies files missing from `target`. Attachments never change after upload, so presence is enough. */
    mirror(target: string) {
      mkdirSync(target, { recursive: true });
      for (const f of readdirSync(dir)) {
        if (!existsSync(join(target, f))) copyFileSync(path(f), join(target, f));
      }
    },
  };
  return files;
}

export type Files = ReturnType<typeof createFiles>;
