import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_OWNER_URL;

if (!url) {
  console.error("Set DATABASE_OWNER_URL to the neondb_owner connection string first.");
  process.exit(1);
}

const sql = neon(url);

const ISSUES = [
  {
    locality: "Sector 1",
    title: "Pothole cluster on the school approach road",
    description:
      "Six deep potholes between the bus stop and the primary school gate. Two-wheelers swerve into oncoming traffic to avoid them and it is worst during drop-off hours.",
    cost: 85000,
    status_code: 1,
    vote_count: 34,
  },
  {
    locality: "Sector 1",
    title: "Overflowing bins behind the vegetable market",
    description:
      "The three community bins have not been cleared in over a week. Waste is spilling onto the footpath and stray dogs have started scattering it across the lane.",
    cost: 42000,
    status_code: 1,
    vote_count: 21,
  },
  {
    locality: "Sector 1",
    title: "Streetlights dead along the park boundary",
    description:
      "Eleven poles between the park gate and the water tank have been dark for a month. Residents avoid the stretch after sunset.",
    cost: 128000,
    status_code: 0,
  },
  {
    locality: "Sector 2",
    title: "Drain collapse near Ward 4 market",
    description:
      "The covered drain has caved in over roughly four metres. Sewage backs into the market lane after any rain and two shops have had water enter their storerooms.",
    cost: 240000,
    status_code: 3,
    vote_count: 57,
    assigned: true,
  },
  {
    locality: "Sector 2",
    title: "Waterlogging at the sector entrance",
    description:
      "Standing water half a foot deep after every shower. The stormwater inlet is choked with silt and construction debris that was never cleared.",
    cost: 95000,
    status_code: 1,
    vote_count: 29,
  },
  {
    locality: "Sector 2",
    title: "Broken footpath slabs outside the clinic",
    description:
      "A dozen slabs are cracked or missing entirely. Patients using walkers have to step onto the road to get around the gap.",
    cost: 56000,
    status_code: 0,
  },
  {
    locality: "Sector 3",
    title: "Traffic signal dead at the main crossing",
    description:
      "The signal has been out for two weeks. The crossing carries school traffic in the morning and there has been at least one near miss reported every day.",
    cost: 175000,
    status_code: 2,
    vote_count: 61,
    assigned: true,
  },
  {
    locality: "Sector 3",
    title: "Garbage burning at the empty plot",
    description:
      "Waste is being set alight most evenings on the vacant plot behind the row houses. The smoke sits low over the lane and residents with asthma are affected.",
    cost: 38000,
    status_code: 1,
    vote_count: 18,
  },
  {
    locality: "Sector 4",
    title: "Fallen tree blocking the service lane",
    description:
      "A gulmohar came down in the last storm and still blocks the service lane completely. Delivery vehicles and the garbage truck cannot get through.",
    cost: 64000,
    status_code: 4,
    vote_count: 44,
    assigned: true,
  },
  {
    locality: "Sector 4",
    title: "Open manhole near the community hall",
    description:
      "The cover has been missing for several days. It has been marked with a branch by residents but nothing more, and it sits directly on the walking route to the hall.",
    cost: 22000,
    status_code: 1,
    vote_count: 39,
  },
  {
    locality: "Sector 4",
    title: "Sewage overflow behind the housing block",
    description:
      "The line has been backing up for a fortnight. The smell reaches the first-floor flats and the ground floor units have stopped using their rear windows.",
    cost: 145000,
    status_code: 0,
  },
  {
    locality: "Sector 5",
    title: "Road edge washed away near the culvert",
    description:
      "About twenty metres of the shoulder has eroded, leaving a drop of nearly a foot. It is unlit and there is no barrier of any kind.",
    cost: 210000,
    status_code: 1,
    vote_count: 47,
  },
  {
    locality: "Sector 5",
    title: "Water supply line leaking at the junction",
    description:
      "A continuous leak at the junction valve has been running for three weeks. Pressure in the surrounding blocks has dropped noticeably.",
    cost: 78000,
    status_code: 1,
    vote_count: 26,
  },
  {
    locality: "Sector 5",
    title: "Illegal dumping at the canal bank",
    description:
      "Construction debris is being tipped along the canal bank overnight. The pile has grown enough to narrow the walking path to a single file.",
    cost: 52000,
    status_code: 5,
    vote_count: 15,
    assigned: true,
  },
];

const STATUS_LABEL = {
  0: "Draft",
  1: "Voting Open",
  2: "Under Progress",
  3: "Completion Voting",
  4: "Completed",
  5: "Failed",
};

async function main() {
  const [{ count }] = await sql`select count(*)::int as count from problems where is_demo = true`;

  if (count > 0) {
    console.log(`Clearing ${count} existing demo rows`);
    await sql`delete from problems where is_demo = true`;
  }

  for (const issue of ISSUES) {
    await sql`
      insert into problems (
        title, description, locality, cost, status, status_code,
        vote_count, assigned, advance_paid, is_demo, created_at
      )
      values (
        ${issue.title},
        ${issue.description},
        ${issue.locality},
        ${issue.cost},
        ${STATUS_LABEL[issue.status_code ?? 0]},
        ${issue.status_code ?? 0},
        ${issue.vote_count ?? 0},
        ${issue.assigned ?? false},
        ${issue.assigned ? issue.cost / 2 : null},
        true,
        now() - (random() * interval '21 days')
      )
    `;
  }

  const [{ total }] = await sql`select count(*)::int as total from problems where is_demo = true`;
  console.log(`Seeded ${total} demo issues across 5 sectors.`);
  console.log("Every row is flagged is_demo = true and shows a Demo badge in the app.");
  console.log("Remove them any time with: delete from problems where is_demo = true;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
