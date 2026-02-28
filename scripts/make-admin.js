import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_OWNER_URL;

if (!url) {
  console.error("DATABASE_OWNER_URL is not set. Put the neondb_owner string in .env first.");
  process.exit(1);
}

const sql = neon(url);
const target = process.argv[2];

const people = await sql`
  select id, full_name, locality, is_contractor, is_admin
  from profiles
  order by is_admin desc, full_name asc
`;

if (!people.length) {
  console.log("No profiles yet.");
  console.log("Sign up in the app first — the profile row is created on first sign-in.");
  process.exit(0);
}

if (!target) {
  console.log("Accounts in this database:\n");
  for (const p of people) {
    const flags = [p.is_admin && "ADMIN", p.is_contractor && "contractor"].filter(Boolean).join(", ");
    console.log(`  ${p.full_name}${flags ? `  [${flags}]` : ""}`);
    console.log(`    ${p.id}  ${p.locality ?? "no sector"}\n`);
  }
  console.log('Promote one with:  npm run make-admin -- "Your Name"');
  console.log("or with the user id shown above.");
  process.exit(0);
}

const needle = target.toLowerCase();
const matches = people.filter(
  (p) => p.id.toLowerCase() === needle || (p.full_name ?? "").toLowerCase().includes(needle)
);

if (!matches.length) {
  console.error(`No account matched "${target}". Run without arguments to list them.`);
  process.exit(1);
}

if (matches.length > 1) {
  console.error(`"${target}" matched ${matches.length} accounts. Use the full user id instead:`);
  for (const p of matches) console.error(`  ${p.full_name}  ${p.id}`);
  process.exit(1);
}

const [person] = matches;

if (person.is_admin) {
  console.log(`${person.full_name} is already an admin.`);
  process.exit(0);
}

await sql`update profiles set is_admin = true where id = ${person.id}`;

console.log(`${person.full_name} is now the ward office admin.`);
console.log("They can open admin.html to run voting rounds, fund escrows and settle work.");
