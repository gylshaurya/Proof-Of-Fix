export const VOTING_ADDRESS = "0x7bF485f40de66c9a891bf38246981cb4dFB136ee";
export const TREASURY_ADDRESS = "0xF8924422c65342c7541e8A767D4E6926473E92AF";
export const DEPLOY_BLOCK = 10133869;

export const INR_PER_ETH = 200000;

export const CHAIN = {
  id: 11155111,
  hexId: "0xaa36a7",
  name: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
};

export const LOCALITIES = [
  "Sector 1",
  "Sector 2",
  "Sector 3",
  "Sector 4",
  "Sector 5",
];

export const STATUS = {
  DRAFT: 0,
  VOTING: 1,
  UNDER_PROGRESS: 2,
  COMPLETION_VOTING: 3,
  COMPLETED: 4,
  FAILED: 5,
};

export const PHASE = {
  INITIAL_VOTING: 0,
  UNDER_PROGRESS: 1,
  COMPLETION_VOTING: 2,
  COMPLETED: 3,
  FAILED: 4,
};

export const STATUS_LABEL = {
  0: "Draft",
  1: "Voting Open",
  2: "Under Progress",
  3: "Completion Voting",
  4: "Completed",
  5: "Failed",
};
