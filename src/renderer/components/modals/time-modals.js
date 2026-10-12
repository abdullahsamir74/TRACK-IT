/* ========================================
   MODALS — Log Time, Edit Time Entry, Global Target
   ======================================== */

import {
  getState,
  setTrackedTasks,
  setWeeklyTargets,
  renderCurrentView,
  loadData,
} from "../../state.js";
import { getLocalDateString, getCombinedEvents } from "../../utils.js";
import { attachPickersToInputs } from "../custom-pickers.js";
import { showToast } from "../toast.js";
import { closeModals } from "./helpers.js";

// ---- Log Past / Manual Time Modal ----
export function openLogTimeModal(prefilledTaskId = null) {
  const overlay = document.getElementById("log-time-modal-overlay");
  if (!overlay) return;

  const taskSelect = document.getElementById("log-task-select");
  const nameInput = document.getElementById("log-task-name");
  const dateInput = document.getElementById("log-time-date");
  const durInput = document.getElementById("log-time-duration");
  const projSelect = document.getElementById("log-time-project");
  const notesInput = document.getElementById("log-time-notes");
  const markCompleteCheckbox = document.getElementById("log-time-mark-complete");

  const state = getState();
  const allEvents = getCombinedEvents(state.calendarEvents, state.trackedTasks);

  // Populate task dropdown
  if (taskSelect) {
    taskSelect.innerHTML = `<option value="">-- Choose Existing Task or Type Name Below --</option>`;
    allEvents.forEach((t) => {
      const taskObj = state.trackedTasks[t.id];
      const isDone = taskObj ? taskObj.completed : false;
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = (t.summary || t.name) + (isDone ? " (Completed)" : "");
      if (prefilledTaskId && t.id === prefilledTaskId) opt.selected = true;
      taskSelect.appendChild(opt);
    });

    taskSelect.onchange = () => {
      const selectedId = taskSelect.value;
      if (selectedId) {
        const selectedEvent = allEvents.find((e) => e.id === selectedId);
        const selectedTask = state.trackedTasks[selectedId];
        if (selectedEvent) {
          nameInput.value = selectedEvent.summary || selectedEvent.name || "";
          if (selectedEvent.durationMinutes) {
            durInput.value = String(selectedEvent.durationMinutes);
          }
        } else if (selectedTask) {
          nameInput.value = selectedTask.name || "";
        }
        if (selectedTask && selectedTask.projectId) {
          projSelect.value = selectedTask.projectId;
        }
        if (markCompleteCheckbox) {
          markCompleteCheckbox.checked = true;
        }
      } else {
        if (markCompleteCheckbox) {
          markCompleteCheckbox.checked = false;
        }
      }
    };
  }

  // Populate project dropdown
  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(state.customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      projSelect.appendChild(opt);
    });
  }

  if (prefilledTaskId) {
    const selectedEvent = allEvents.find((e) => e.id === prefilledTaskId);
    const selectedTask = state.trackedTasks[prefilledTaskId];
    nameInput.value = selectedEvent?.summary || selectedTask?.name || "";
    if (selectedEvent && selectedEvent.durationMinutes) {
      durInput.value = String(selectedEvent.durationMinutes);
    }
    if (selectedTask && selectedTask.projectId) {
      projSelect.value = selectedTask.projectId;
    }
    if (markCompleteCheckbox) {
      markCompleteCheckbox.checked = true;
    }
  } else {
    nameInput.value = "";
    if (markCompleteCheckbox) {
      markCompleteCheckbox.checked = false;
    }
  }

  dateInput.value = getLocalDateString();
  if (!prefilledTaskId) {
    durInput.value = "30";
  }
  notesInput.value = "";

  overlay.style.display = "flex";

  setTimeout(() => {
    if (nameInput) {
      nameInput.focus();
    }
  }, 50);
}

export async function handleLogTime(e) {
  e.preventDefault();

  const taskId = document.getElementById("log-task-select").value || null;
  const taskName = document.getElementById("log-task-name").value.trim();
  const dateVal = document.getElementById("log-time-date").value;
  const durationVal = parseFloat(document.getElementById("log-time-duration").value);
  const projectId = document.getElementById("log-time-project").value || null;
  const notes = document.getElementById("log-time-notes").value.trim();

  const markComplete = document.getElementById("log-time-mark-complete")?.checked;

  if (!taskName || !dateVal || isNaN(durationVal) || durationVal <= 0) return;

  const start = new Date(`${dateVal}T12:00:00`);
  const end = new Date(start.getTime() + durationVal * 60000);

  const session = {
    taskId,
    taskName,
    projectId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: durationVal,
    entryType: "manual",
    notes,
  };

  await window.tracker.saveSession(session);

  if (taskId) {
    const existingTask = getState().trackedTasks[taskId];
    if (markComplete) {
      await window.tracker.saveTask({
        id: taskId,
        name: taskName,
        projectId: projectId || (existingTask ? existingTask.projectId : null),
        start: existingTask ? existingTask.start : start.toISOString(),
        notes: existingTask ? existingTask.notes : notes,
        estimateMinutes: existingTask ? existingTask.estimateMinutes : null,
      });
      await window.tracker.markTaskComplete(taskId, false);
    } else if (!markComplete && existingTask?.completed) {
      await window.tracker.markTaskIncomplete(taskId);
    }
  }

  await loadData();

  closeModals();
  showToast("Work logged successfully! ⏱️", "success");
  renderCurrentView();
}

// ---- Edit Time Entry Modal ----
export function openEditTimeEntryModal(session) {
  const overlay = document.getElementById("edit-time-entry-modal-overlay");
  if (!overlay) return;

  document.getElementById("edit-entry-id").value = session.id || "";
  document.getElementById("edit-entry-task-id").value = session.taskId || "";
  document.getElementById("edit-entry-type").value = session.entryType || "timer";

  const nameInput = document.getElementById("edit-entry-name");
  const dateInput = document.getElementById("edit-entry-date");
  const durInput = document.getElementById("edit-entry-duration");
  const projSelect = document.getElementById("edit-entry-project");
  const notesInput = document.getElementById("edit-entry-notes");

  nameInput.value = session.taskName || "Untitled Task";
  dateInput.value = getLocalDateString(session.startTime);
  durInput.value = session.durationMinutes || 0;
  notesInput.value = session.notes || "";

  const state = getState();
  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(state.customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (session.projectId === p.id) opt.selected = true;
      projSelect.appendChild(opt);
    });
  }

  overlay.style.display = "flex";

  setTimeout(() => {
    if (durInput) {
      durInput.focus();
      durInput.select();
    }
  }, 50);
}

export async function handleEditTimeEntry(e) {
  e.preventDefault();

  const id = document.getElementById("edit-entry-id").value;
  const taskId = document.getElementById("edit-entry-task-id").value || null;
  const entryType = document.getElementById("edit-entry-type").value || "timer";
  const taskName = document.getElementById("edit-entry-name").value.trim();
  const dateVal = document.getElementById("edit-entry-date").value;
  const durationVal = parseFloat(document.getElementById("edit-entry-duration").value);
  const projectId = document.getElementById("edit-entry-project").value || null;
  const notes = document.getElementById("edit-entry-notes").value.trim();

  if (!id || !taskName || !dateVal || isNaN(durationVal) || durationVal <= 0) return;

  const start = new Date(`${dateVal}T12:00:00`);
  const end = new Date(start.getTime() + durationVal * 60000);

  const session = {
    id,
    taskId,
    taskName,
    projectId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: durationVal,
    entryType,
    notes,
  };

  await window.tracker.saveSession(session);
  await loadData();

  closeModals();
  showToast("Time entry updated! 💾", "success");
  renderCurrentView();
}

// ---- Global Target Modal ----
export async function openGlobalTargetModal() {
  const overlay = document.getElementById("global-target-modal-overlay");
  const input = document.getElementById("global-target-hours");
  if (!overlay || !input) return;

  const targets = (await window.tracker.getWeeklyTargets()) || {};
  input.value = targets["global"] || "";
  overlay.style.display = "flex";

  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

export async function handleSetGlobalTarget(e) {
  e.preventDefault();
  const val = document.getElementById("global-target-hours").value;
  await window.tracker.saveWeeklyTarget("global", val);
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
  showToast("Weekly goal updated! 🎯", "success");
  renderCurrentView();
}

export async function handleDeleteGlobalTarget() {
  await window.tracker.saveWeeklyTarget("global", "");
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
  showToast("Weekly goal removed", "info");
  renderCurrentView();
}
