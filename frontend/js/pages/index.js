import { currentSession, loadProfile, go, homeFor } from "../lib/session.js";

document.addEventListener("DOMContentLoaded", async () => {
  const cta = document.getElementById("primaryCta");

  const session = await currentSession();
  if (!session) return;

  let profile = null;
  try {
    profile = await loadProfile(session.user.id, "isAdmin, isContractor");
  } catch (err) {
    console.error(err);
    return;
  }

  if (!profile) return;

  if (cta) {
    cta.textContent = "Open dashboard";
    cta.addEventListener("click", (event) => {
      event.preventDefault();
      go(homeFor(profile));
    });
  }
});
