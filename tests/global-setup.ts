import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh throwaway SQLite file for every test run.
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) rmSync(`prisma/${f}`, { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "ignore",
  });
}
