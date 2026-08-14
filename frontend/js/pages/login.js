import { clerk } from "../lib/auth.js";
import { loadProfile, redirect, homeFor, clearBounces } from "../lib/session.js";
import { initTheme } from "../lib/theme.js";

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  const message = document.getElementById("message");
  const submit = form.querySelector("button[type=submit]");

  function setMessage(value, kind = "") {
    message.textContent = value;
    message.className = `auth-msg ${kind}`.trim();
  }

  const instance = await clerk();

  if (instance.user) {
    const profile = await loadProfile(instance.user.id).catch(() => null);
    redirect(homeFor(profile));
    return;
  }

  clearBounces();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const identifier = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!identifier || !password) {
      setMessage("Enter your email and password", "error");
      return;
    }

    submit.disabled = true;
    submit.dataset.busy = "true";
    setMessage("Signing in...");

    try {
      const attempt = await instance.client.signIn.create({ identifier, password });

      if (attempt.status !== "complete") {
        setMessage("Additional verification is required, check your email", "error");
        return;
      }

      await instance.setActive({ session: attempt.createdSessionId });

      clearBounces();
      const profile = await loadProfile(instance.user?.id).catch(() => null);
      redirect(homeFor(profile));
    } catch (err) {
      setMessage(err?.errors?.[0]?.longMessage || err?.message || "Could not sign in", "error");
    } finally {
      submit.disabled = false;
      delete submit.dataset.busy;
    }
  });
});
