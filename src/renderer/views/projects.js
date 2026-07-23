/* ========================================
   VIEW — Projects
   ======================================== */

import { escapeHtml, getCombinedEvents } from "../utils.js";
import {
  calendarEvents,
  trackedTasks,
  customProjects,
  expandedProjects,
  projectOrder,
  setTrackedTasks,
  setCustomProjects,
  setProjectOrder,
  setExpandedProjects,
} from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import {
  initProjectModal,
  openEditProjectModal,
} from "../components/modals.js";
import { showConfirmDialog } from "../components/confirm-dialog.js";

/**
 * Initialize the projects view (modals, reset button).
 */
export function initProjects() {
  initProjectModal();

  const resetProjBtn = document.getElementById("btn-reset-projects");
  if (resetProjBtn) {
    resetProjBtn.addEventListener("click", () => {
      showConfirmDialog({
        title: "Reset Projects?",
        message:
          "This will permanently delete all custom projects and project ordering. Tasks inside these projects will be kept but returned to Unassigned.",
        confirmText: "Reset Projects",
        onConfirm: async () => {
          await window.tracker.resetProjects();
          setCustomProjects({});
          setProjectOrder([]);
          setExpandedProjects({});
          setTrackedTasks(await window.tracker.getTasks());
        },
      });
    });
  }
}

/**
 * Render the full projects view.
 */
export async function renderProjects() {
  const projectsStack = document.getElementById("projects-list-stack");
  if (!projectsStack) return;

  projectsStack.innerHTML = "";

  let timerState = null;
  let analytics = null;
  let targets = {};
  try {
    timerState = await window.tracker.getTimerState();
    analytics = await window.tracker.getAnalytics("week");
    targets = (await window.tracker.getWeeklyTargets()) || {};
  } catch (e) {}

  const projects = Object.values(customProjects);
  // Sort projects according to projectOrder configuration
  projects.sort((a, b) => {
    const idxA = projectOrder.indexOf(a.id);
    const idxB = projectOrder.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const projectTasks = {};
  projects.forEach((p) => {
    projectTasks[p.id] = [];
  });

  // Combine calendar events and manual tasks
  const allEvents = getCombinedEvents(calendarEvents, trackedTasks);

  const unassignedEvents = [];

  allEvents.forEach((event) => {
    const task = trackedTasks[event.id] || {};
    // Skip finished/completed tasks
    if (task.completed) return;
    if (task.projectId && customProjects[task.projectId]) {
      projectTasks[task.projectId].push(event);
    } else {
      unassignedEvents.push(event);
    }
  }); // 1. Render Top Full-Width Collapsible Unassigned Pool Panel
  const poolPanel = document.getElementById("unassigned-pool-panel");
  const unassignedPool = document.getElementById("unassigned-tasks-pool");
  const unassignedCountBadge = document.getElementById(
    "unassigned-tasks-count",
  );

  if (poolPanel && unassignedPool && unassignedCountBadge) {
    unassignedPool.innerHTML = "";
    unassignedCountBadge.textContent = `${unassignedEvents.length} tasks`;

    const isUnassignedExpanded = expandedProjects["unassigned"] === true;
    if (isUnassignedExpanded) {
      poolPanel.classList.add("expanded");
    } else {
      poolPanel.classList.remove("expanded");
    }

    if (poolPanel.dataset.eventInit !== "true") {
      poolPanel.dataset.eventInit = "true";
      poolPanel.querySelector(".pool-header").addEventListener("click", () => {
        const expanded = poolPanel.classList.toggle("expanded");
        expandedProjects["unassigned"] = expanded;
      });
    }

    if (unassignedEvents.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state small";
      emptyState.style.width = "100%";
      emptyState.style.textAlign = "center";
      emptyState.style.padding = "8px 0";
      emptyState.innerHTML =
        "<p style='font-size:12px; margin:0;'>All tasks assigned to projects! 🎉</p>";
      unassignedPool.appendChild(emptyState);
    } else {
      unassignedEvents.forEach((event) => {
        const taskCard = createTaskItem(event, false, timerState);
        taskCard.setAttribute("draggable", "true");
        unassignedPool.appendChild(taskCard);
      });
    }
  }

  // 2. Render Custom Projects Cards Grid
  if (projects.length === 0) {
    const emptyBoard = document.createElement("div");
    emptyBoard.className = "empty-state";
    emptyBoard.style.flex = "1";
    emptyBoard.style.height = "100%";
    emptyBoard.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <p>No projects created yet</p>
      <span>Click "Create Project" above to start grouping your tasks</span>
    `;
    projectsStack.appendChild(emptyBoard);
  } else {
    projects.forEach((project) => {
      const card = document.createElement("div");
      const isExpanded = expandedProjects[project.id] === true;
      card.className = `project-card ${isExpanded ? "expanded" : ""}`;
      card.dataset.projectId = project.id;
      card.style.borderLeftColor = project.color || "#38bdf8";

      card.innerHTML = `
        <div class="project-card-header" style="cursor: pointer;">
          <div class="project-card-top-row">
            <div class="project-chevron" title="Expand/collapse tasks">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
            <div class="project-drag-handle" title="Drag to reorder project">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
              </svg>
            </div>
            <div class="project-card-info">
              <div class="project-color-dot" style="background: ${project.color};"></div>
              <span class="project-title">${escapeHtml(project.name)}</span>
            </div>
            <span class="project-task-count">${projectTasks[project.id].length} tasks</span>
            <div class="project-card-actions">
              <button class="btn-edit-project" data-project-id="${project.id}" title="Edit project">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-delete-project" data-project-id="${project.id}" title="Delete project">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="project-card-body">
          <div class="project-task-list" data-project-id="${project.id}">
            <!-- Assigned tasks -->
          </div>
        </div>
      `;

      const listContainer = card.querySelector(".project-task-list");
      const events = projectTasks[project.id];
      if (events.length === 0) {
        const emptyCol = document.createElement("div");
        emptyCol.className = "project-drop-target";
        emptyCol.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Drag tasks here</span>
        `;
        listContainer.appendChild(emptyCol);
      } else {
        events.forEach((event) => {
          const taskCard = createTaskItem(event, false, timerState);
          taskCard.setAttribute("draggable", "true");
          listContainer.appendChild(taskCard);
        });
      }

      card
        .querySelector(".project-card-header")
        .addEventListener("click", (e) => {
          if (
            e.target.closest(".btn-delete-project") ||
            e.target.closest(".btn-edit-project") ||
            e.target.closest(".project-drag-handle")
          )
            return;
          const expanded = card.classList.toggle("expanded");
          expandedProjects[project.id] = expanded;
        });

      card.querySelector(".btn-edit-project").addEventListener("click", (e) => {
        e.stopPropagation();
        openEditProjectModal(project);
      });

      card
        .querySelector(".btn-delete-project")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          showConfirmDialog({
            title: "Delete Project?",
            message: `Are you sure you want to delete project "<strong>${escapeHtml(project.name)}</strong>"? Tasks in it will return to Unassigned.`,
            confirmText: "Delete Project",
            onConfirm: async () => {
              await window.tracker.deleteProject(project.id);
              delete expandedProjects[project.id];
              setCustomProjects(await window.tracker.getProjects());
              setTrackedTasks(await window.tracker.getTasks());
            },
          });
        });

      projectsStack.appendChild(card);
    });
  }

  initProjectsDragAndDrop();
  initProjectsListDragAndDrop(projectsStack);
}

/**
 * Initialize drag-and-drop for assigning tasks to projects.
 */
function initProjectsDragAndDrop() {
  const draggables = document.querySelectorAll(
    '#view-projects .task-item[draggable="true"]',
  );
  const projectCards = document.querySelectorAll(
    "#view-projects .project-card",
  );
  const unassignedPool = document.getElementById("unassigned-tasks-pool");

  draggables.forEach((draggable) => {
    draggable.addEventListener("dragstart", (e) => {
      draggable.classList.add("dragging");
      e.dataTransfer.setData("text/plain", draggable.dataset.taskId);
      e.dataTransfer.effectAllowed = "move";
    });

    draggable.addEventListener("dragend", () => {
      draggable.classList.remove("dragging");
    });
  });

  projectCards.forEach((card) => {
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      const projectId = card.dataset.projectId;

      if (taskId) {
        const targetProjectId = projectId === "unassigned" ? null : projectId;
        await window.tracker.assignTaskToProject(taskId, targetProjectId);
        setTrackedTasks(await window.tracker.getTasks());
        renderProjects();
      }
    });
  });

  if (unassignedPool && unassignedPool.dataset.dragInitDone !== "true") {
    unassignedPool.dataset.dragInitDone = "true";
    unassignedPool.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      unassignedPool.classList.add("drag-over");
    });

    unassignedPool.addEventListener("dragleave", () => {
      unassignedPool.classList.remove("drag-over");
    });

    unassignedPool.addEventListener("drop", async (e) => {
      e.preventDefault();
      unassignedPool.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");

      if (taskId) {
        await window.tracker.assignTaskToProject(taskId, null);
        setTrackedTasks(await window.tracker.getTasks());
        renderProjects();
      }
    });
  }
}

/**
 * Initialize drag-and-drop for reordering project cards.
 */
function initProjectsListDragAndDrop(listEl) {
  if (listEl.dataset.dragInitDone === "true") return;
  listEl.dataset.dragInitDone = "true";

  let draggedItem = null;
  let placeholder = null;
  let offsetY = 0;
  let isDragging = false;

  function getVisualChildren() {
    return [...listEl.children].filter(
      (el) =>
        el !== draggedItem &&
        !el.classList.contains("drag-placeholder") &&
        el.classList.contains("project-card"),
    );
  }

  function onMouseDown(e) {
    const handle = e.target.closest(".project-drag-handle");
    if (!handle) return;

    const item = handle.closest(".project-card");
    if (!item) return;

    e.preventDefault();
    draggedItem = item;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    placeholder = document.createElement("div");
    placeholder.className = "project-card drag-placeholder";
    placeholder.style.height = rect.height + "px";
    placeholder.style.marginBottom = "var(--space-md)";

    item.classList.add("dragging");
    item.style.position = "fixed";
    item.style.width = rect.width + "px";
    item.style.top = rect.top + "px";
    item.style.left = rect.left + "px";
    item.style.zIndex = "1000";
    item.style.pointerEvents = "none";

    item.parentNode.insertBefore(placeholder, item);

    isDragging = true;
    document.body.style.cursor = "grabbing";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging || !draggedItem) return;
    draggedItem.style.top = e.clientY - offsetY + "px";

    const elements = getVisualChildren();
    let target = null;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        target = el;
        break;
      }
    }

    if (placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    if (target) {
      target.parentNode.insertBefore(placeholder, target);
    } else {
      listEl.appendChild(placeholder);
    }
  }

  function onMouseUp() {
    if (!isDragging || !draggedItem) return;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";

    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedItem, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    }

    draggedItem.classList.remove("dragging");
    draggedItem.style.position = "";
    draggedItem.style.width = "";
    draggedItem.style.top = "";
    draggedItem.style.left = "";
    draggedItem.style.zIndex = "";
    draggedItem.style.pointerEvents = "";

    saveCurrentProjectOrder(listEl);

    draggedItem = null;
    placeholder = null;
    isDragging = false;
  }

  listEl.addEventListener("mousedown", onMouseDown);
}

/**
 * Persist the current visual order of project cards.
 */
async function saveCurrentProjectOrder(listEl) {
  const items = listEl.querySelectorAll(".project-card[data-project-id]");
  const orderedIds = [...items].map((el) => el.dataset.projectId);
  setProjectOrder(orderedIds);
  await window.tracker.saveProjectOrder(orderedIds);
}
