import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "./data";
export const FILES_DIR = process.env.FILES_DIR ?? `${DATA_DIR}/files`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'car',
  make TEXT,
  model TEXT,
  year INTEGER,
  plate TEXT,
  vin TEXT,
  fuel_type TEXT,
  tank_capacity REAL,
  purchase_date TEXT,
  purchase_price REAL,
  purchase_odometer INTEGER,
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  category TEXT,
  title TEXT,
  date TEXT NOT NULL,
  odometer INTEGER,
  total REAL NOT NULL DEFAULT 0,
  labor REAL,
  shop TEXT,
  notes TEXT,
  fuel_liters REAL,
  fuel_price REAL,
  fuel_type TEXT,
  full_tank INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_vehicle_date ON entries(vehicle_id, date);

CREATE TABLE IF NOT EXISTS entry_items (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  part_number TEXT,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entry_items_entry ON entry_items(entry_id);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  interval_km INTEGER,
  interval_months INTEGER,
  last_date TEXT,
  last_odometer INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Receipts, invoices, registration papers. The bytes live in FILES_DIR/<id>; entry_id is null for
-- documents that belong to the vehicle itself.
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_vehicle ON attachments(vehicle_id);
CREATE INDEX IF NOT EXISTS attachments_entry ON attachments(entry_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`;

export function openDb(path = `${DATA_DIR}/car-info.sqlite`): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
