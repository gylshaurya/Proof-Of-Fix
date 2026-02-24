import { BLOB_UPLOAD_ENDPOINT } from "../config.js";
import { authToken } from "./auth.js";

export async function uploadPhoto(file, userId) {
  const token = await authToken();
  if (!token) throw new Error("Sign in again to upload a photo");

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `problems/${userId}/${Date.now()}.${extension}`;

  const response = await fetch(
    `${BLOB_UPLOAD_ENDPOINT}?path=${encodeURIComponent(path)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type,
      },
      body: file,
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "Photo upload failed");
  }

  const { url } = await response.json();
  return url;
}
