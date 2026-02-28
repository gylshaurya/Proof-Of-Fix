import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_OWNER_URL;

if (!url) {
  console.error("DATABASE_OWNER_URL is not set.");
  console.error("Put the neondb_owner connection string in .env, then run npm run db:push");
  process.exit(1);
}

if (url.includes("authenticated@")) {
  console.error("That looks like the 'authenticated' connection string.");
  console.error("db:push needs the neondb_owner string, which has the password in it.");
  process.exit(1);
}

const sql = neon(url);
const source = fs.readFileSync("neon/schema.sql", "utf8");

function raw(text) {
  const strings = [text];
  strings.raw = [text];
  return sql(strings);
}

const statements = splitStatements(source);
console.log(`Applying ${statements.length} statements from neon/schema.sql`);

let applied = 0;

for (const statement of statements) {
  try {
    await raw(statement);
    applied++;
  } catch (err) {
    console.error(`\nFailed on:\n${statement.slice(0, 220)}\n`);
    console.error(err.message);
    process.exit(1);
  }
}

console.log(`Applied ${applied} statements.`);

const [{ count: profiles }] = await sql`select count(*)::int as count from profiles`;
const [{ count: problems }] = await sql`select count(*)::int as count from problems`;
const roles = await sql`select rolname from pg_roles where rolname in ('authenticated', 'anonymous')`;

console.log(`profiles: ${profiles} rows, problems: ${problems} rows`);
console.log(`roles present: ${roles.map((r) => r.rolname).join(", ") || "none"}`);

function splitStatements(text) {
  const out = [];
  let current = "";
  let dollar = false;

  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("--")) continue;

    const markers = (line.match(/\$\$/g) || []).length;
    if (markers % 2 === 1) dollar = !dollar;

    current += line + "\n";

    if (!dollar && stripped.endsWith(";")) {
      const statement = current.trim();
      if (statement) out.push(statement);
      current = "";
    }
  }

  if (current.trim()) out.push(current.trim());
  return out;
}
