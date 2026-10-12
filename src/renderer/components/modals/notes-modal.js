/* ========================================
   MODALS — Task Notes
   ======================================== */

import { getState, setTrackedTasks, renderCurrentView } from "../../state.js";
import { showToast } from "../toast.js";
import { closeModals } from "./helpers.js";

// ---- Task Notes Modal ----
export function openTaskNotesModal(taskOrId) {
  const overlay = document.getElementById("task-notes-modal-overlay");
  if (!overlay) return;

  const id = typeof taskOrId === "object" ? taskOrId.id : taskOrId;
  const task = getState().trackedTasks[id] || (typeof taskOrId === "object" ? taskOrId : {});
  const taskName = task.name || (typeof taskOrId === "object" ? taskOrId.name : "Task");
  const taskNotes = task.notes || task.description || (typeof taskOrId === "object" ? taskOrId.notes : "") || "";

  const idInput = document.getElementById("task-notes-id");
  if (idInput) {
    idInput.value = id;
    idInput.dataset.taskName = taskName;
  }
  const subtitleEl = document.getElementById("task-notes-modal-subtitle");
  if (subtitleEl) {
    subtitleEl.textContent = `Notes for "${taskName}"`;
  }

  const contentEl = document.getElementById("task-notes-content");
  if (contentEl) {
    contentEl.value = taskNotes;
  }

  overlay.style.display = "flex";

  setTimeout(() => {
    if (contentEl) {
      contentEl.focus();
      contentEl.setSelectionRange(contentEl.value.length, contentEl.value.length);
    }
  }, 50);
}

export async function handleSaveTaskNotes(e) {
  e.preventDefault();
  const idInput = document.getElementById("task-notes-id");
  const taskId = idInput?.value;
  const taskName = idInput?.dataset?.taskName || "";
  const notesContent = document.getElementById("task-notes-content")?.value || "";

  if (!taskId) return;

  await window.tracker.saveTaskNotes(taskId, notesContent, taskName);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  showToast("Task notes saved! 📝", "success");
  renderCurrentView();
}
