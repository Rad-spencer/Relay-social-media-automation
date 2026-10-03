import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { providerStatuses } from "../src/server/oauth/providers.js";
if (existsSync(".env")) loadEnvFile(".env");
const origin = process.env.APP_URL || "http://localhost:3000";
try {
  for (const provider of providerStatuses(origin)) {
    console.log(
      `${provider.name}: ${provider.enabled ? "Ready for provider login (app approval still required)" : "Setup incomplete"}`,
    );
    for (const issue of provider.setupIssues || []) console.log(`  - ${issue}`);
    console.log(`  Callback: ${provider.callbackUrl}`);
  }
} catch {
  console.error(
    "APP_URL must be a valid app address. Configuration values have not been printed.",
  );
  process.exitCode = 1;
}
