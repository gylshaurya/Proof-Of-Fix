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

  if (!instance.session) {
    throw new Error("No active Clerk session — the database rejects requests without a token");
  }

  const token = await instance.session.getToken();

  if (!token) {
    throw new Error("Clerk returned an empty token. Check the JWT template / Neon RLS setup.");
  }

  return token;
}

export async function signOut() {
  const instance = await clerk();
  await instance.signOut();
}

export async function passwordPolicy() {
  const instance = await clerk();
  const settings =
    instance.__unstable__environment?.userSettings?.passwordSettings ??
    instance.__unstable__environment?.userSettings?.password_settings;

  const minLength = settings?.minLength ?? settings?.min_length ?? null;

  return {
    minLength: Number.isInteger(minLength) && minLength > 0 ? minLength : null,
    requireSpecial: Boolean(settings?.requireSpecialChar ?? settings?.require_special_char),
    requireNumber: Boolean(settings?.requireNumbers ?? settings?.require_numbers),
  };
}

export function userEmail(user) {
  return user?.primaryEmailAddress?.emailAddress ?? "";
}

export function userName(user) {
  return user?.fullName || user?.firstName || userEmail(user).split("@")[0] || "Resident";
}
