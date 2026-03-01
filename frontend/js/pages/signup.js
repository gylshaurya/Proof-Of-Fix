import { clerk, passwordPolicy } from "../lib/auth.js";
import { go } from "../lib/session.js";
import { initTheme } from "../lib/theme.js";

initTheme();

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("message");
  const submit = form.querySelector("button[type=submit]");

  function setMessage(value, kind = "") {
    message.textContent = value;
    message.className = `auth-msg ${kind}`.trim();
  }

  const instance = await clerk();

  if (instance.user) {
    go("home");
    return;
  }

  const policy = await passwordPolicy();
  const passwordField = document.getElementById("password");
  const passwordHint = document.getElementById("password-hint");

  const rules = [
    policy.minLength ? `at least ${policy.minLength} characters` : null,
    policy.requireNumber ? "a number" : null,
    policy.requireSpecial ? "a special character" : null,
  ].filter(Boolean);

  if (rules.length) {
    passwordHint.textContent = `Needs ${rules.join(", ")}.`;
    passwordField.placeholder = `At least ${policy.minLength ?? 8} characters`;
    passwordField.minLength = policy.minLength ?? 0;
  } else {
    passwordHint.textContent = "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const locality = document.getElementById("locality").value;
    const userType = form.querySelector("input[name=user_type]:checked")?.value;

    if (!fullName || !email || !password || !locality || !userType) {
      setMessage("All fields are required", "error");
      return;
    }

    if (policy.minLength && password.length < policy.minLength) {
      setMessage(`Password must be at least ${policy.minLength} characters`, "error");
      return;
    }

    const [firstName, ...rest] = fullName.split(" ");

    submit.disabled = true;
    submit.dataset.busy = "true";
    setMessage("Creating account...");

    try {
      const attempt = await instance.client.signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName: rest.join(" ") || undefined,
        unsafeMetadata: { locality, isContractor: userType === "contractor" },
      });

      if (attempt.status !== "complete") {
        setMessage("Check your inbox to verify your email, then sign in.", "success");
        return;
      }

      await instance.setActive({ session: attempt.createdSessionId });
      setMessage("Account created", "success");
      setTimeout(() => go(userType === "contractor" ? "contractor" : "home"), 500);
    } catch (err) {
      setMessage(err?.errors?.[0]?.longMessage || err?.message || "Could not create the account", "error");
    } finally {
      submit.disabled = false;
      delete submit.dataset.busy;
    }
  });
});
