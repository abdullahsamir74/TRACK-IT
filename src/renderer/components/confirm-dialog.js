/* ========================================
   COMPONENT — Confirm Dialog
   ======================================== */

import { renderCurrentView } from "../state.js";

/**
 * Show a modal confirmation dialog.
 */
export function showConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  isDanger = true,
  onConfirm,
} = {}) {
  // Remove existing dialog if any
  const existing = document.querySelector(".confirm-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog glass";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "confirm-title");
  dialog.setAttribute("aria-describedby", "confirm-message");

  const heading = document.createElement("h3");
  heading.id = "confirm-title";
  heading.textContent = title || "Are you sure?";

  const desc = document.createElement("p");
  desc.id = "confirm-message";
  if (message && /<[a-z][\s\S]*>/i.test(message)) {
    desc.innerHTML = message;
  } else {
    desc.textContent = message || "Please confirm to proceed.";
  }

  const actions = document.createElement("div");
  actions.className = "confirm-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-ghost";
  cancelBtn.id = "confirm-cancel";
  cancelBtn.textContent = cancelText || "Cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = `btn ${isDanger ? "btn-danger" : "btn-primary"}`;
  confirmBtn.id = "confirm-ok";
  confirmBtn.textContent = confirmText || "Confirm";

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(heading);
  dialog.appendChild(desc);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const closeDialog = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      closeDialog();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  cancelBtn.addEventListener("click", closeDialog);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });

  confirmBtn.addEventListener("click", async () => {
    try {
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
    } catch (err) {
      console.error("Error in confirmation action:", err);
    } finally {
      closeDialog();
      renderCurrentView();
    }
  });
}
