/* ========================================
   MODALS — Shared Helpers
   ======================================== */

import { closeCustomPickers } from "../custom-pickers.js";

// Helper to bind close button, cancel button, and overlay background click
export function bindOverlayClose(overlayId, closeBtnId, cancelBtnId) {
  const overlay = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeBtnId);
  const cancelBtn = document.getElementById(cancelBtnId);

  if (closeBtn) closeBtn.addEventListener("click", closeModals);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModals);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModals();
    });
  }
}

// ---- Close All Modals ----
export function closeModals() {
  closeCustomPickers();
  document.querySelectorAll(".modal-overlay").forEach((el) => {
    el.style.display = "none";
  });
}

// ---- Priority Selector Helpers ----
export function setupPrioritySelector(prefix) {
  const container = document.getElementById(`${prefix}-priority-selector`);
  if (!container) return;
  const select = document.getElementById(`${prefix}-priority`);
  const pills = container.querySelectorAll(".priority-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const val = pill.getAttribute("data-value");
      select.value = val;
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });
}

export function syncPriorityPills(prefix, value) {
  const container = document.getElementById(`${prefix}-priority-selector`);
  if (!container) return;
  const pills = container.querySelectorAll(".priority-pill");
  pills.forEach((pill) => {
    if (pill.getAttribute("data-value") === value) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });
}

export function setupDurationPresets(prefix) {
  const container = document.getElementById(`${prefix}-duration-presets`);
  if (!container) return;
  const input = document.getElementById(`${prefix}-estimate`);
  const buttons = container.querySelectorAll(".preset-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.getAttribute("data-value");
    });
  });
}
