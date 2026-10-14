/* ========================================
   MODALS — Add Task, Edit Task, Estimate
   ======================================== */

import {
  getState,
  setTrackedTasks,
  renderCurrentView,
} from "../../state.js";
import { getLocalDateString, getLocalTimeString } from "../../utils.js";
import { attachPickersToInputs } from "../custom-pickers.js";
import { showToast } from "../toast.js";
import { closeModals, syncPriorityPills } from "./helpers.js";

// ---- Add Task Modal ----
export function openAddTaskModal(
  prefilledDate,
  prefilledProjectId = null,
  opts = {},
) {
  const today = getLocalDateString();
  const currentTime = getLocalTimeString();
  const startTime = opts.startTime || currentTime;
  const endTime = opts.endTime || null;
  const isAllDayPrefill = Boolean(opts.isAllDay);

  document.getElementById("task-date").value = prefilledDate || today;
  const taskTimeInput = document.getElementById("task-time");
  if (taskTimeInput) taskTimeInput.value = startTime;
  document.getElementById("task-name").value = "";
  document.getElementById("task-priority").value = "medium";

  // Estimate from range if provided
  let estimateVal = "";
  if (endTime && startTime) {
    try {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let startMins = sh * 60 + sm;
      let endMins = eh * 60 + em;
      if (endMins <= startMins) endMins = startMins + 30;
      const diff = Math.max(1, endMins - startMins);
      estimateVal = String(diff);
    } catch (e) {
      estimateVal = "";
    }
  }
  document.getElementById("task-estimate").value = estimateVal;

  const allDayCb = document.getElementById("task-all-day");
  const taskTimeWrap = document.getElementById("task-time-wrapper");
  if (allDayCb) allDayCb.checked = isAllDayPrefill;
  if (taskTimeInput) {
    taskTimeInput.required = !isAllDayPrefill;
    taskTimeInput.disabled = isAllDayPrefill;
  }
  if (taskTimeWrap) {
    taskTimeWrap.style.opacity = isAllDayPrefill ? "0.4" : "1";
    taskTimeWrap.style.pointerEvents = isAllDayPrefill ? "none" : "auto";
  }

  const notesEl = document.getElementById("task-notes");
  if (notesEl) notesEl.value = "";

  const state = getState();
  const projSelect = document.getElementById("task-project");
  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(state.customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (prefilledProjectId && p.id === prefilledProjectId) {
        opt.selected = true;
      }
      projSelect.appendChild(opt);
    });
    if (!prefilledProjectId) {
      projSelect.value = "";
    }
  }

  syncPriorityPills("task", "medium");
  attachPickersToInputs();
  document.getElementById("modal-overlay").style.display = "flex";

  setTimeout(() => {
    const input = document.getElementById("task-name");
    if (input) {
      input.focus();
    }
  }, 50);
}

export async function handleAddTask(e) {
  e.preventDefault();

  const name = document.getElementById("task-name").value.trim();
  const date = document.getElementById("task-date").value;
  const time = document.getElementById("task-time").value;
  const isAllDay = Boolean(document.getElementById("task-all-day")?.checked);
  const parsedEst = parseInt(
    document.getElementById("task-estimate").value,
    10,
  );
  const estimate = isNaN(parsedEst) || parsedEst <= 0 ? (isAllDay ? null : 60) : parsedEst;
  const priority = document.getElementById("task-priority").value;
  const projectId = document.getElementById("task-project")?.value || null;
  const notes = document.getElementById("task-notes")?.value.trim() || "";

  if (!name || !date) return;
  if (!isAllDay && !time) return;

  const startDate = isAllDay
    ? new Date(`${date}T00:00:00`)
    : new Date(`${date}T${time}`);
  if (isNaN(startDate.getTime())) return;
  let endDate;
  if (isAllDay) {
    endDate = new Date(`${date}T23:59:59.999`);
  } else {
    // Use estimate; if estimate comes from range and is very short, keep it
    endDate = new Date(startDate.getTime() + (estimate || 60) * 60000);
  }

  const task = {
    id: `manual-${Date.now()}`,
    name,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    estimateMinutes: estimate,
    priority,
    projectId,
    notes,
    description: notes,
    isManual: true,
    isAllDay,
    createdAt: new Date().toISOString(),
  };

  await window.tracker.saveTask(task);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  showToast("Task created successfully", "success");
  renderCurrentView();
}

// ---- Estimate Modal ----
export function openEstimateModal(taskId, currentEstimate) {
  document.getElementById("estimate-task-id").value = taskId;
  document.getElementById("estimate-minutes").value = currentEstimate || "";
  document.getElementById("estimate-modal-overlay").style.display = "flex";

  setTimeout(() => {
    const input = document.getElementById("estimate-minutes");
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

export async function handleSetEstimate(e) {
  e.preventDefault();

  const taskId = document.getElementById("estimate-task-id").value;
  const parsedMin = parseInt(
    document.getElementById("estimate-minutes").value,
    10,
  );
  const minutes = isNaN(parsedMin) || parsedMin <= 0 ? null : parsedMin;

  if (!taskId) return;

  await window.tracker.setEstimate(taskId, minutes);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  showToast("Estimate saved", "success");
  renderCurrentView();
}

// ---- Edit Task Modal ----
export function openEditTaskModal(task) {
  document.getElementById("edit-task-id").value = task.id;
  document.getElementById("edit-task-is-manual").value = task.isManual
    ? "true"
    : "false";

  const nameInput = document.getElementById("edit-task-name");
  const dateInput = document.getElementById("edit-task-date");
  const timeInput = document.getElementById("edit-task-time");
  const estimateInput = document.getElementById("edit-task-estimate");
  const notesInput = document.getElementById("edit-task-notes");
  const calendarNotice = document.getElementById("edit-task-calendar-notice");

  nameInput.value = task.name || "";
  estimateInput.value = task.estimate || "";
  if (notesInput) {
    notesInput.value = task.notes || task.description || "";
  }

  const priorityInput = document.getElementById("edit-task-priority");
  if (priorityInput) {
    priorityInput.value = task.priority || "medium";
    syncPriorityPills("edit-task", task.priority || "medium");
  }

  const state = getState();
  const projSelect = document.getElementById("edit-task-project");
  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(state.customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (task.projectId && p.id === task.projectId) {
        opt.selected = true;
      }
      projSelect.appendChild(opt);
    });
    projSelect.value = task.projectId || "";
  }

  if (task.start) {
    const d = new Date(task.start);
    if (!isNaN(d.getTime())) {
      dateInput.value = getLocalDateString(d);

      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      timeInput.value = `${hours}:${minutes}`;
    } else {
      dateInput.value = "";
      timeInput.value = "";
    }
  } else {
    dateInput.value = "";
    timeInput.value = "";
  }

  const isAllDay = Boolean(task.isAllDay);
  const allDayCb = document.getElementById("edit-task-all-day");
  const timeWrap = document.getElementById("edit-task-time-wrapper");

  if (allDayCb) {
    allDayCb.checked = isAllDay;
    allDayCb.disabled = !task.isManual;
  }

  if (task.isManual) {
    nameInput.disabled = false;
    dateInput.disabled = false;
    timeInput.disabled = isAllDay;
    timeInput.required = !isAllDay;
    if (timeWrap) {
      timeWrap.style.opacity = isAllDay ? "0.4" : "1";
      timeWrap.style.pointerEvents = isAllDay ? "none" : "auto";
    }
    calendarNotice.style.display = "none";
  } else {
    nameInput.disabled = true;
    dateInput.disabled = true;
    timeInput.disabled = true;
    timeInput.required = false;
    if (timeWrap) {
      timeWrap.style.opacity = "0.4";
      timeWrap.style.pointerEvents = "none";
    }
    calendarNotice.style.display = "block";
  }

  attachPickersToInputs();
  document.getElementById("edit-task-modal-overlay").style.display = "flex";

  setTimeout(() => {
    if (nameInput && !nameInput.disabled) {
      nameInput.focus();
      nameInput.select();
    } else if (notesInput) {
      notesInput.focus();
    }
  }, 50);
}

export async function handleEditTask(e) {
  e.preventDefault();

  const id = document.getElementById("edit-task-id").value;
  const isManual =
    document.getElementById("edit-task-is-manual").value === "true";
  const name = document.getElementById("edit-task-name").value.trim();
  const date = document.getElementById("edit-task-date").value;
  const time = document.getElementById("edit-task-time").value;
  const isAllDay = Boolean(document.getElementById("edit-task-all-day")?.checked);
  const parsedEst = parseInt(
    document.getElementById("edit-task-estimate").value,
    10,
  );
  const estimate = isNaN(parsedEst) || parsedEst <= 0 ? null : parsedEst;
  const priority = document.getElementById("edit-task-priority").value;
  const projectId = document.getElementById("edit-task-project")?.value || null;
  const notes = document.getElementById("edit-task-notes")?.value.trim() || "";

  if (isManual) {
    if (!name || !date) return;
    if (!isAllDay && !time) return;

    const startDate = isAllDay
      ? new Date(`${date}T00:00:00`)
      : new Date(`${date}T${time}`);
    if (isNaN(startDate.getTime())) return;
    const endDate = isAllDay
      ? new Date(`${date}T23:59:59.999`)
      : new Date(startDate.getTime() + (estimate || 60) * 60000);

    const task = {
      id,
      name,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      estimateMinutes: estimate,
      priority,
      projectId,
      notes,
      description: notes,
      isManual: true,
      isAllDay,
      updatedAt: new Date().toISOString(),
    };

    await window.tracker.saveTask(task);
  } else {
    const task = {
      id,
      estimateMinutes: estimate,
      priority,
      projectId,
      notes,
      description: notes,
      updatedAt: new Date().toISOString(),
    };
    await window.tracker.saveTask(task);
  }

  setTrackedTasks(await window.tracker.getTasks());
  closeModals();
  showToast("Task updated", "success");
  renderCurrentView();
}
