import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../indexer/src/schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/arena",
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
