const PAGES = {
  landing: "index.html",
  login: "login.html",
  home: "home.html",
  admin: "admin.html",
  contractor: "contractor.html",
  problem: "problem.html",
};

export function go(page, query) {
  const target = PAGES[page] || page;
  window.location.href = query ? `${target}?${new URLSearchParams(query)}` : target;
}

export function client() {
  return window.supabaseClient;
}

export async function currentSession() {
  const {
    data: { session },
  } = await client().auth.getSession();
  return session;
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) {
    go("login");
    return null;
  }
  return session;
}

export async function loadProfile(userId, columns = "*") {
  const { data, error } = await client()
    .from("profiles")
    .select(columns)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requireProfile(columns = "*", role) {
  const session = await requireSession();
  if (!session) return null;

  let profile;
  try {
    profile = await loadProfile(session.user.id, columns);
  } catch (err) {
    console.error(err);
    go("login");
    return null;
  }

  if (!profile) {
    go("login");
    return null;
  }

  if (role === "admin" && !profile.isAdmin) {
    go("home");
    return null;
  }

  if (role === "contractor" && !profile.isContractor) {
    go("home");
    return null;
  }

  return { session, profile };
}

export function bindLogout(node) {
  const button = typeof node === "string" ? document.querySelector(node) : node;
  if (!button) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    await client().auth.signOut();
    go("landing");
  });
}

export function homeFor(profile) {
  if (profile?.isAdmin) return "admin";
  if (profile?.isContractor) return "contractor";
  return "home";
}
