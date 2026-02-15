import { client, go } from "../lib/session.js";

const MIN_PASSWORD = 8;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const message = document.getElementById("message");
  const submit = form.querySelector("button[type=submit]");

  function setMessage(value, kind = "") {
    message.textContent = value;
    message.className = kind;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const full_name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const locality = document.getElementById("locality").value;
    const userType = form.querySelector("input[name=user_type]:checked")?.value;

    if (!full_name || !email || !password || !locality || !userType) {
      setMessage("All fields are required", "error");
      return;
    }

    if (password.length < MIN_PASSWORD) {
      setMessage(`Password must be at least ${MIN_PASSWORD} characters`, "error");
      return;
    }

    submit.disabled = true;
    setMessage("Creating account...");

    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          locality,
          is_contractor: userType === "contractor",
        },
      },
    });

    if (error) {
      submit.disabled = false;
      setMessage(error.message, "error");
      return;
    }

    if (!data.session) {
      setMessage("Check your inbox to confirm your email, then sign in.", "success");
      submit.disabled = false;
      return;
    }

    setMessage("Account created", "success");
    setTimeout(() => go(userType === "contractor" ? "contractor" : "home"), 600);
  });
});
