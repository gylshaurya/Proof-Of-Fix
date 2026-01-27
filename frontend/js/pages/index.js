document.addEventListener("DOMContentLoaded", async () => {
  try {
    const supabase = window.supabaseClient;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "../html/login.html";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("isContractor, isAdmin")
      .eq("id", session.user.id)
      .single();

    if (!profile) {
      window.location.href = "../html/login.html";
      return;
    }

    if (profile.isAdmin) {
      window.location.href = "../html/admin.html";
    } else if (profile.isContractor) {
      window.location.href = "../html/contractor.html";
    } else {
      window.location.href = "../html/home.html";
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    window.location.href = "../html/login.html";
  }
});