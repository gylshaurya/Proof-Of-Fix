export const CLERK_PUBLISHABLE_KEY = "pk_test_bWFueS13aGlwcGV0LTk4LmNsZXJrLmFjY291bnRzLmRldiQ";

export const DATA_API_URL = "https://ep-muddy-dream-azv15q0i.apirest.c-3.ap-southeast-1.aws.neon.tech/neondb/rest/v1";

export const BLOB_UPLOAD_ENDPOINT = "/api/upload";

export const VOTING_ADDRESS = "0x712a93e2d1a1d8c6e7b8067e32a820c44a0d5572";
export const TREASURY_ADDRESS = "0xd1320ebe840f42956d3aa3d0edd2b02b9bb92a40";
export const DEPLOY_BLOCK = 11615160;

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
