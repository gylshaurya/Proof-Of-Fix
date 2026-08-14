import { CLERK_PUBLISHABLE_KEY } from "../config.js";

let clerkPromise = null;

function loadClerkScript() {
  return new Promise((resolve, reject) => {
    if (window.location.protocol === "file:") {
      reject(
        new Error(
          "Opened as a file:// URL. Clerk cannot keep a session here — serve the folder over http, e.g. python3 -m http.server 8000"
        )
      );
      return;
    }

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

const SETTLE_MS = 2000;

export async function currentUser() {
  const instance = await clerk();
  if (instance.user) return instance.user;

  return new Promise((resolve) => {
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(value ?? null);
    };

    const timer = setTimeout(() => finish(instance.user), SETTLE_MS);

    const unsubscribe = instance.addListener?.((payload) => {
      if (payload?.user) finish(payload.user);
    });
  });
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
