import { FastifyInstance } from "fastify";
import { db, schema } from "../../src/db";
import { desc } from "drizzle-orm";

// Shared DB client — re-exported from indexer schema for API use
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../../../indexer/src/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/arena",
});
export const apiDb = drizzle(pool, { schema: s });

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    try {
      // Measure indexer lag by checking the latest computed_at timestamp
      const latest = await apiDb.query.rasScores.findFirst({
        orderBy: [desc(s.rasScores.computedAt)],
      });

      const lagSeconds = latest?.computedAt
        ? Math.floor((Date.now() - new Date(latest.computedAt).getTime()) / 1000)
        : null;

      reply.send({ status: "ok", indexer_lag_seconds: lagSeconds });
    } catch {
      reply.code(503).send({ status: "degraded" });
    }
  });
}
