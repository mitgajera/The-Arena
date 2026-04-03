import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";

export async function scoreRoutes(app: FastifyInstance) {
  // GET /scores?competition_id=1&wallet=ABC...
  app.get<{
    Querystring: { competition_id: string; wallet: string };
  }>("/scores", async (req, reply) => {
    const competitionId = parseInt(req.query.competition_id, 10);
    const wallet = req.query.wallet;

    if (isNaN(competitionId) || !wallet) {
      return reply.code(400).send({ error: "competition_id and wallet required" });
    }

    const score = await db.query.rasScores.findFirst({
      where: and(
        eq(schema.rasScores.competitionId, competitionId),
        eq(schema.rasScores.wallet, wallet)
      ),
    });

    if (!score) {
      return reply.code(404).send({ error: "Score not found — wallet may not have traded yet" });
    }

    // Rank = count of wallets with higher RAS + 1
    const allScores = await db.query.rasScores.findMany({
      where: eq(schema.rasScores.competitionId, competitionId),
    });
    const rank = allScores.filter((s) => s.ras > (score.ras ?? 0)).length + 1;
    const total = allScores.filter((s) => s.eligible).length;

    reply.send({
      wallet,
      competition_id: competitionId,
      ras: score.ras,
      pnl_pct: score.pnlPct,
      trade_count: score.tradeCount,
      streak_days: score.streakDays,
      max_drawdown_pct: score.maxDrawdownPct,
      eligible: score.eligible,
      ineligibility_reason: score.ineligibilityReason,
      rank,
      total_eligible: total,
      percentile: total > 0 ? Math.round(((total - rank) / total) * 100) : null,
      computed_at: score.computedAt,
    });
  });
}
