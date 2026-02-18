const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function rupees(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return inr.format(amount);
}

export function shortAddress(address) {
  if (!address || address.length < 10) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function shortHash(hash) {
  if (!hash) return "-";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function ethAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  if (amount === 0) return "0";
  if (amount < 0.0001) return amount.toExponential(2);
  return amount.toFixed(4).replace(/\.?0+$/, "");
}

export function timeLeft(deadlineSeconds) {
  const remaining = Number(deadlineSeconds) * 1000 - Date.now();
  if (remaining <= 0) return "closed";

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}

export function relativeTime(isoString) {
  if (!isoString) return "";

  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(isoString).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
