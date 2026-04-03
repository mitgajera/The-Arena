import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../db";

export async function squadRoutes(app: FastifyInstance) {
  // GET /squads?competition_id=1&tier=gold&limit=50&offset=0
  app.get<{
    Querystring: {
      competition_id: string;
      tier?: string;
      limit?: string;
      offset?: string;
    };
  }>("/squads", async (req, reply) => {
    const competitionId = parseInt(req.query.competition_id, 10);
    const tier = req.query.tier;
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = parseInt(req.query.offset ?? "0", 10);

    if (isNaN(competitionId)) {
      return reply.code(400).send({ error: "Invalid competition_id" });
    }

    const filters = [eq(schema.squads.competitionId, competitionId)];
    if (tier) filters.push(eq(schema.squads.tier, tier));

    const squads = await db.query.squads.findMany({
      where: and(...filters),
      orderBy: [desc(schema.squads.rasScore)],
      limit,
      offset,
      with: { memberships: true } as Record<string, unknown>,
    });

    const allScores = await db.query.rasScores.findMany({
      where: eq(schema.rasScores.competitionId, competitionId),
    });

    const scoreMap = new Map(allScores.map((s) => [s.wallet, s.ras]));

    const ranked = squads.map((squad, i) => {
      const members = (
        squad as unknown as { memberships: Array<{ wallet: string; joinedAt: Date | null }> }
      ).memberships.map((m) => ({
        wallet: m.wallet,
        ras: scoreMap.get(m.wallet) ?? 0,
        joinedAt: m.joinedAt ? Math.floor(new Date(m.joinedAt).getTime() / 1000) : null,
      }));

      return {
        rank: offset + i + 1,
        name: squad.name,
        creator: squad.creatorWallet,
        onchainPubkey: squad.onchainPubkey,
        members,
        squadRas: squad.rasScore ?? 0,
        tier: squad.tier,
        prizeEstimate: estimatePrize(squad.rasScore ?? 0, squad.tier),
      };
    });

    reply.send({ competition_id: competitionId, tier: tier ?? null, squads: ranked, total: ranked.length });
  });

  // GET /squads/:onchain_pubkey
  app.get<{ Params: { onchain_pubkey: string } }>(
    "/squads/:onchain_pubkey",
    async (req, reply) => {
      const squad = await db.query.squads.findFirst({
        where: eq(schema.squads.onchainPubkey, req.params.onchain_pubkey),
        with: { memberships: true } as Record<string, unknown>,
      });

      if (!squad) return reply.code(404).send({ error: "Squad not found" });

      const memberships = (
        squad as unknown as { memberships: Array<{ wallet: string; joinedAt: Date | null; rasContribution: number | null }> }
      ).memberships;

      reply.send({
        ...squad,
        members: memberships.map((m) => ({
          wallet: m.wallet,
          rasContribution: m.rasContribution ?? 0,
          joinedAt: m.joinedAt ? Math.floor(new Date(m.joinedAt).getTime() / 1000) : null,
        })),
      });
    }
  );

  // POST /squads/create — returns unsigned transaction for client to sign
  app.post<{ Body: { name: string; competition_id: number; wallet: string } }>(
    "/squads/create",
    async (req, reply) => {
      const { name, competition_id, wallet } = req.body;

      if (!name || name.length > 32) {
        return reply.code(400).send({ error: "Name must be 1–32 characters" });
      }
      if (!wallet) {
        return reply.code(400).send({ error: "wallet required" });
      }

      // In production: build + serialize an unsigned Anchor tx and return base64.
      // The frontend wallet adapter will sign + send it.
      // Here we return the instruction params so the frontend SDK can build the tx.
      reply.send({
        message: "Build and sign this transaction with your wallet",
        instruction: "create_squad",
        params: { competition_id, name, wallet },
        // base64_tx: "<unsigned serialized tx>" — add once program is deployed
      });
    }
  );
}

function estimatePrize(rasScore: number, tier: string): string {
  // Placeholder formula — replace with actual prize pool data once live
  const tierBase: Record<string, number> = {
    diamond: 5000,
    gold: 1500,
    silver: 400,
    bronze: 50,
  };
  const base = tierBase[tier] ?? 0;
  return `~${Math.round(base * Math.min(rasScore / 100, 2))} USDC`;
}
