import { connect, onWalletChange, hasWallet } from "../blockchain.js";
import { client } from "./session.js";
import { toast, readableError, withBusy } from "./ui.js";
import { shortAddress } from "./format.js";
import { h, fill } from "./dom.js";

export async function saveWallet(userId, address) {
  const { error } = await client()
    .from("profiles")
    .update({ wallet: address })
    .eq("id", userId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("That wallet is already linked to another account");
    }
    throw error;
  }
}

export function mountWalletCard(root, { userId, wallet }, onChange) {
  if (!root) return;

  let linked = wallet;

  function render() {
    if (!hasWallet()) {
      fill(
        root,
        h("span", { class: "wallet-status wallet-missing" }, "MetaMask not detected"),
        h(
          "a",
          { class: "wallet-link", href: "https://metamask.io/download", target: "_blank", rel: "noreferrer" },
          "Install"
        )
      );
      return;
    }

    if (linked) {
      fill(
        root,
        h("span", { class: "wallet-status wallet-linked" }, shortAddress(linked)),
        h("button", { class: "wallet-btn", type: "button", onClick: link }, "Change")
      );
      return;
    }

    fill(
      root,
      h("span", { class: "wallet-status wallet-unlinked" }, "No wallet linked"),
      h("button", { class: "wallet-btn wallet-btn-primary", type: "button", onClick: link }, "Connect wallet")
    );
  }

  async function link(event) {
    await withBusy(event.currentTarget, "Connecting...", async () => {
      try {
        const address = await connect();
        if (address === linked) {
          toast("Wallet already linked", "info");
          return;
        }

        await saveWallet(userId, address);
        linked = address;
        toast("Wallet linked", "success");
        render();
        onChange?.(address);
      } catch (err) {
        console.error(err);
        toast(readableError(err), "error");
      }
    });
  }

  onWalletChange(() => {
    if (linked) toast("Wallet account changed, reconnect if needed", "info");
  });

  render();
  return { get address() { return linked; } };
}

export function requireLinkedWallet(profile) {
  if (!profile?.wallet) {
    toast("Link your wallet first", "error");
    return false;
  }
  return true;
}
