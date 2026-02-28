import fs from "node:fs";
import path from "node:path";

const CHAIN_ID = process.argv[2] || "11155111";
const runFile = path.join("broadcast", "Deploy.s.sol", CHAIN_ID, "run-latest.json");

if (!fs.existsSync(runFile)) {
  console.error(`No broadcast found at ${runFile}`);
  console.error("Deploy first: forge script script/Deploy.s.sol --rpc-url sepolia --broadcast");
  process.exit(1);
}

const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
const deployed = {};

for (const tx of run.transactions) {
  if (tx.transactionType === "CREATE") deployed[tx.contractName] = tx.contractAddress;
}

if (!deployed.Voting || !deployed.Treasury) {
  console.error("Could not find both contract addresses in the broadcast file");
  process.exit(1);
}

const block = Number(run.receipts?.[0]?.blockNumber ?? 0);

const configPath = path.join("frontend", "js", "config.js");
let config = fs.readFileSync(configPath, "utf8");

config = config
  .replace(/export const VOTING_ADDRESS = "[^"]*"/, `export const VOTING_ADDRESS = "${deployed.Voting}"`)
  .replace(/export const TREASURY_ADDRESS = "[^"]*"/, `export const TREASURY_ADDRESS = "${deployed.Treasury}"`)
  .replace(/export const DEPLOY_BLOCK = \d+/, `export const DEPLOY_BLOCK = ${block}`);

fs.writeFileSync(configPath, config);

for (const name of ["Voting", "Treasury"]) {
  const artifact = JSON.parse(fs.readFileSync(path.join("out", `${name}.sol`, `${name}.json`), "utf8"));
  const body = `const ${name}ABI = ${JSON.stringify(artifact.abi, null, 2)};\n\nexport default ${name}ABI;\n`;
  fs.writeFileSync(path.join("frontend", "js", "abis", `${name}ABI.js`), body);
}

console.log(`Voting    ${deployed.Voting}`);
console.log(`Treasury  ${deployed.Treasury}`);
console.log(`Block     ${block}`);
console.log("Updated frontend/js/config.js and regenerated both ABIs");
