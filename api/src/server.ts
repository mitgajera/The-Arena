import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { squadRoutes } from "./routes/squads";
import { scoreRoutes } from "./routes/scores";
import { gladiatorRoutes } from "./routes/gladiator";
import { healthRoutes } from "./routes/health";

const PORT = parseInt(process.env.API_PORT ?? "3001", 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000,https://app.adrena.xyz")
  .split(",")
  .map((o) => o.trim());

async function build() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: CORS_ORIGINS });
  await app.register(sensible);

  // All routes under /api/v1/
  await app.register(
    async (v1) => {
      await v1.register(squadRoutes);
      await v1.register(scoreRoutes);
      await v1.register(gladiatorRoutes);
      await v1.register(healthRoutes);
    },
    { prefix: "/api/v1" }
  );

  return app;
}

async function main() {
  const app = await build();

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[Arena API] Listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
