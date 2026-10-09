import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) console.warn("⚠️  DATABASE_URL is not set");

// Neon / most hosted Postgres require SSL; local Postgres usually doesn't.
const needsSsl = !!connectionString && /sslmode=require|neon\.tech/.test(connectionString);

export const pool =
  globalForDb.pool ??
  new Pool({ connectionString, max: 5, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
