import { clerk, currentUser, signOut, userName } from "./auth.js";
import { one } from "./db.js";
import { fatalError } from "./ui.js";

const PAGES = {
  landing: "index.html",
  login: "login.html",
  signup: "signup.html",
  home: "home.html",
  admin: "admin.html",
  contractor: "contractor.html",
  problem: "problem.html",
};

const BOUNCE_KEY = "pof-redirects";
const BOUNCE_LIMIT = 3;
const BOUNCE_WINDOW = 6000;

function recordBounce(target) {
  let history = [];
  try {
    history = JSON.parse(sessionStorage.getItem(BOUNCE_KEY) || "[]");
  } catch {
    history = [];
  }

  const now = Date.now();
  history = history.filter((entry) => now - entry.at < BOUNCE_WINDOW);
  history.push({ to: target, at: now });

  try {
    sessionStorage.setItem(BOUNCE_KEY, JSON.stringify(history));
  } catch {
    /* private mode, guard simply does not apply */
  }

  return history.length;
}

export function clearBounces() {
  try {
    sessionStorage.removeItem(BOUNCE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function go(page, query) {
  const target = PAGES[page] || page;
  window.location.href = query ? `${target}?${new URLSearchParams(query)}` : target;
}

export function redirect(page) {
  const target = PAGES[page] || page;

  if (recordBounce(target) > BOUNCE_LIMIT) {
    clearBounces();
    reportRedirectLoop(target);
    return;
  }

  window.location.href = target;
}

async function reportRedirectLoop(target) {
  const { fatalError } = await import("./ui.js");
  let state = "could not read Clerk state";

  try {
    const instance = await clerk();
    state = [
      `clerk.loaded    ${instance.loaded}`,
      `clerk.user      ${instance.user ? instance.user.id : "null"}`,
      `clerk.session   ${instance.session ? instance.session.status : "null"}`,
      `page            ${window.location.pathname.split("/").pop()}`,
      `wanted to go to ${target}`,
    ].join("\n");
  } catch (err) {
    state = err.message;
  }

  fatalError("Stopped a redirect loop", state, {
    onSignOut: async () => {
      await signOut();
      window.location.href = "index.html";
    },
  });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    redirect("login");
    return null;
  }
  return user;
}

export async function loadProfile(userId) {
  return one`
    select id, full_name, locality, wallet, is_contractor, is_admin
    from profiles
    where id = ${userId}
  `;
}

export async function ensureProfile(user) {
  const existing = await loadProfile(user.id);
  if (existing) return existing;

  const meta = user.unsafeMetadata ?? {};

  return one`
    insert into profiles (id, full_name, locality, is_contractor, is_admin)
    values (
      ${user.id},
      ${userName(user)},
      ${meta.locality ?? null},
      ${meta.isContractor === true},
      false
    )
    on conflict (id) do update set full_name = excluded.full_name
    returning id, full_name, locality, wallet, is_contractor, is_admin
  `;
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
      { onSignOut: async () => { await signOut(); go("landing"); } }
    );
    return null;
  }

  if (!profile) {
    fatalError(
      "Your profile row could not be created",
      "The insert returned nothing. Check the profiles insert policy in neon/schema.sql.",
      { onSignOut: async () => { await signOut(); go("landing"); } }
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

  clearBounces();
  return { user, profile };
}

export function bindLogout(node) {
  const button = typeof node === "string" ? document.querySelector(node) : node;
  if (!button) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    await signOut();
    go("landing");
  });
}

export function homeFor(profile) {
  if (profile?.is_admin) return "admin";
  if (profile?.is_contractor) return "contractor";
  return "home";
}

export { clerk, currentUser };
