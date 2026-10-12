/* ========================================
   COMPONENT — Modals (Barrel / Orchestrator)
   Splits: task-modals, time-modals, notes-modal, project-modal, helpers
   ======================================== */

import {
  bindOverlayClose,
  closeModals,
  setupPrioritySelector,
  syncPriorityPills,
  setupDurationPresets,
} from "./modals/helpers.js";

import {
  openAddTaskModal,
  handleAddTask,
  openEstimateModal,
  handleSetEstimate,
  openEditTaskModal,
  handleEditTask,
} from "./modals/task-modals.js";

import {
  openLogTimeModal,
  handleLogTime,
  openEditTimeEntryModal,
  handleEditTimeEntry,
  openGlobalTargetModal,
  handleSetGlobalTarget,
  handleDeleteGlobalTarget,
} from "./modals/time-modals.js";

import {
  openTaskNotesModal,
  handleSaveTaskNotes,
} from "./modals/notes-modal.js";

import {
  initProjectModal,
  openEditProjectModal,
} from "./modals/project-modal.js";

// ---- Init ----
export function initModals() {
  // Bind modal overlays
  bindOverlayClose("modal-overlay", "btn-modal-close", "btn-cancel-task");
  bindOverlayClose("estimate-modal-overlay", "btn-estimate-close", "btn-estimate-cancel");
  bindOverlayClose("edit-task-modal-overlay", "btn-edit-task-close", "btn-edit-task-cancel");
  bindOverlayClose("global-target-modal-overlay", "btn-global-target-close", "btn-global-target-cancel");
  bindOverlayClose("log-time-modal-overlay", "btn-log-time-close", "btn-log-time-cancel");
  bindOverlayClose("edit-time-entry-modal-overlay", "btn-edit-time-entry-close", "btn-edit-entry-cancel");
  bindOverlayClose("task-notes-modal-overlay", "btn-task-notes-close", "btn-task-notes-cancel");

  // Form submissions
  document
    .getElementById("form-add-task")
    ?.addEventListener("submit", handleAddTask);
  document
    .getElementById("form-estimate")
    ?.addEventListener("submit", handleSetEstimate);
  document
    .getElementById("form-edit-task")
    ?.addEventListener("submit", handleEditTask);
  document
    .getElementById("form-log-time")
    ?.addEventListener("submit", handleLogTime);
  document
    .getElementById("form-edit-time-entry")
    ?.addEventListener("submit", handleEditTimeEntry);
  document
    .getElementById("form-task-notes")
    ?.addEventListener("submit", handleSaveTaskNotes);

  const formGlobalTarget = document.getElementById("form-global-target");
  if (formGlobalTarget) {
    formGlobalTarget.addEventListener("submit", handleSetGlobalTarget);
  }

  const globalDeleteBtn = document.getElementById("btn-global-target-delete");
  if (globalDeleteBtn) {
    globalDeleteBtn.addEventListener("click", handleDeleteGlobalTarget);
  }

  // Priority selectors setup
  setupPrioritySelector("task");
  setupPrioritySelector("edit-task");

  // Duration presets setup
  setupDurationPresets("task");
  setupDurationPresets("edit-task");

  // All Day checkbox toggles
  const taskAllDay = document.getElementById("task-all-day");
  const taskTime = document.getElementById("task-time");
  const taskTimeWrapper = document.getElementById("task-time-wrapper");
  if (taskAllDay && taskTime && taskTimeWrapper) {
    taskAllDay.addEventListener("change", () => {
      if (taskAllDay.checked) {
        taskTime.required = false;
        taskTime.disabled = true;
        taskTimeWrapper.style.opacity = "0.4";
        taskTimeWrapper.style.pointerEvents = "none";
      } else {
        taskTime.required = true;
        taskTime.disabled = false;
        taskTimeWrapper.style.opacity = "1";
        taskTimeWrapper.style.pointerEvents = "auto";
      }
    });
  }

  const editTaskAllDay = document.getElementById("edit-task-all-day");
  const editTaskTime = document.getElementById("edit-task-time");
  const editTaskTimeWrapper = document.getElementById("edit-task-time-wrapper");
  if (editTaskAllDay && editTaskTime && editTaskTimeWrapper) {
    editTaskAllDay.addEventListener("change", () => {
      if (editTaskAllDay.checked) {
        editTaskTime.required = false;
        editTaskTime.disabled = true;
        editTaskTimeWrapper.style.opacity = "0.4";
        editTaskTimeWrapper.style.pointerEvents = "none";
      } else {
        editTaskTime.required = true;
        editTaskTime.disabled = false;
        editTaskTimeWrapper.style.opacity = "1";
        editTaskTimeWrapper.style.pointerEvents = "auto";
      }
    });
  }

  // Global ESC key listener to close active modal windows
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      closeModals();
    }
  });
}

// ---- Re-export all public API ----
export {
  closeModals,
  openAddTaskModal,
  openEstimateModal,
  openEditTaskModal,
  openLogTimeModal,
  openEditTimeEntryModal,
  openGlobalTargetModal,
  openTaskNotesModal,
  initProjectModal,
  openEditProjectModal,
};
