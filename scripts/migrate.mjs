// Applies database migrations from ./drizzle. Runs on every deploy (safe to re-run).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const ssl = /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined;
const pool = new pg.Pool({ connectionString: url, ssl, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("✓ Database migrations applied");
