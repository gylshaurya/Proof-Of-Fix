import { loadChain, hasWallet } from "./chain.js";
import { update } from "./db.js";
import { toast, readableError, withBusy } from "./ui.js";
import { shortAddress } from "./format.js";
import { h, fill } from "./dom.js";

export async function saveWallet(userId, address) {
  await update("profiles", { wallet: address }, { id: userId });
}

export function mountWalletCard(root, { userId, wallet }, onChange) {
  if (!root) return;

  let linked = wallet;

  function render() {
    if (!hasWallet()) {
      root.dataset.state = "missing";
      fill(
        root,
        h(
          "a",
          { class: "wallet-btn", href: "https://metamask.io/download", target: "_blank", rel: "noreferrer" },
          "Install MetaMask"
        )
      );
      return;
    }

    if (linked) {
      root.dataset.state = "linked";
      fill(
        root,
        h(
          "button",
          { class: "wallet-btn wallet-btn-linked", type: "button", title: `Linked wallet ${linked}. Click to change.`, onClick: link },
          h("span", { class: "wallet-dot", "aria-hidden": "true" }),
          h("span", { class: "addr" }, shortAddress(linked))
        )
      );
      return;
    }

    root.dataset.state = "unlinked";
    fill(
      root,
      h("button", { class: "wallet-btn wallet-btn-primary", type: "button", onClick: link }, "Connect wallet")
    );
  }

  async function link(event) {
    await withBusy(event.currentTarget, "Connecting...", async () => {
      try {
        const { connect } = await loadChain();
        const address = await connect();
        if (linked && address.toLowerCase() === linked.toLowerCase()) {
          toast("This wallet is already linked. Switch accounts in MetaMask to change it.", "info");
          return;
        }

        await saveWallet(userId, address);
        linked = address;
        toast("Wallet linked", "success");
        onChange?.(address);
      } catch (err) {
        console.error(err);
        toast(readableError(err), "error");
      }
    });
    render();
  }

  if (hasWallet() && window.ethereum.on) {
    window.ethereum.on("accountsChanged", () => {
      if (linked) toast("MetaMask account changed. Use the wallet button to relink if needed.", "info");
    });
  }

  render();
  return { get address() { return linked; } };
}
