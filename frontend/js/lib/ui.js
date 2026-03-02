import { h } from "./dom.js";

let stack = null;

function container() {
  if (!stack) {
    stack = h("div", { class: "toast-stack" });
    document.body.append(stack);
  }
  return stack;
}

export function toast(message, type = "info", timeout = 4500) {
  const node = h("div", { class: `toast toast-${type}`, role: "status" }, message);
  container().append(node);

  requestAnimationFrame(() => node.classList.add("toast-in"));

  const remove = () => {
    node.classList.remove("toast-in");
    setTimeout(() => node.remove(), 200);
  };

  const timer = setTimeout(remove, timeout);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });

  return node;
}

export function readableError(err) {
  if (!err) return "Something went wrong";

  const code = err.code ?? err.error?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return "Transaction rejected in your wallet";
  if (code === -32002) return "Check MetaMask, a request is already waiting";
  if (code === "INSUFFICIENT_FUNDS") return "Not enough ETH to cover gas";

  const reason =
    err.reason ||
    err.data?.message ||
    err.error?.data?.message ||
    err.error?.message ||
    err.message;

  if (!reason) return "Something went wrong";

  const revert = /reverted with reason string ['"](.+?)['"]/.exec(reason);
  if (revert) return revert[1];

  if (reason.length > 140) return reason.slice(0, 140) + "...";
  return reason;
}

export async function withBusy(button, busyLabel, fn) {
  if (!button || button.disabled) return;

  const original = button.textContent;
  button.disabled = true;
  button.dataset.busy = "true";
  if (busyLabel) button.textContent = busyLabel;

  try {
    return await fn();
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    button.textContent = original;
  }
}

export function confirmAction(message) {
  return window.confirm(message);
}

export function skeleton(count = 3, height = 168) {
  return Array.from({ length: count }, () =>
    h("div", { class: "skeleton", style: { height: `${height}px` } })
  );
}

export function emptyState(title, detail) {
  return h(
    "div",
    { class: "empty" },
    h("p", { class: "empty-title" }, title),
    detail ? h("p", { class: "empty-detail" }, detail) : null
  );
}

export function fatalError(title, detail, { onSignOut } = {}) {
  const main = document.querySelector("main") || document.body;

  const card = h(
    "div",
    { class: "fatal" },
    h("h2", null, title),
    detail ? h("pre", { class: "fatal-detail" }, detail) : null,
    h(
      "div",
      { class: "fatal-actions" },
      h("button", { class: "btn", onClick: () => window.location.reload() }, "Retry"),
      onSignOut
        ? h("button", { class: "btn btn-ghost", onClick: onSignOut }, "Sign out")
        : null
    )
  );

  main.replaceChildren(card);
  return card;
}
