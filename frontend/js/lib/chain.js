// ethers is ~400KB from a CDN. Pages import it through here so it downloads in
// the background instead of blocking the session and database requests.
let promise = null;

export function loadChain() {
  if (!promise) promise = import("../blockchain.js");
  return promise;
}

export function hasWallet() {
  return Boolean(window.ethereum);
}
