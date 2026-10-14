// Applies database migrations (prisma migrate deploy) during the Vercel build.
//
// Picks the first valid PostgreSQL connection string from:
//   1. DIRECT_URL        (optional – a non-pooled URL, best for migrations)
//   2. DATABASE_URL
//   3. POSTGRES_URL / POSTGRES_URL_NON_POOLING (set by Vercel Postgres / Neon / Prisma Postgres integrations)
// Values are tidied first (surrounding quotes, a pasted "NAME=" prefix, whitespace), because
// those are the most common copy/paste mistakes when adding environment variables.
//
// NOTE: PRISMA_DATABASE_URL (prisma+postgres://…) is an Accelerate URL and is deliberately ignored.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function tidy(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, ""); // "DATABASE_URL=postgres://…"
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim(); // "postgres://…"
  return s;
}

const isPostgres = (s) => /^postgres(ql)?:\/\//i.test(s);
const describe = (raw) => {
  if (!raw) return "not set";
  const t = tidy(raw);
  const scheme = /^([a-z+]+):\/\//i.exec(t)?.[1];
  return scheme ? `starts with "${scheme}://"` : `does not look like a URL (starts with "${t.slice(0, 12)}…")`;
};

const names = ["DIRECT_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_URL"];
let chosen = null;
for (const name of names) {
  const value = tidy(process.env[name]);
  if (isPostgres(value)) {
    chosen = { name, value };
    break;
  }
}

if (!chosen) {
  console.error("\n✖ No valid PostgreSQL connection string found for the database migration.\n");
  for (const name of names) console.error(`  ${name.padEnd(26)} ${describe(process.env[name])}`);
  console.error(
    "\nSet DATABASE_URL in Vercel (Project → Settings → Environment Variables) to a URL that starts with\n" +
      "postgres:// or postgresql:// — no quotes, no spaces, and without a leading 'DATABASE_URL='.\n" +
      "(A prisma+postgres:// URL, e.g. PRISMA_DATABASE_URL, cannot be used here.)\n",
  );
  process.exit(1);
}

console.log(`Running migrations using ${chosen.name}…`);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: chosen.value },
});
process.exit(result.status ?? 1);
