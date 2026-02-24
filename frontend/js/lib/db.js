import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.4";
import { DATABASE_URL } from "../config.js";
import { authToken } from "./auth.js";

let client = null;

function connection() {
  if (!client) {
    client = neon(DATABASE_URL, { authToken });
  }
  return client;
}

export async function sql(strings, ...values) {
  try {
    return await connection()(strings, ...values);
  } catch (err) {
    console.error("query failed", err);
    throw normalise(err);
  }
}

export async function one(strings, ...values) {
  const rows = await sql(strings, ...values);
  return rows[0] ?? null;
}

function normalise(err) {
  const message = err?.message ?? "";

  if (/roles can only be changed/i.test(message)) {
    return new Error("Only an administrator can change roles");
  }
  if (/only an administrator/i.test(message)) {
    return new Error("Only the ward office can change this");
  }
  if (/only the assigned contractor/i.test(message)) {
    return new Error("Only the assigned contractor can post updates");
  }
  if (/duplicate key/i.test(message) && /wallet/i.test(message)) {
    return new Error("That wallet is already linked to another account");
  }
  if (/violates row-level security/i.test(message)) {
    return new Error("You do not have permission to do that");
  }
  if (/JWT|token|authentication/i.test(message)) {
    return new Error("Your session expired, sign in again");
  }

  return err instanceof Error ? err : new Error(String(err));
}
