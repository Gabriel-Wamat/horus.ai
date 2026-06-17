import "dotenv/config";
import { resolve } from "node:path";
import { createRepositories } from "../repositories/createRepositories.js";
import { loadRuntimeConfig } from "../config/runtimeConfig.js";
import { JsonDataSeedService } from "./JsonDataSeedService.js";

const dryRun =
  process.argv.includes("--dry-run") || process.env["HORUS_SEED_DRY_RUN"] === "1";
const runtimeConfig = loadRuntimeConfig(process.env);
const sourceDataDir = resolve(
  process.env["HORUS_SEED_DATA_DIR"]?.trim() ||
    `${runtimeConfig.repositoryRoot}/data`
);

const service = new JsonDataSeedService({
  sourceDataDir,
  targetDataDir: runtimeConfig.paths.dataDir,
  repositoryRoot: runtimeConfig.repositoryRoot,
});

if (dryRun) {
  const summary = await service.inspect();
  console.log(
    `[db:seed] Dry run from ${sourceDataDir} into ${runtimeConfig.persistenceDriver}.`
  );
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const repositories = await createRepositories(process.env, runtimeConfig);
try {
  const summary = await service.seed(repositories);
  console.log(
    `[db:seed] Imported JSON seed data from ${sourceDataDir} into ${runtimeConfig.persistenceDriver}.`
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await repositories.pool?.end();
}
