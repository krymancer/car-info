import type { Database } from "bun:sqlite";
import {
  BadRequest,
  ENTRY_KINDS,
  entryFields,
  itemFields,
  pick,
  reminderFields,
  vehicleFields,
} from "./fields";
import { newId, now } from "./db";
import type { ImportVehicle } from "./carnotes";

type Row = Record<string, unknown>;

function insert(db: Database, table: string, row: Row) {
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `$${c}`).join(",")})`,
  ).run(row as never);
}

function update(db: Database, table: string, id: string, row: Row): boolean {
  const cols = Object.keys(row);
  if (!cols.length) return true;
  const res = db
    .prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = $${c}`).join(",")} WHERE id = $id`)
    .run({ ...row, id } as never);
  return res.changes > 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function createStore(db: Database) {
  const itemsFor = (entryIds: string[]): Map<string, Row[]> => {
    const map = new Map<string, Row[]>();
    if (!entryIds.length) return map;
    const rows = db
      .prepare(
        `SELECT * FROM entry_items WHERE entry_id IN (${entryIds.map(() => "?").join(",")}) ORDER BY position`,
      )
      .all(...entryIds) as Row[];
    for (const r of rows) {
      const list = map.get(r.entry_id as string) ?? [];
      list.push(r);
      map.set(r.entry_id as string, list);
    }
    return map;
  };

  const withItems = (entries: Row[]) => {
    const items = itemsFor(entries.map((e) => e.id as string));
    return entries.map((e) => ({ ...e, items: items.get(e.id as string) ?? [] }));
  };

  /** Validates an entry payload and derives totals from its line items / fuel numbers. */
  const normalizeEntry = (input: Row, partial: boolean) => {
    const fields = pick(entryFields, input);
    if (!partial) {
      if (!fields.kind) throw new BadRequest("kind is required");
      if (!fields.date) throw new BadRequest("date is required");
    }
    if (fields.kind && !ENTRY_KINDS.includes(fields.kind as never)) {
      throw new BadRequest(`kind must be one of ${ENTRY_KINDS.join(", ")}`);
    }
    let items: Row[] | undefined;
    if (Array.isArray(input.items)) {
      items = input.items.map((it) => {
        const item = pick(itemFields, it);
        if (!item.name) throw new BadRequest("every part needs a name");
        return { qty: 1, unit_price: 0, ...item };
      });
      if (items.length) {
        const parts = items.reduce((s, i) => s + (i.qty as number) * (i.unit_price as number), 0);
        fields.total = round2(parts + ((fields.labor as number | null) ?? 0));
      }
    }
    if (fields.kind === "fuel") {
      const liters = fields.fuel_liters as number | null | undefined;
      const price = fields.fuel_price as number | null | undefined;
      const total = fields.total as number | null | undefined;
      if (!total && liters && price) fields.total = round2(liters * price);
      else if (total && price && !liters) fields.fuel_liters = round2(total / price);
      else if (total && liters && !price) fields.fuel_price = Math.round((total / liters) * 1000) / 1000;
    }
    if (fields.total === null) fields.total = 0;
    return { fields, items };
  };

  const replaceItems = (entryId: string, items: Row[]) => {
    db.prepare("DELETE FROM entry_items WHERE entry_id = ?").run(entryId);
    items.forEach((it, position) =>
      insert(db, "entry_items", { id: newId(), entry_id: entryId, position, ...it }),
    );
  };

  const vehicleExists = (id: unknown) =>
    !!db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(String(id));

  const store = {
    // ---- vehicles
    listVehicles() {
      return db
        .prepare(
          `SELECT v.*, (SELECT COALESCE(e.odometer_after, e.odometer) FROM entries e
             WHERE e.vehicle_id = v.id AND e.odometer IS NOT NULL
             ORDER BY e.date DESC, e.odometer_after IS NULL, e.odometer DESC LIMIT 1) AS last_odometer
           FROM vehicles v ORDER BY archived, created_at`,
        )
        .all();
    },
    getVehicle(id: string) {
      return db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
    },
    createVehicle(input: Row) {
      const fields = pick(vehicleFields, input);
      if (!fields.name) throw new BadRequest("name is required");
      const id = newId();
      const t = now();
      insert(db, "vehicles", { id, type: "car", archived: 0, ...fields, created_at: t, updated_at: t });
      return store.getVehicle(id);
    },
    updateVehicle(id: string, input: Row) {
      const fields = pick(vehicleFields, input);
      if (fields.name === null) throw new BadRequest("name is required");
      return update(db, "vehicles", id, { ...fields, updated_at: now() }) ? store.getVehicle(id) : null;
    },
    deleteVehicle(id: string) {
      return db.prepare("DELETE FROM vehicles WHERE id = ?").run(id).changes > 0;
    },

    // ---- entries (fuel, service, upgrade, expense)
    listEntries(filter: { vehicle_id?: string; kind?: string }) {
      const where: string[] = [];
      const params: Row = {};
      if (filter.vehicle_id) {
        where.push("vehicle_id = $vehicle_id");
        params.vehicle_id = filter.vehicle_id;
      }
      if (filter.kind) {
        where.push("kind = $kind");
        params.kind = filter.kind;
      }
      const rows = db
        .prepare(
          `SELECT e.*, (SELECT COUNT(*) FROM attachments a WHERE a.entry_id = e.id) AS attachment_count
           FROM entries e ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
           ORDER BY date DESC, odometer DESC, created_at DESC`,
        )
        .all(params as never) as Row[];
      return withItems(rows);
    },
    getEntry(id: string) {
      const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Row | null;
      return row ? withItems([row])[0] : null;
    },
    createEntry(input: Row) {
      if (!vehicleExists(input.vehicle_id)) throw new BadRequest("unknown vehicle_id");
      const { fields, items } = normalizeEntry(input, false);
      const id = newId();
      const t = now();
      db.transaction(() => {
        insert(db, "entries", {
          id,
          vehicle_id: String(input.vehicle_id),
          total: 0,
          ...fields,
          created_at: t,
          updated_at: t,
        });
        if (items) replaceItems(id, items);
      })();
      return store.getEntry(id);
    },
    updateEntry(id: string, input: Row) {
      const { fields, items } = normalizeEntry(input, true);
      if (input.vehicle_id !== undefined) {
        if (!vehicleExists(input.vehicle_id)) throw new BadRequest("unknown vehicle_id");
        fields.vehicle_id = String(input.vehicle_id);
      }
      let ok = false;
      db.transaction(() => {
        ok = update(db, "entries", id, { ...fields, updated_at: now() });
        if (ok && items) replaceItems(id, items);
      })();
      return ok ? store.getEntry(id) : null;
    },
    deleteEntry(id: string) {
      return db.prepare("DELETE FROM entries WHERE id = ?").run(id).changes > 0;
    },

    // ---- reminders
    listReminders(vehicleId?: string) {
      const reminders = (
        vehicleId
          ? db.prepare("SELECT * FROM reminders WHERE vehicle_id = ? ORDER BY created_at").all(vehicleId)
          : db.prepare("SELECT * FROM reminders ORDER BY created_at").all()
      ) as Row[];
      // A logged service with the same category counts as the reminder being "done".
      const lastService = db.prepare(
        `SELECT date, odometer FROM entries
         WHERE vehicle_id = ? AND category = ? AND kind IN ('service','upgrade')
         ORDER BY date DESC, odometer DESC LIMIT 1`,
      );
      return reminders.map((r) => {
        const done = r.category
          ? (lastService.get(r.vehicle_id as string, r.category as string) as Row | null)
          : null;
        const useDone = done && (!r.last_date || (done.date as string) >= (r.last_date as string));
        return {
          ...r,
          effective_last_date: useDone ? done.date : r.last_date,
          effective_last_odometer: useDone ? (done.odometer ?? r.last_odometer) : r.last_odometer,
        };
      });
    },
    createReminder(input: Row) {
      if (!vehicleExists(input.vehicle_id)) throw new BadRequest("unknown vehicle_id");
      const fields = pick(reminderFields, input);
      if (!fields.title) throw new BadRequest("title is required");
      if (!fields.interval_km && !fields.interval_months) {
        throw new BadRequest("set an interval in km or months");
      }
      const id = newId();
      const t = now();
      insert(db, "reminders", {
        id,
        vehicle_id: String(input.vehicle_id),
        ...fields,
        created_at: t,
        updated_at: t,
      });
      return db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
    },
    updateReminder(id: string, input: Row) {
      const fields = pick(reminderFields, input);
      if (fields.title === null) throw new BadRequest("title is required");
      return update(db, "reminders", id, { ...fields, updated_at: now() })
        ? db.prepare("SELECT * FROM reminders WHERE id = ?").get(id)
        : null;
    },
    deleteReminder(id: string) {
      return db.prepare("DELETE FROM reminders WHERE id = ?").run(id).changes > 0;
    },

    /**
     * Adds vehicles/entries from another app without touching existing data. Vehicles match by plate
     * (or name); entries already present (same kind, category, date, odometer, total) are skipped,
     * so importing the same file twice is harmless.
     */
    mergeImport(vehicles: ImportVehicle[], dryRun: boolean) {
      const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const existing = db.prepare("SELECT id, name, plate FROM vehicles").all() as Row[];
      const key = (e: Row) =>
        [e.kind, e.category ?? "", e.date, e.odometer ?? "", Number(e.total ?? 0).toFixed(2)].join("|");
      const result = vehicles.map((v) => {
        const match = existing.find(
          (x) => (v.plate && norm(x.plate) === norm(v.plate)) || norm(x.name) === norm(v.name),
        );
        const seen = new Set(
          match ? (db.prepare("SELECT * FROM entries WHERE vehicle_id = ?").all(match.id as string) as Row[]).map(key) : [],
        );
        const fresh = v.entries.filter((e) => {
          const k = key(e);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        return { vehicle: v, match, fresh };
      });

      if (!dryRun) {
        db.transaction(() => {
          for (const r of result) {
            let vehicleId = r.match?.id as string | undefined;
            if (!vehicleId) {
              vehicleId = (store.createVehicle({
                name: r.vehicle.name,
                type: r.vehicle.type,
                plate: r.vehicle.plate,
                purchase_date: r.vehicle.purchase_date,
                fuel_type: r.vehicle.entries.find((e) => e.fuel_type)?.fuel_type,
              }) as Row).id as string;
            }
            for (const e of r.fresh) store.createEntry({ ...e, vehicle_id: vehicleId });
          }
        })();
      }
      return result.map((r) => ({
        name: r.vehicle.name,
        plate: r.vehicle.plate,
        existing: !!r.match,
        new_entries: r.fresh.length,
        duplicates: r.vehicle.entries.length - r.fresh.length,
      }));
    },

    // ---- export / import (full JSON snapshot)
    exportAll() {
      return {
        app: "car-info",
        version: 1,
        exported_at: now(),
        vehicles: db.prepare("SELECT * FROM vehicles").all(),
        entries: withItems(db.prepare("SELECT * FROM entries").all() as Row[]),
        reminders: db.prepare("SELECT * FROM reminders").all(),
        // Metadata only; the files themselves are in the SQLite backups' sibling files/ folder.
        attachments: db.prepare("SELECT * FROM attachments").all(),
      };
    },
    importAll(data: Row, hasFile?: (id: string) => boolean) {
      if (data?.app !== "car-info" || data.version !== 1) {
        throw new BadRequest("not a car-info v1 export");
      }
      const list = (k: string) => (Array.isArray(data[k]) ? (data[k] as Row[]) : []);
      const t = now();
      const meta = (r: Row) => ({
        id: String(r.id ?? newId()),
        created_at: String(r.created_at ?? t),
        updated_at: String(r.updated_at ?? t),
      });
      db.transaction(() => {
        db.exec(
          "DELETE FROM attachments; DELETE FROM entry_items; DELETE FROM entries; DELETE FROM reminders; DELETE FROM vehicles;",
        );
        for (const v of list("vehicles")) {
          insert(db, "vehicles", { type: "car", archived: 0, ...pick(vehicleFields, v), ...meta(v) });
        }
        for (const e of list("entries")) {
          const m = meta(e);
          insert(db, "entries", {
            total: 0,
            ...pick(entryFields, e),
            vehicle_id: String(e.vehicle_id),
            ...m,
          });
          if (Array.isArray(e.items)) {
            replaceItems(
              m.id,
              e.items.map((it) => ({ qty: 1, unit_price: 0, ...pick(itemFields, it) })),
            );
          }
        }
        for (const r of list("reminders")) {
          insert(db, "reminders", {
            ...pick(reminderFields, r),
            vehicle_id: String(r.vehicle_id),
            ...meta(r),
          });
        }
        // Rows only come back for files still on disk (the caller prunes the rest).
        for (const a of list("attachments")) {
          if (!a.id || !a.vehicle_id || !hasFile?.(String(a.id))) continue;
          insert(db, "attachments", {
            id: String(a.id),
            vehicle_id: String(a.vehicle_id),
            entry_id: a.entry_id ? String(a.entry_id) : null,
            name: String(a.name ?? "file"),
            mime: String(a.mime ?? "application/octet-stream"),
            size: Number(a.size ?? 0),
            created_at: String(a.created_at ?? t),
          });
        }
      })();
      return {
        vehicles: list("vehicles").length,
        entries: list("entries").length,
        reminders: list("reminders").length,
      };
    },
  };
  return store;
}

export type Store = ReturnType<typeof createStore>;
