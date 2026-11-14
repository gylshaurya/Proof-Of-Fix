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
  order by full_name asc
`;

if (!people.length) {
  console.log("No profiles yet. The person must sign up and open the app first.");
  process.exit(0);
}

if (!target) {
  for (const person of people) {
    const role = person.is_admin ? "admin" : person.is_contractor ? "contractor" : "resident";
    console.log(`${person.full_name}  [${role}]`);
    console.log(`  ${person.id}`);
  }
  console.log('\nPromote one with: npm run make-contractor -- "Name or user id"');
  process.exit(0);
}

const needle = target.toLowerCase();
const matches = people.filter(
  (person) => person.id.toLowerCase() === needle || person.full_name.toLowerCase().includes(needle)
);

if (matches.length !== 1) {
  console.error(matches.length ? `"${target}" matched more than one account. Use the full user id.` : `No account matched "${target}".`);
  process.exit(1);
}

const [person] = matches;
await sql`update profiles set is_contractor = true where id = ${person.id}`;
console.log(`${person.full_name} is now a contractor.`);
