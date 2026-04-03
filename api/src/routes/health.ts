import { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { db, schema } from "../db";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    try {
      const latest = await db.query.rasScores.findFirst({
        orderBy: [desc(schema.rasScores.computedAt)],
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
