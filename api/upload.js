import { put } from "@vercel/blob";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const jwks = createRemoteJWKSet(new URL(`${process.env.CLERK_ISSUER}/.well-known/jwks.json`));

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return new Response("Missing token", { status: 401 });
  }

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, jwks, { issuer: process.env.CLERK_ISSUER }));
  } catch {
    return new Response("Invalid token", { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!ALLOWED.has(contentType)) {
    return new Response("Unsupported image type", { status: 415 });
  }

  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BYTES) {
    return new Response("Image must be under 5 MB", { status: 413 });
  }

  const requested = new URL(request.url).searchParams.get("path") || "";
  const expectedPrefix = `problems/${claims.sub}/`;

  if (!requested.startsWith(expectedPrefix)) {
    return new Response("Path does not belong to you", { status: 403 });
  }

  const blob = await put(requested, request.body, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });

  return Response.json({ url: blob.url });
}
