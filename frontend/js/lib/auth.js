import { CLERK_PUBLISHABLE_KEY } from "../config.js";

let clerkPromise = null;

function loadClerkScript() {
  return new Promise((resolve, reject) => {
    if (window.Clerk) return resolve(window.Clerk);

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src =
      "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    script.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
    script.addEventListener("load", () => resolve(window.Clerk));
    script.addEventListener("error", () => reject(new Error("Could not load Clerk")));
    document.head.append(script);
  });
}

export function clerk() {
  if (!clerkPromise) {
    clerkPromise = loadClerkScript().then(async (instance) => {
      await instance.load({ afterSignOutUrl: "/frontend/html/index.html" });
      return instance;
    });
  }
  return clerkPromise;
}

export async function currentUser() {
  const instance = await clerk();
  return instance.user ?? null;
}

export async function authToken() {
  const instance = await clerk();
  if (!instance.session) return null;
  return instance.session.getToken();
}

export async function signOut() {
  const instance = await clerk();
  await instance.signOut();
}

export function userEmail(user) {
  return user?.primaryEmailAddress?.emailAddress ?? "";
}

export function userName(user) {
  return user?.fullName || user?.firstName || userEmail(user).split("@")[0] || "Resident";
}
