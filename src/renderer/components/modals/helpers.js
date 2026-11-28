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

// ---- Task / Break Type Toggle ----
export function setupTypeToggle(prefix, onChange) {
  const container = document.getElementById(`${prefix}-type-selector`);
  if (!container) return;
  const input = document.getElementById(`${prefix}-type`);
  const pills = container.querySelectorAll(".type-pill");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const value = pill.getAttribute("data-value");
      if (input) input.value = value;
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      if (typeof onChange === "function") onChange(value);
    });
  });
}

export function syncTypePills(prefix, value) {
  const container = document.getElementById(`${prefix}-type-selector`);
  if (!container) return;
  const input = document.getElementById(`${prefix}-type`);
  const normalized = value === "break" ? "break" : "task";
  if (input) input.value = normalized;
  container.querySelectorAll(".type-pill").forEach((pill) => {
    pill.classList.toggle(
      "active",
      pill.getAttribute("data-value") === normalized,
    );
  });
}

// Breaks don't belong to projects and don't carry a task priority.
export function applyTypeFieldState(prefix, isBreak) {
  const project = document.getElementById(`${prefix}-project`);
  if (project) {
    if (isBreak) {
      // Remember the selection so switching back to Task restores it.
      if (!project.disabled) {
        project.dataset.preBreakValue = project.value;
      }
      project.value = "";
      project.disabled = true;
    } else {
      project.disabled = false;
      if (project.dataset.preBreakValue !== undefined) {
        project.value = project.dataset.preBreakValue;
        delete project.dataset.preBreakValue;
      }
    }
  }
  project?.closest(".form-group")?.classList.toggle("field-disabled", isBreak);

  const priority = document.getElementById(`${prefix}-priority`);
  const prioritySelector = document.getElementById(
    `${prefix}-priority-selector`,
  );
  if (priority) {
    if (isBreak) {
      // Remember the selection so switching back to Task restores it.
      if (!priority.disabled) {
        priority.dataset.preBreakValue = priority.value || "medium";
      }
      priority.value = "";
      priority.disabled = true;
    } else {
      priority.disabled = false;
      if (priority.dataset.preBreakValue !== undefined) {
        priority.value = priority.dataset.preBreakValue;
        delete priority.dataset.preBreakValue;
      }
    }
  }
  prioritySelector?.querySelectorAll(".priority-pill").forEach((pill) => {
    pill.disabled = isBreak;
    pill.classList.toggle(
      "active",
      !isBreak && pill.getAttribute("data-value") === (priority?.value || ""),
    );
  });
  prioritySelector
    ?.closest(".form-group")
    ?.classList.toggle("field-disabled", isBreak);
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
