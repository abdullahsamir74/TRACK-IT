/* ========================================
   COMPONENT — Modals (Add Task, Estimate, Project, Log Time, Edit Session)
   ======================================== */

import {
  trackedTasks,
  customProjects,
  setTrackedTasks,
  setCustomProjects,
  setWeeklyTargets,
  renderCurrentView,
  loadData,
} from "../state.js";
import { getLocalDateString, getLocalTimeString } from "../utils.js";
import {
  closeCustomPickers,
  attachPickersToInputs,
} from "./custom-pickers.js";
import { showToast } from "./toast.js";

// Helper to bind close button, cancel button, and overlay background click
function bindOverlayClose(overlayId, closeBtnId, cancelBtnId) {
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

// ---- Init ----
export function initModals() {
  // Bind modal overlays
  bindOverlayClose("modal-overlay", "btn-modal-close", "btn-cancel-task");
  bindOverlayClose("estimate-modal-overlay", "btn-estimate-close", "btn-estimate-cancel");
  bindOverlayClose("edit-task-modal-overlay", "btn-edit-task-close", "btn-edit-task-cancel");
  bindOverlayClose("global-target-modal-overlay", "btn-global-target-close", "btn-global-target-cancel");
  bindOverlayClose("log-time-modal-overlay", "btn-log-time-close", "btn-log-time-cancel");
  bindOverlayClose("edit-time-entry-modal-overlay", "btn-edit-time-entry-close", "btn-edit-entry-cancel");

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

  // Global ESC key listener to close active modal windows
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      closeModals();
    }
  });
}

// ---- Add Task Modal ----
export function openAddTaskModal(prefilledDate) {
  const today = getLocalDateString();
  const currentTime = getLocalTimeString();
  document.getElementById("task-date").value = prefilledDate || today;
  document.getElementById("task-time").value = currentTime;
  document.getElementById("task-name").value = "";
  document.getElementById("task-estimate").value = "";
  document.getElementById("task-priority").value = "medium";
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
  const calendarNotice = document.getElementById("edit-task-calendar-notice");

  nameInput.value = task.name || "";
  estimateInput.value = task.estimate || "";

  const priorityInput = document.getElementById("edit-task-priority");
  if (priorityInput) {
    priorityInput.value = task.priority || "medium";
    syncPriorityPills("edit-task", task.priority || "medium");
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

  if (task.isManual) {
    nameInput.disabled = false;
    dateInput.disabled = false;
    timeInput.disabled = false;
    calendarNotice.style.display = "none";
  } else {
    nameInput.disabled = true;
    dateInput.disabled = true;
    timeInput.disabled = true;
    calendarNotice.style.display = "block";
  }

  attachPickersToInputs();
  document.getElementById("edit-task-modal-overlay").style.display = "flex";

  setTimeout(() => {
    if (nameInput && !nameInput.disabled) {
      nameInput.focus();
      nameInput.select();
    }
  }, 50);
}

// ---- Log Past / Manual Time Modal (NEW) ----
export function openLogTimeModal(prefilledTaskId = null) {
  const overlay = document.getElementById("log-time-modal-overlay");
  if (!overlay) return;

  const taskSelect = document.getElementById("log-task-select");
  const nameInput = document.getElementById("log-task-name");
  const dateInput = document.getElementById("log-time-date");
  const durInput = document.getElementById("log-time-duration");
  const projSelect = document.getElementById("log-time-project");
  const notesInput = document.getElementById("log-time-notes");

  // Populate task dropdown
  if (taskSelect) {
    taskSelect.innerHTML = `<option value="">-- Choose Existing Task or Type Name Below --</option>`;
    Object.values(trackedTasks).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name + (t.completed ? " (Completed)" : "");
      if (prefilledTaskId && t.id === prefilledTaskId) opt.selected = true;
      taskSelect.appendChild(opt);
    });

    taskSelect.onchange = () => {
      const selectedId = taskSelect.value;
      if (selectedId && trackedTasks[selectedId]) {
        nameInput.value = trackedTasks[selectedId].name;
        if (trackedTasks[selectedId].projectId) {
          projSelect.value = trackedTasks[selectedId].projectId;
        }
      }
    };
  }

  // Populate project dropdown
  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      projSelect.appendChild(opt);
    });
  }

  if (prefilledTaskId && trackedTasks[prefilledTaskId]) {
    nameInput.value = trackedTasks[prefilledTaskId].name;
    if (trackedTasks[prefilledTaskId].projectId) {
      projSelect.value = trackedTasks[prefilledTaskId].projectId;
    }
  } else {
    nameInput.value = "";
  }

  dateInput.value = getLocalDateString();
  durInput.value = "30";
  notesInput.value = "";

  overlay.style.display = "flex";

  setTimeout(() => {
    if (nameInput) {
      nameInput.focus();
    }
  }, 50);
}

// ---- Edit Time Entry Modal (NEW) ----
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

  if (projSelect) {
    projSelect.innerHTML = `<option value="">No Project (Unassigned)</option>`;
    Object.values(customProjects).forEach((p) => {
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

// ---- Close All Modals ----
export function closeModals() {
  closeCustomPickers();
  document.getElementById("modal-overlay").style.display = "none";
  document.getElementById("estimate-modal-overlay").style.display = "none";
  document.getElementById("edit-task-modal-overlay").style.display = "none";
  
  const logModal = document.getElementById("log-time-modal-overlay");
  if (logModal) logModal.style.display = "none";

  const editSessionModal = document.getElementById("edit-time-entry-modal-overlay");
  if (editSessionModal) editSessionModal.style.display = "none";

  const globalOverlay = document.getElementById("global-target-modal-overlay");
  if (globalOverlay) globalOverlay.style.display = "none";
}

async function handleSetGlobalTarget(e) {
  e.preventDefault();
  const val = document.getElementById("global-target-hours").value;
  await window.tracker.saveWeeklyTarget("global", val);
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
  showToast("Weekly goal updated! 🎯", "success");
  renderCurrentView();
}

async function handleDeleteGlobalTarget() {
  await window.tracker.saveWeeklyTarget("global", "");
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
  showToast("Weekly goal removed", "info");
  renderCurrentView();
}

// ---- Handlers ----
async function handleAddTask(e) {
  e.preventDefault();

  const name = document.getElementById("task-name").value.trim();
  const date = document.getElementById("task-date").value;
  const time = document.getElementById("task-time").value;
  const parsedEst = parseInt(
    document.getElementById("task-estimate").value,
    10,
  );
  const estimate = isNaN(parsedEst) || parsedEst <= 0 ? 60 : parsedEst;
  const priority = document.getElementById("task-priority").value;

  if (!name || !date || !time) return;

  const startDate = new Date(`${date}T${time}`);
  if (isNaN(startDate.getTime())) return;
  const endDate = new Date(startDate.getTime() + estimate * 60000);

  const task = {
    id: `manual-${Date.now()}`,
    name,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    estimateMinutes: estimate,
    priority,
    isManual: true,
    createdAt: new Date().toISOString(),
  };

  await window.tracker.saveTask(task);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  showToast("Task created successfully", "success");
  renderCurrentView();
}

async function handleSetEstimate(e) {
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

async function handleEditTask(e) {
  e.preventDefault();

  const id = document.getElementById("edit-task-id").value;
  const isManual =
    document.getElementById("edit-task-is-manual").value === "true";
  const name = document.getElementById("edit-task-name").value.trim();
  const date = document.getElementById("edit-task-date").value;
  const time = document.getElementById("edit-task-time").value;
  const parsedEst = parseInt(
    document.getElementById("edit-task-estimate").value,
    10,
  );
  const estimate = isNaN(parsedEst) || parsedEst <= 0 ? null : parsedEst;
  const priority = document.getElementById("edit-task-priority").value;

  if (isManual) {
    if (!name || !date || !time) return;
    const startDate = new Date(`${date}T${time}`);
    if (isNaN(startDate.getTime())) return;
    const endDate = new Date(startDate.getTime() + (estimate || 60) * 60000);

    const task = {
      id,
      name,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      estimateMinutes: estimate,
      priority,
      isManual: true,
      updatedAt: new Date().toISOString(),
    };

    await window.tracker.saveTask(task);
  } else {
    const task = {
      id,
      estimateMinutes: estimate,
      priority,
      updatedAt: new Date().toISOString(),
    };
    await window.tracker.saveTask(task);
  }

  setTrackedTasks(await window.tracker.getTasks());
  closeModals();
  showToast("Task updated", "success");
  renderCurrentView();
}

async function handleLogTime(e) {
  e.preventDefault();

  const taskId = document.getElementById("log-task-select").value || null;
  const taskName = document.getElementById("log-task-name").value.trim();
  const dateVal = document.getElementById("log-time-date").value;
  const durationVal = parseFloat(document.getElementById("log-time-duration").value);
  const projectId = document.getElementById("log-time-project").value || null;
  const notes = document.getElementById("log-time-notes").value.trim();

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
  await loadData();

  closeModals();
  showToast("Work logged successfully! ⏱️", "success");
  renderCurrentView();
}

async function handleEditTimeEntry(e) {
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

// ---- Project Modal ----
export function initProjectModal() {
  const newProjBtn = document.getElementById("btn-new-project");
  const projModalOverlay = document.getElementById("project-modal-overlay");
  const closeProjBtn = document.getElementById("btn-project-close");
  const cancelProjBtn = document.getElementById("btn-project-cancel");
  const formProj = document.getElementById("form-project");

  if (newProjBtn) {
    newProjBtn.addEventListener("click", () => {
      document.getElementById("project-modal-title").textContent =
        "Create Project";
      document.getElementById("project-id").value = "";
      document.getElementById("project-name").value = "";

      const radios = document.getElementsByName("project-color");
      if (radios.length > 0) radios[0].checked = true;
      projModalOverlay.style.display = "flex";

      setTimeout(() => {
        const input = document.getElementById("project-name");
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    });
  }

  const closeProjModal = () => {
    projModalOverlay.style.display = "none";
  };

  if (closeProjBtn) closeProjBtn.addEventListener("click", closeProjModal);
  if (cancelProjBtn) cancelProjBtn.addEventListener("click", closeProjModal);
  if (projModalOverlay) {
    projModalOverlay.addEventListener("click", (e) => {
      if (e.target === projModalOverlay) closeProjModal();
    });
  }

  if (formProj) {
    formProj.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("project-id").value;
      const name = document.getElementById("project-name").value;
      const color = document.querySelector(
        'input[name="project-color"]:checked',
      ).value;

      const project = { name, color };
      if (id) project.id = id;

      await window.tracker.saveProject(project);

      setCustomProjects(await window.tracker.getProjects());
      closeProjModal();
      showToast("Project saved! 📁", "success");
      const { renderProjects } = await import("../views/projects.js");
      renderProjects();
    });
  }
}

/**
 * Open the project modal in edit mode
 */
export async function openEditProjectModal(project) {
  const projModalOverlay = document.getElementById("project-modal-overlay");
  document.getElementById("project-modal-title").textContent = "Edit Project";
  document.getElementById("project-id").value = project.id;
  document.getElementById("project-name").value = project.name;

  const radio = document.querySelector(
    `input[name="project-color"][value="${project.color}"]`,
  );
  if (radio) {
    radio.checked = true;
  }

  projModalOverlay.style.display = "flex";
  setTimeout(() => {
    const input = document.getElementById("project-name");
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

// ---- Priority Selector Helpers ----
function setupPrioritySelector(prefix) {
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

function syncPriorityPills(prefix, value) {
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

function setupDurationPresets(prefix) {
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
