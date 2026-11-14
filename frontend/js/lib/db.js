import { DATA_API_URL } from "../config.js";
import { authToken } from "./auth.js";

function filterValue(value) {
  if (value === null) return "is.null";
  if (Array.isArray(value)) return `in.(${value.join(",")})`;
  if (typeof value === "object") return `${value.operator}.${value.value}`;
  return `eq.${value}`;
}

async function request(table, options = {}) {
  const {
    method = "GET",
    columns = "*",
    filters = {},
    order,
    body,
    single = false,
    upsert = false,
  } = options;

  const url = new URL(`${DATA_API_URL}/${table}`);
  if (columns) url.searchParams.set("select", columns);
  for (const [column, value] of Object.entries(filters)) {
    url.searchParams.set(column, filterValue(value));
  }
  if (order) url.searchParams.set("order", order);

  const token = await authToken();
  const prefer = ["return=representation"];
  if (upsert) prefer.push("resolution=merge-duplicates");

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: prefer.join(","),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = response.status === 204 ? [] : await response.json().catch(() => null);
  if (!response.ok) throw normalise(payload, response.status);

  return single ? payload?.[0] ?? null : payload ?? [];
}

export function select(table, options) {
  return request(table, options);
}

export function selectOne(table, options) {
  return request(table, { ...options, single: true });
}

export function insert(table, body, options = {}) {
  return request(table, { ...options, method: "POST", body });
}

export function insertOne(table, body, options = {}) {
  return request(table, { ...options, method: "POST", body, single: true });
}

export function update(table, body, filters, options = {}) {
  return request(table, { ...options, method: "PATCH", body, filters });
}

function normalise(payload, status) {
  const message = payload?.message || payload?.details || `Database request failed with status ${status}`;

  if (/roles can only be changed/i.test(message)) return new Error("Only an administrator can change roles");
  if (/only an administrator/i.test(message)) return new Error("Only the ward office can change this");
  if (/only the assigned contractor/i.test(message)) return new Error("Only the assigned contractor can post updates");
  if (/duplicate key/i.test(message) && /wallet/i.test(message)) return new Error("That wallet is already linked to another account");
  if (/row-level security|permission denied/i.test(message)) return new Error("You do not have permission to do that");
  if (status === 401 || /JWT|token|authentication/i.test(message)) return new Error("Your session expired, sign in again");

  return new Error(message);
}
