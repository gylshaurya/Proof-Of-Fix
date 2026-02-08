import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { CHAIN, TREASURY_ADDRESS, VOTING_ADDRESS, INR_PER_ETH } from "./config.js";
import VotingABI from "./abis/VotingABI.js";
import TreasuryABI from "./abis/TreasuryABI.js";

export { ethers };

export function hasWallet() {
  return Boolean(window.ethereum);
}

function requireWallet() {
  if (!hasWallet()) {
    throw new Error("MetaMask is not installed. Install it to continue.");
  }
}

export function readProvider() {
  if (hasWallet()) return new ethers.providers.Web3Provider(window.ethereum, "any");
  return new ethers.providers.JsonRpcProvider(CHAIN.rpcUrls[0], CHAIN.id);
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN.hexId }],
    });
  } catch (err) {
    if (err.code !== 4902) throw err;

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN.hexId,
          chainName: CHAIN.name,
          rpcUrls: CHAIN.rpcUrls,
          nativeCurrency: CHAIN.nativeCurrency,
          blockExplorerUrls: [CHAIN.explorer],
        },
      ],
    });
  }
}

export async function currentAddress() {
  if (!hasWallet()) return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts.length ? ethers.utils.getAddress(accounts[0]) : null;
}

export async function connect() {
  requireWallet();

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("No wallet account available");

  const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  const network = await provider.getNetwork();

  if (network.chainId !== CHAIN.id) {
    await switchNetwork();
  }

  return ethers.utils.getAddress(accounts[0]);
}

async function signer() {
  await connect();
  return new ethers.providers.Web3Provider(window.ethereum, "any").getSigner();
}

export async function getVotingContract() {
  return new ethers.Contract(VOTING_ADDRESS, VotingABI, await signer());
}

export async function getTreasuryContract() {
  return new ethers.Contract(TREASURY_ADDRESS, TreasuryABI, await signer());
}

export function readVotingContract() {
  return new ethers.Contract(VOTING_ADDRESS, VotingABI, readProvider());
}

export function readTreasuryContract() {
  return new ethers.Contract(TREASURY_ADDRESS, TreasuryABI, readProvider());
}

export function toChainId(uuid) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(String(uuid)));
}

export function inrToWei(amountInr) {
  const paise = Math.round(Number(amountInr) * 100);
  if (!Number.isFinite(paise) || paise <= 0) {
    throw new Error("Invalid cost amount");
  }
  return ethers.utils.parseEther("1").mul(paise).div(INR_PER_ETH * 100);
}

export function weiToInr(wei) {
  return Number(ethers.utils.formatEther(wei)) * INR_PER_ETH;
}

export function txUrl(hash) {
  return `${CHAIN.explorer}/tx/${hash}`;
}

export function addressUrl(address) {
  return `${CHAIN.explorer}/address/${address}`;
}

export function onWalletChange(handler) {
  if (!hasWallet()) return;
  window.ethereum.on("accountsChanged", handler);
  window.ethereum.on("chainChanged", handler);
}
