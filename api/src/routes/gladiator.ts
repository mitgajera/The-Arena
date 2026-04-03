import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";

const ROUND_LABELS: Record<number, string> = {
  0: "Round of 128",
  1: "Round of 64",
  2: "Round of 32",
  3: "Round of 16",
  4: "Quarterfinals",
  5: "Semifinals",
  6: "Final",
};

function roundLabel(bracketSize: number, round: number): string {
  const firstRoundSize = bracketSize;
  const sizeAtRound = firstRoundSize >> round;
  if (sizeAtRound === 2)  return "Final";
  if (sizeAtRound === 4)  return "Semifinals";
  if (sizeAtRound === 8)  return "Quarterfinals";
  return `Round of ${sizeAtRound}`;
}

export async function gladiatorRoutes(app: FastifyInstance) {
  // GET /gladiator/bracket?competition_id=1
  app.get<{ Querystring: { competition_id: string } }>(
    "/gladiator/bracket",
    async (req, reply) => {
      const competitionId = parseInt(req.query.competition_id, 10);
      if (isNaN(competitionId)) {
        return reply.code(400).send({ error: "Invalid competition_id" });
      }

      const competition = await db.query.competitions.findFirst({
        where: eq(schema.competitions.id, competitionId),
      });
      if (!competition) return reply.code(404).send({ error: "Competition not found" });

      const slots = await db.query.bracketSlots.findMany({
        where: eq(schema.bracketSlots.competitionId, competitionId),
      });

      const rasMap = new Map<string, number>();
      const allScores = await db.query.rasScores.findMany({
        where: eq(schema.rasScores.competitionId, competitionId),
      });
      for (const s of allScores) rasMap.set(s.wallet, s.ras);

      // Group slots by round
      const roundMap = new Map<number, typeof slots>();
      for (const slot of slots) {
        if (!roundMap.has(slot.round)) roundMap.set(slot.round, []);
        roundMap.get(slot.round)!.push(slot);
      }

      const maxRound = Math.max(...roundMap.keys(), 0);

      const rounds = Array.from(roundMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([round, roundSlots]) => {
          // Pair slots into matches
          const sortedSlots = roundSlots.sort((a, b) => a.slotIndex - b.slotIndex);
          const matches = [];
          for (let i = 0; i < sortedSlots.length; i += 2) {
            const p1 = sortedSlots[i];
            const p2 = sortedSlots[i + 1];
            matches.push({
              slot_index: p1?.slotIndex ?? i,
              p1: p1?.wallet
                ? { wallet: p1.wallet, ras: rasMap.get(p1.wallet) ?? p1.rasAtClose ?? 0 }
                : null,
              p2: p2?.wallet
                ? { wallet: p2.wallet, ras: rasMap.get(p2.wallet) ?? p2.rasAtClose ?? 0 }
                : null,
              winner:
                p1?.status === "complete"
                  ? p1.wallet
                  : p2?.status === "complete"
                  ? p2.wallet
                  : null,
              status:
                p1?.status === "complete" || p2?.status === "complete"
                  ? "complete"
                  : p1?.status === "live"
                  ? "live"
                  : "pending",
              match_start: p1?.matchStart ?? null,
              match_end:   p1?.matchEnd ?? null,
            });
          }

          return {
            round,
            label: roundLabel(competition.bracketSize, round),
            matches,
          };
        });

      reply.send({
        competition_id: competitionId,
        bracket_size: competition.bracketSize,
        current_round: maxRound,
        rounds,
      });
    }
  );

  // GET /gladiator/my-match?competition_id=1&wallet=ABC...
  app.get<{ Querystring: { competition_id: string; wallet: string } }>(
    "/gladiator/my-match",
    async (req, reply) => {
      const competitionId = parseInt(req.query.competition_id, 10);
      const wallet = req.query.wallet;

      if (isNaN(competitionId) || !wallet) {
        return reply.code(400).send({ error: "competition_id and wallet required" });
      }

      // Find the wallet's current live or pending slot
      const slot = await db.query.bracketSlots.findFirst({
        where: (t, { and, eq, or }) =>
          and(
            eq(t.competitionId, competitionId),
            eq(t.wallet, wallet),
            or(eq(t.status, "live"), eq(t.status, "pending"))
          ),
      });

      if (!slot) {
        return reply.code(404).send({
          error: "No active match found for this wallet",
          eliminated: true,
        });
      }

      // Find the opponent slot
      const opponentSlotIndex =
        slot.slotIndex % 2 === 0 ? slot.slotIndex + 1 : slot.slotIndex - 1;
      const opponentSlot = await db.query.bracketSlots.findFirst({
        where: and(
          eq(schema.bracketSlots.competitionId, competitionId),
          eq(schema.bracketSlots.round, slot.round),
          eq(schema.bracketSlots.slotIndex, opponentSlotIndex)
        ),
      });

      const allScores = await db.query.rasScores.findMany({
        where: eq(schema.rasScores.competitionId, competitionId),
      });
      const rasMap = new Map(allScores.map((s) => [s.wallet, s.ras]));

      reply.send({
        round: slot.round,
        slot_index: slot.slotIndex,
        you: { wallet, ras: rasMap.get(wallet) ?? 0 },
        opponent: opponentSlot?.wallet
          ? { wallet: opponentSlot.wallet, ras: rasMap.get(opponentSlot.wallet) ?? 0 }
          : null,
        match_start: slot.matchStart,
        match_end: slot.matchEnd,
        status: slot.status,
      });
    }
  );
}
