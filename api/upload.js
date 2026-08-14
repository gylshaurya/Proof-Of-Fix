import { put } from "@vercel/blob";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

let jwks = null;

function keySet() {
  if (!jwks) {
    if (!process.env.CLERK_ISSUER) {
      throw new Error("CLERK_ISSUER is not set on this deployment");
    }
    jwks = createRemoteJWKSet(new URL(`${process.env.CLERK_ISSUER}/.well-known/jwks.json`));
  }
  return jwks;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("too large");
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).send("Missing token");
    return;
  }

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, keySet(), { issuer: process.env.CLERK_ISSUER }));
  } catch (err) {
    res.status(401).send("Invalid token");
    return;
  }

  const contentType = req.headers["content-type"] || "";
  if (!ALLOWED.has(contentType)) {
    res.status(415).send("Unsupported image type");
    return;
  }

  const requested = new URL(req.url, "http://localhost").searchParams.get("path") || "";
  if (!requested.startsWith(`problems/${claims.sub}/`)) {
    res.status(403).send("Path does not belong to you");
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(413).send("Image must be under 5 MB");
    return;
  }

  const blob = await put(requested, body, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });

  res.status(200).json({ url: blob.url });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
