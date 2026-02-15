import { client, loadProfile, go, homeFor } from "../lib/session.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const message = document.getElementById("message");
  const submit = form.querySelector("button[type=submit]");

  function setMessage(value, kind = "") {
    message.textContent = value;
    message.className = kind;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      setMessage("Enter your email and password", "error");
      return;
    }

    submit.disabled = true;
    setMessage("Signing in...");

    const { data, error } = await client().auth.signInWithPassword({ email, password });

    if (error) {
      submit.disabled = false;
      setMessage(error.message, "error");
      return;
    }

    try {
      const profile = await loadProfile(data.user.id, "isAdmin, isContractor");
      go(homeFor(profile));
    } catch (err) {
      console.error(err);
      go("home");
    }
  });
});
