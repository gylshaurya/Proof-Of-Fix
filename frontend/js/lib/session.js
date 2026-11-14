import { clerk, currentUser, signOut, userName } from "./auth.js";
import { insertOne, selectOne } from "./db.js";
import { fatalError } from "./ui.js";

export const PAGES = {
  landing: "index.html",
  login: "login.html",
  signup: "signup.html",
  home: "home.html",
  admin: "admin.html",
  contractor: "contractor.html",
  problem: "problem.html",
};

// A tiny hint so the public landing page can offer "Open dashboard" instead of
// "Sign in" without loading Clerk. Clerk stays the source of truth.
const SESSION_HINT = "pof-session";

function rememberSession(profile) {
  try {
    localStorage.setItem(SESSION_HINT, PAGES[homeFor(profile)]);
  } catch {
    /* storage blocked */
  }
}

export function forgetSession() {
  try {
    localStorage.removeItem(SESSION_HINT);
  } catch {
    /* storage blocked */
  }
}

export function go(page, query) {
  const target = PAGES[page] || page;
  window.location.href = query ? `${target}?${new URLSearchParams(query)}` : target;
}

export function redirect(page) {
  const target = PAGES[page] || page;
  window.location.replace(target);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    forgetSession();
    redirect("login");
    return null;
  }
  return user;
}

export async function loadProfile(userId) {
  return selectOne("profiles", {
    columns: "id,full_name,locality,wallet,is_contractor,is_admin",
    filters: { id: userId },
  });
}

export async function ensureProfile(user) {
  const existing = await loadProfile(user.id);
  if (existing) return existing;

  const meta = user.unsafeMetadata ?? {};

  return insertOne(
    "profiles",
    {
      id: user.id,
      full_name: userName(user),
      locality: meta.locality ?? null,
      is_contractor: false,
      is_admin: false,
    },
    { columns: "id,full_name,locality,wallet,is_contractor,is_admin" }
  );
}

export async function requireProfile(role) {
  const user = await requireUser();
  if (!user) return null;

  let profile;
  try {
    profile = await ensureProfile(user);
  } catch (err) {
    console.error(err);
    fatalError(
      "Signed in, but the database refused the request",
      err.message,
      { onSignOut: () => logout() }
    );
    return null;
  }

  if (!profile) {
    fatalError(
      "Your profile row could not be created",
      "The insert returned nothing. Check the profiles insert policy in neon/schema.sql.",
      { onSignOut: () => logout() }
    );
    return null;
  }

  if (role === "admin" && !profile.is_admin) {
    redirect("home");
    return null;
  }

  if (role === "contractor" && !profile.is_contractor) {
    redirect("home");
    return null;
  }

  rememberSession(profile);
  return { user, profile };
}

export async function logout(button) {
  if (button) button.disabled = true;
  forgetSession();
  await signOut();
  go("landing");
}

export function bindLogout(node) {
  const button = typeof node === "string" ? document.querySelector(node) : node;
  if (!button) return;
  button.addEventListener("click", () => logout(button));
}

export function homeFor(profile) {
  if (profile?.is_admin) return "admin";
  if (profile?.is_contractor) return "contractor";
  return "home";
}

export { clerk, currentUser };
