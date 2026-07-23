/* ========================================
   COMPONENT — Modals (Add Task, Estimate, Project)
   ======================================== */

import {
  setTrackedTasks,
  setCustomProjects,
  setWeeklyTargets,
  renderCurrentView,
} from "../state.js";
import { getLocalDateString } from "../utils.js";

// ---- Init ----
export function initModals() {
  // Add task modal
  document
    .getElementById("btn-modal-close")
    .addEventListener("click", closeModals);
  document
    .getElementById("btn-cancel-task")
    .addEventListener("click", closeModals);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-overlay")) closeModals();
  });

  // Estimate modal
  document
    .getElementById("btn-estimate-close")
    .addEventListener("click", closeModals);
  document
    .getElementById("btn-estimate-cancel")
    .addEventListener("click", closeModals);
  document
    .getElementById("estimate-modal-overlay")
    .addEventListener("click", (e) => {
      if (e.target === document.getElementById("estimate-modal-overlay"))
        closeModals();
    });

  // Edit task modal
  document
    .getElementById("btn-edit-task-close")
    .addEventListener("click", closeModals);
  document
    .getElementById("btn-edit-task-cancel")
    .addEventListener("click", closeModals);
  document
    .getElementById("edit-task-modal-overlay")
    .addEventListener("click", (e) => {
      if (e.target === document.getElementById("edit-task-modal-overlay"))
        closeModals();
    });

  // Global target modal
  const globalCloseBtn = document.getElementById("btn-global-target-close");
  const globalCancelBtn = document.getElementById("btn-global-target-cancel");
  const globalOverlay = document.getElementById("global-target-modal-overlay");

  if (globalCloseBtn) globalCloseBtn.addEventListener("click", closeModals);
  if (globalCancelBtn) globalCancelBtn.addEventListener("click", closeModals);
  if (globalOverlay) {
    globalOverlay.addEventListener("click", (e) => {
      if (e.target === globalOverlay) closeModals();
    });
  }

  // Form submissions
  document
    .getElementById("form-add-task")
    .addEventListener("submit", handleAddTask);
  document
    .getElementById("form-estimate")
    .addEventListener("submit", handleSetEstimate);
  document
    .getElementById("form-edit-task")
    .addEventListener("submit", handleEditTask);

  const formGlobalTarget = document.getElementById("form-global-target");
  if (formGlobalTarget) {
    formGlobalTarget.addEventListener("submit", handleSetGlobalTarget);
  }

  const globalDeleteBtn = document.getElementById("btn-global-target-delete");
  if (globalDeleteBtn) {
    globalDeleteBtn.addEventListener("click", handleDeleteGlobalTarget);
  }
}

// ---- Add Task Modal ----
export function openAddTaskModal() {
  const today = getLocalDateString();
  document.getElementById("task-date").value = today;
  document.getElementById("task-time").value = "09:00";
  document.getElementById("task-name").value = "";
  document.getElementById("task-estimate").value = "";
  document.getElementById("modal-overlay").style.display = "flex";
}

// ---- Estimate Modal ----
export function openEstimateModal(taskId, currentEstimate) {
  document.getElementById("estimate-task-id").value = taskId;
  document.getElementById("estimate-minutes").value = currentEstimate || "";
  document.getElementById("estimate-modal-overlay").style.display = "flex";
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

  document.getElementById("edit-task-modal-overlay").style.display = "flex";
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
  document.getElementById("modal-overlay").style.display = "none";
  document.getElementById("estimate-modal-overlay").style.display = "none";
  document.getElementById("edit-task-modal-overlay").style.display = "none";
  const globalOverlay = document.getElementById("global-target-modal-overlay");
  if (globalOverlay) globalOverlay.style.display = "none";
}

async function handleSetGlobalTarget(e) {
  e.preventDefault();
  const val = document.getElementById("global-target-hours").value;
  await window.tracker.saveWeeklyTarget("global", val);
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
  renderCurrentView();
}

async function handleDeleteGlobalTarget() {
  await window.tracker.saveWeeklyTarget("global", "");
  setWeeklyTargets(await window.tracker.getWeeklyTargets());
  closeModals();
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
    isManual: true,
    createdAt: new Date().toISOString(),
  };

  await window.tracker.saveTask(task);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
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
      isManual: true,
      updatedAt: new Date().toISOString(),
    };

    await window.tracker.saveTask(task);
  } else {
    await window.tracker.setEstimate(id, estimate);
  }

  setTrackedTasks(await window.tracker.getTasks());
  closeModals();
  renderCurrentView();
}

// ---- Project Modal (init is handled by views/projects.js) ----
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

      // Force input focus in Electron
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
      // Dynamically import to avoid circular deps
      const { renderProjects } = await import("../views/projects.js");
      renderProjects();
    });
  }
}

/**
 * Open the project modal in edit mode populated with the given project details.
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
