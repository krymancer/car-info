import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpFiles = () => mkdtempSync(join(tmpdir(), "car-info-files-"));

const setup = (password?: string, filesDir = tmpFiles()) => {
  const app = createApp(openDb(":memory:"), { password, filesDir });
  const upload = async (query: string, file: File, token?: string) => {
    const form = new FormData();
    form.set("file", file);
    const res = await app.request(`/api/attachments?${query}`, {
      method: "POST",
      body: form,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const raw = (path: string) => app.request(`/api${path}`);
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return Object.assign(call, { upload, raw });
};

describe("api", () => {
  test("service entry total is labor + parts", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Civic" })).json;
    const e = await call("POST", "/entries", {
      vehicle_id: v.id,
      kind: "service",
      category: "oil",
      date: "2026-10-01",
      odometer: "125.400".replace(".", ""),
      labor: 50,
      items: [
        { name: "Oil 5W30", qty: 4, unit_price: "39,90" },
        { name: "Oil filter", unit_price: 25 },
      ],
    });
    expect(e.status).toBe(201);
    expect(e.json.total).toBe(234.6);
    expect(e.json.items).toHaveLength(2);
    expect(e.json.odometer).toBe(125400);
  });

  test("fuel derives liters from total and price", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Civic" })).json;
    const e = await call("POST", "/entries", {
      vehicle_id: v.id,
      kind: "fuel",
      date: "2026-10-16",
      total: 154.54,
      fuel_price: 6.89,
    });
    expect(e.json.fuel_liters).toBe(22.43);
  });

  test("reminder uses latest matching service as last done", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Civic" })).json;
    await call("POST", "/reminders", {
      vehicle_id: v.id,
      title: "Timing belt",
      category: "timing_belt",
      interval_km: 90000,
      last_date: "2020-01-01",
      last_odometer: 150000,
    });
    await call("POST", "/entries", {
      vehicle_id: v.id,
      kind: "service",
      category: "timing_belt",
      date: "2026-01-28",
      odometer: 120000,
      total: 900,
    });
    const [r] = (await call("GET", `/reminders?vehicle_id=${v.id}`)).json;
    expect(r.effective_last_odometer).toBe(120000);
    expect(r.effective_last_date).toBe("2026-01-28");
  });

  test("export then import round-trips", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Nx 200", type: "motorcycle" })).json;
    await call("POST", "/entries", {
      vehicle_id: v.id,
      kind: "upgrade",
      date: "2026-05-01",
      items: [{ name: "LED headlight", unit_price: 120 }],
    });
    const dump = (await call("GET", "/export")).json;
    await call("DELETE", `/vehicles/${v.id}`);
    expect((await call("GET", "/entries")).json).toHaveLength(0);
    const res = await call("POST", "/import", dump);
    expect(res.json).toEqual({ vehicles: 1, entries: 1, reminders: 0 });
    const [e] = (await call("GET", "/entries")).json;
    expect(e.items[0].name).toBe("LED headlight");
  });

  test("typed numbers: digit grouping in whole fields, both decimal styles", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Civic", year: "2.000", purchase_odometer: "189.673" })).json;
    expect(v.year).toBe(2000);
    expect(v.purchase_odometer).toBe(189673);
    const e = (await call("POST", "/entries", { vehicle_id: v.id, kind: "expense", date: "2026-01-01", total: "1.234,56", odometer: "190,100" })).json;
    expect(e.total).toBe(1234.56);
    expect(e.odometer).toBe(190100);
    const f = (await call("POST", "/entries", { vehicle_id: v.id, kind: "fuel", date: "2026-01-01", total: "100", fuel_price: "6.199" })).json;
    expect(f.fuel_price).toBe(6.199);
  });

  test("odometer swap: stored, and the vehicle shows the new cluster's reading", async () => {
    const call = setup();
    const v = (await call("POST", "/vehicles", { name: "Civic" })).json;
    await call("POST", "/entries", { vehicle_id: v.id, kind: "fuel", date: "2026-01-01", total: 100, odometer: 191_379 });
    const swap = (await call("POST", "/entries", { vehicle_id: v.id, kind: "service", date: "2026-03-15", odometer: 191_480, odometer_after: "223.930" })).json;
    expect(swap.odometer_after).toBe(223_930);
    expect((await call("GET", "/vehicles")).json[0].last_odometer).toBe(223_930);
    await call("POST", "/entries", { vehicle_id: v.id, kind: "fuel", date: "2026-03-28", total: 100, odometer: 224_029 });
    expect((await call("GET", "/vehicles")).json[0].last_odometer).toBe(224_029);
  });

  test("password protects the api", async () => {
    const call = setup("hunter2");
    expect((await call("GET", "/vehicles")).status).toBe(401);
    expect((await call("POST", "/login", { password: "nope" })).status).toBe(401);
    const { token } = (await call("POST", "/login", { password: "hunter2" })).json;
    expect((await call("GET", "/vehicles", undefined, token)).status).toBe(200);
  });

  test("rejects bad input", async () => {
    const call = setup();
    expect((await call("POST", "/vehicles", {})).status).toBe(400);
    expect((await call("POST", "/entries", { vehicle_id: "x", kind: "fuel", date: "2026-01-01" })).status).toBe(400);
  });

  test("attachments: upload to an entry, serve, cascade on delete", async () => {
    const dir = tmpFiles();
    const call = setup(undefined, dir);
    const v = (await call("POST", "/vehicles", { name: "Civic" })).json;
    const e = (await call("POST", "/entries", { vehicle_id: v.id, kind: "service", category: "oil", date: "2026-10-01", total: 300 })).json;
    const pdf = new File(["%PDF-1.4 receipt"], "nota fiscal.pdf", { type: "application/pdf" });
    const a = await call.upload(`entry_id=${e.id}`, pdf);
    expect(a.status).toBe(201);
    expect(a.json).toMatchObject({ vehicle_id: v.id, entry_id: e.id, name: "nota fiscal.pdf", size: 16 });
    expect((await call("GET", "/entries")).json[0].attachment_count).toBe(1);

    const served = await call.raw(`/attachments/${a.json.id}/file`);
    expect(served.headers.get("content-type")).toBe("application/pdf");
    expect(await served.text()).toBe("%PDF-1.4 receipt");

    const exe = await call.upload(`vehicle_id=${v.id}`, new File(["MZ"], "x.exe", { type: "application/x-msdownload" }));
    expect(exe.status).toBe(400);

    await call("DELETE", `/entries/${e.id}`);
    expect((await call("GET", `/attachments?vehicle_id=${v.id}`)).json).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("attachment files accept ?token= when a password is set", async () => {
    const call = setup("secret");
    const { token } = (await call("POST", "/login", { password: "secret" })).json;
    const v = (await call("POST", "/vehicles", { name: "Civic" }, token)).json;
    const doc = new File(["img"], "crlv.png", { type: "image/png" });
    const a = (await call.upload(`vehicle_id=${v.id}`, doc, token)).json;
    expect((await call.raw(`/attachments/${a.id}/file`)).status).toBe(401);
    expect((await call.raw(`/attachments/${a.id}/file?token=${token}`)).status).toBe(200);
    expect((await call.raw(`/vehicles?token=${token}`)).status).toBe(401);
  });
});
