// Fills a fresh database with made-up data for demos and README screenshots.
//   DATA_DIR=/tmp/car-info-demo bun scripts/seed-demo.ts
import { createApp } from "../server/src/app";
import { FILES_DIR, openDb } from "../server/src/db";

const db = openDb();
if ((db.prepare("SELECT COUNT(*) AS n FROM vehicles").get() as { n: number }).n > 0) {
  console.error(`refusing to seed: ${process.env.DATA_DIR ?? "./data"} already has vehicles`);
  process.exit(1);
}
const app = createApp(db, { filesDir: FILES_DIR });
const post = async (path: string, body: unknown) => {
  const res = await app.request(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
  return (await res.json()) as { id: string };
};

// Deterministic "random" so screenshots are stable.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a: number, b: number) => a + rand() * (b - a);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const golf = await post("/vehicles", {
  name: "Golf GTI", type: "car", make: "Volkswagen", model: "Golf GTI 2.0 TSI", year: 2016, plate: "DEM-0A16",
  fuel_type: "Premium", tank_capacity: 50, purchase_date: "2025-03-10", purchase_price: 98000, purchase_odometer: 71200,
});
const bike = await post("/vehicles", {
  name: "CB 500X", type: "motorcycle", make: "Honda", model: "CB 500X", year: 2021, plate: "MOT-0R21",
  fuel_type: "Regular", tank_capacity: 17.7, purchase_date: "2025-06-01", purchase_price: 31000, purchase_odometer: 18400,
});

// Odometer readings from the fill-ups, so service records land on consistent mileage.
const readings = new Map<string, [string, number][]>();
const odoAt = (vehicle: string, date: string) => {
  const r = readings.get(vehicle)!;
  const i = r.findIndex(([d]) => d >= date);
  if (i <= 0) return r[Math.max(i, 0)]![1];
  const [d0, o0] = r[i - 1]!, [d1, o1] = r[i]!;
  const t = (Date.parse(date) - Date.parse(d0)) / (Date.parse(d1) - Date.parse(d0));
  return Math.round(o0 + (o1 - o0) * t);
};

async function fuelHistory(vehicle: string, start: Date, odo: number, o: { kmPerL: number; tank: number; price: number; type: string; every: number }) {
  readings.set(vehicle, [[iso(start), odo]]);
  let d = start;
  let price = o.price;
  while (d < new Date("2026-10-30")) {
    const liters = Math.round(o.tank * between(0.55, 0.9) * 100) / 100;
    odo += Math.round(liters * o.kmPerL * between(0.9, 1.1));
    price = Math.round((price + between(-0.08, 0.1)) * 100) / 100;
    await post("/entries", {
      vehicle_id: vehicle, kind: "fuel", date: iso(d), odometer: odo, fuel_liters: liters, fuel_price: price,
      fuel_type: o.type, full_tank: 1, shop: rand() > 0.5 ? "Posto Ipiranga" : "Shell Av. Brasil",
    });
    readings.get(vehicle)!.push([iso(d), odo]);
    d = addDays(d, Math.round(o.every * between(0.7, 1.3)));
  }
  return odo;
}

await fuelHistory(golf.id, new Date("2025-03-15"), 71200, { kmPerL: 10.5, tank: 50, price: 6.39, type: "Premium", every: 12 });
await fuelHistory(bike.id, new Date("2025-06-05"), 18400, { kmPerL: 24, tank: 17.7, price: 6.09, type: "Regular", every: 10 });

/** `atShop`: whether the odometer was noted (shop visits yes, taxes no). */
const job = (vehicle: string, date: string, atShop: boolean, kind: string, category: string, title: string | null, extra: object) =>
  post("/entries", { vehicle_id: vehicle, kind, category, title, date, odometer: atShop ? odoAt(vehicle, date) : null, ...extra });

const oil = await job(golf.id, "2025-04-02", true, "service", "oil", "Oil change", {
  shop: "Oficina do Zé", labor: 80,
  items: [
    { name: "Engine oil 5W40", brand: "Castrol Edge", qty: 5, unit_price: 64.9 },
    { name: "Oil filter", brand: "Mann", part_number: "HU 6013 z", unit_price: 58 },
  ],
});
await job(golf.id, "2025-10-18", true, "service", "oil", "Oil change", {
  shop: "Oficina do Zé", labor: 80,
  items: [
    { name: "Engine oil 5W40", brand: "Castrol Edge", qty: 5, unit_price: 69.9 },
    { name: "Oil filter", brand: "Mann", part_number: "HU 6013 z", unit_price: 61 },
  ],
});
await job(golf.id, "2025-07-12", true, "service", "brake_discs", "Front pads and discs", {
  shop: "Freios Center", labor: 220,
  items: [
    { name: "Brake discs (pair)", brand: "Fremax", part_number: "BD-5302", unit_price: 640 },
    { name: "Brake pads", brand: "Cobreq", part_number: "N-1376", unit_price: 289 },
  ],
});
await job(golf.id, "2026-02-21", true, "service", "coolant", "Water pump replacement", {
  shop: "VW Autorizada", labor: 450,
  items: [{ name: "Water pump", brand: "INA", part_number: "538 0365 10", unit_price: 1180 }],
});
await job(golf.id, "2026-05-09", true, "service", "tires", "4 new tires", {
  shop: "Pneu Show", labor: 120,
  items: [{ name: "Michelin Pilot Sport 4 225/40 R18", brand: "Michelin", qty: 4, unit_price: 1390 }],
});
await job(golf.id, "2025-05-20", true, "upgrade", "suspension_up", "Coilovers", {
  shop: "Garage 85", labor: 600,
  items: [{ name: "Coilover kit", brand: "KW V1", part_number: "10280056", unit_price: 6900 }],
});
await job(golf.id, "2025-09-03", true, "upgrade", "audio", "Android Auto head unit", {
  shop: "Som & Cia", labor: 250,
  items: [
    { name: "Head unit 9\"", brand: "Pioneer", part_number: "DMH-Z5350BT", unit_price: 2890 },
    { name: "Dash kit + harness", unit_price: 260 },
  ],
});
await job(golf.id, "2026-08-14", true, "upgrade", "lighting", "LED fog lights", { total: 540, shop: "Garage 85" });
await job(golf.id, "2026-01-15", false, "expense", "tax", "IPVA 2026", { total: 3920 });
await job(golf.id, "2025-03-12", false, "expense", "insurance", "Insurance 2025/26", { total: 4380, shop: "Porto Seguro" });
await job(golf.id, "2026-03-11", false, "expense", "insurance", "Insurance 2026/27", { total: 4650, shop: "Porto Seguro" });
await job(golf.id, "2025-11-28", false, "expense", "fine", "Speeding (radar)", { total: 130.16 });
for (const m of ["2025-06-07", "2025-08-16", "2025-12-20", "2026-04-04", "2026-07-25", "2026-10-11"]) {
  await job(golf.id, m, false, "expense", "wash", "Wash + wax", { total: Math.round(between(60, 110)), shop: "Lava Jato Brilho" });
}

await job(bike.id, "2025-09-27", true, "service", "oil", "Oil change", {
  shop: "Moto Peças Sul", labor: 40,
  items: [
    { name: "Engine oil 10W30", brand: "Motul 5100", qty: 3, unit_price: 52 },
    { name: "Oil filter", brand: "Honda", part_number: "15410-MFJ-D01", unit_price: 45 },
  ],
});
await job(bike.id, "2026-04-18", true, "service", "transmission", "Chain and sprockets", {
  shop: "Moto Peças Sul", labor: 90,
  items: [{ name: "Chain kit", brand: "DID", part_number: "525VX3", unit_price: 720 }],
});
await job(bike.id, "2025-07-02", true, "upgrade", "accessory", "Top case + rack", { total: 1490, shop: "Givi Store" });
await job(bike.id, "2026-01-20", false, "expense", "tax", "IPVA 2026", { total: 1120 });

await post("/reminders", { vehicle_id: golf.id, title: "Oil change", category: "oil", interval_km: 10000, interval_months: 12 });
await post("/reminders", { vehicle_id: golf.id, title: "Brake fluid", category: "brake_fluid", interval_months: 24 });
await post("/reminders", { vehicle_id: golf.id, title: "Insurance renewal", interval_months: 12, last_date: "2026-03-11" });
await post("/reminders", { vehicle_id: bike.id, title: "Oil change", category: "oil", interval_km: 6000, interval_months: 12 });

// A receipt on the first oil change, so the paperclip shows up.
const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 300 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const form = new FormData();
form.set("file", new File([pdf], "nota-fiscal-oleo.pdf", { type: "application/pdf" }));
await app.request(`/api/attachments?entry_id=${oil.id}`, { method: "POST", body: form });

const n = db.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number };
console.log(`seeded 2 vehicles, ${n.n} records`);
