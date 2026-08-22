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
  overlay.innerHTML = `
    <div class="confirm-dialog glass">
      <h3>${title || "Are you sure?"}</h3>
      <p>${message || "Please confirm to proceed."}</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel">${cancelText || "Cancel"}</button>
        <button class="btn ${isDanger ? "btn-danger" : "btn-primary"}" id="confirm-reset">${confirmText || "Confirm"}</button>
      </div>
    </div>
  `;
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

  document
    .getElementById("confirm-cancel")
    ?.addEventListener("click", closeDialog);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });

  document
    .getElementById("confirm-reset")
    ?.addEventListener("click", async () => {
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
