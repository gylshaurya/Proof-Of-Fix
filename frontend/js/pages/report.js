import { client } from "../lib/session.js";
import { h } from "../lib/dom.js";
import { toast, readableError } from "../lib/ui.js";
import { STATUS } from "../config.js";

const BUCKET = "problem-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

async function uploadPhoto(file, userId) {
  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${userId}/${Date.now()}.${extension}`;

  const { error } = await client().storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;

  const { data } = client().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function mountReportDialog({ trigger, locality, userId, onCreated }) {
  if (!trigger) return;

  const dialog = buildDialog(locality);
  document.body.append(dialog);

  const form = dialog.querySelector("form");
  const titleInput = dialog.querySelector("#report-title");
  const descriptionInput = dialog.querySelector("#report-description");
  const costInput = dialog.querySelector("#report-cost");
  const fileInput = dialog.querySelector("#report-photo");
  const preview = dialog.querySelector("#report-preview");
  const submit = dialog.querySelector("#report-submit");

  trigger.addEventListener("click", () => {
    form.reset();
    preview.hidden = true;
    dialog.showModal();
  });

  dialog.querySelector("#report-cancel").addEventListener("click", () => dialog.close());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) {
      preview.hidden = true;
      return;
    }

    if (!ACCEPTED.includes(file.type)) {
      toast("Use a JPG, PNG or WebP image", "error");
      fileInput.value = "";
      return;
    }

    if (file.size > MAX_BYTES) {
      toast("Image must be under 5 MB", "error");
      fileInput.value = "";
      return;
    }

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const cost = Number(costInput.value);
    const file = fileInput.files[0];

    if (title.length < 5) {
      toast("Give the issue a clearer title", "error");
      return;
    }

    if (description.length < 15) {
      toast("Add a bit more detail to the description", "error");
      return;
    }

    if (!Number.isFinite(cost) || cost < 1000) {
      toast("Estimated cost must be at least Rs 1,000", "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Submitting...";

    try {
      let imageUrl = null;
      if (file) imageUrl = await uploadPhoto(file, userId);

      const { error } = await client().from("problems").insert({
        title,
        description,
        cost,
        locality,
        image_url: imageUrl,
        reported_by: userId,
        status_code: STATUS.DRAFT,
      });

      if (error) throw error;

      dialog.close();
      toast("Issue reported, waiting for review", "success");
      onCreated?.();
    } catch (err) {
      console.error(err);
      toast(readableError(err), "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Submit report";
    }
  });
}

function buildDialog(locality) {
  return h(
    "dialog",
    { class: "report-dialog", id: "report-dialog" },
    h(
      "form",
      { method: "dialog", class: "sheet report-form", novalidate: true },
      h("h3", null, "Report an issue"),
      h("p", { class: "report-hint" }, `This will be filed under ${locality || "your locality"}.`),

      h("label", { class: "label", for: "report-title" }, "Title"),
      h("input", { class: "field", id: "report-title", name: "title", type: "text", maxlength: "80", placeholder: "Broken streetlight near the park" }),

      h("label", { class: "label", for: "report-description" }, "What is wrong?"),
      h("textarea", { class: "field", id: "report-description", name: "description", rows: "4", maxlength: "500", placeholder: "Describe the problem and how it affects the area" }),

      h("label", { class: "label", for: "report-cost" }, "Estimated cost (Rs)"),
      h("input", { class: "field", id: "report-cost", name: "cost", type: "number", min: "1000", step: "500", placeholder: "25000" }),

      h("label", { class: "label", for: "report-photo" }, "Photo (optional)"),
      h("input", { class: "field", id: "report-photo", name: "photo", type: "file", accept: "image/jpeg,image/png,image/webp" }),
      h("img", { id: "report-preview", class: "report-preview", alt: "Selected photo", hidden: true }),

      h(
        "div",
        { class: "report-actions" },
        h("button", { type: "button", id: "report-cancel", class: "btn btn-ghost" }, "Cancel"),
        h("button", { type: "submit", id: "report-submit", class: "btn btn-primary" }, "Submit report")
      )
    )
  );
}
