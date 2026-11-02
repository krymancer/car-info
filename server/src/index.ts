import { serveStatic } from "hono/bun";
import { createApp } from "./app";
import { FILES_DIR, openDb } from "./db";
import { join } from "node:path";
import { BACKUP_DIR, scheduleDailyBackups } from "./backup";
import { createFiles } from "./files";

const db = openDb();
const app = createApp(db, { password: process.env.APP_PASSWORD || undefined });

// Serve the built PWA; unknown paths fall back to index.html for client-side routing.
const WEB_DIR = process.env.WEB_DIR ?? "../web/dist";
app.use("/*", serveStatic({ root: WEB_DIR }));
app.get("*", serveStatic({ path: `${WEB_DIR}/index.html` }));

const files = createFiles(db, FILES_DIR);
scheduleDailyBackups(db, () => files.mirror(join(BACKUP_DIR, "files")));

const port = Number(process.env.PORT ?? 8080);
console.log(`car-info listening on :${port}`);
export default { port, fetch: app.fetch };
