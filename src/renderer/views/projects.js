/* ========================================
   VIEW — Projects (Kanban Board)
   ======================================== */

import { escapeHtml, getCombinedEvents, formatDuration } from "../utils.js";
import {
  calendarEvents,
  trackedTasks,
  customProjects,
  expandedProjects,
  projectOrder,
  setTrackedTasks,
  setCustomProjects,
  setProjectOrder,
} from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import {
  initProjectModal,
  openEditProjectModal,
  openAddTaskModal,
} from "../components/modals.js";
import { showConfirmDialog } from "../components/confirm-dialog.js";

/**
 * Initialize the projects view.
 */
export function initProjects() {
  initProjectModal();

  // Enable smooth horizontal wheel scrolling across Kanban columns
  const board = document.getElementById("projects-list-stack");
  if (board) {
    board.addEventListener(
      "wheel",
      (e) => {
        // Skip if touchpad is already emitting horizontal delta
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        // If hovering over a column's task list that can scroll vertically, preserve vertical scrolling
        const colBody = e.target.closest(".kanban-column-body");
        if (colBody && colBody.scrollHeight > colBody.clientHeight) {
          const atTop = colBody.scrollTop <= 0 && e.deltaY < 0;
          const atBottom =
            colBody.scrollTop + colBody.clientHeight >=
              colBody.scrollHeight - 1 && e.deltaY > 0;
          if (!atTop && !atBottom) return;
        }

        if (e.deltaY !== 0) {
          e.preventDefault();
          board.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );
  }
}

/**
 * Render the full projects view as a Kanban board.
 */
export async function renderProjects() {
  const columnsContainer = document.getElementById("projects-list-stack");
  if (!columnsContainer) return;

  columnsContainer.innerHTML = "";

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

  // Separate: track all tasks (including completed) for progress calculation
  const projectAllTasks = {};
  projects.forEach((p) => {
    projectAllTasks[p.id] = { total: 0, completed: 0 };
  });

  allEvents.forEach((event) => {
    const task = trackedTasks[event.id] || {};
    if (task.projectId && customProjects[task.projectId]) {
      projectAllTasks[task.projectId].total++;
      if (task.completed) {
        projectAllTasks[task.projectId].completed++;
      } else {
        projectTasks[task.projectId].push(event);
      }
    } else {
      if (!task.completed) {
        unassignedEvents.push(event);
      }
    }
  });

  // 1. Render Compact Unassigned Tasks Drawer
  renderUnassignedDrawer(unassignedEvents, timerState);

  // 2. Render Kanban Columns
  if (projects.length === 0) {
    const emptyBoard = document.createElement("div");
    emptyBoard.className = "kanban-empty-state";
    emptyBoard.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <p>No projects created yet</p>
      <span>Click "Create Project" above to start grouping your tasks</span>
    `;
    columnsContainer.appendChild(emptyBoard);
  } else {
    projects.forEach((project) => {
      const column = createKanbanColumn(
        project,
        projectTasks[project.id],
        projectAllTasks[project.id],
        timerState,
      );
      columnsContainer.appendChild(column);
    });
  }

  initKanbanTaskDragAndDrop();
  initKanbanColumnDragAndDrop(columnsContainer);
}

/**
 * Render the compact unassigned tasks drawer.
 */
function renderUnassignedDrawer(unassignedEvents, timerState) {
  const drawer = document.getElementById("unassigned-pool-panel");
  const pool = document.getElementById("unassigned-tasks-pool");
  const countBadge = document.getElementById("unassigned-tasks-count");

  if (!drawer || !pool || !countBadge) return;

  pool.innerHTML = "";
  countBadge.textContent = unassignedEvents.length;

  const isExpanded = expandedProjects["unassigned"] === true;
  if (isExpanded) {
    drawer.classList.add("expanded");
  } else {
    drawer.classList.remove("expanded");
  }

  // Bind toggle only once
  if (drawer.dataset.eventInit !== "true") {
    drawer.dataset.eventInit = "true";
    const header = document.getElementById("unassigned-drawer-header");
    if (header) {
      header.addEventListener("click", () => {
        const expanded = drawer.classList.toggle("expanded");
        expandedProjects["unassigned"] = expanded;
      });
    }
  }

  if (unassignedEvents.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "kanban-unassigned-empty";
    emptyEl.innerHTML = `<span>All tasks assigned to projects! 🎉</span>`;
    pool.appendChild(emptyEl);
  } else {
    unassignedEvents.forEach((event) => {
      const taskCard = createTaskItem(event, false, timerState);
      taskCard.setAttribute("draggable", "true");
      pool.appendChild(taskCard);
    });
  }
}

/**
 * Create a single Kanban column for a project.
 */
function createKanbanColumn(project, activeTasks, allTaskStats, timerState) {
  const column = document.createElement("div");
  column.className = "kanban-column";
  column.dataset.projectId = project.id;
  column.style.setProperty("--column-color", project.color || "#38bdf8");

  // Calculate stats
  let projectTrackedMinutes = 0;
  Object.values(trackedTasks).forEach((t) => {
    if (t.projectId === project.id) {
      projectTrackedMinutes += t.totalTrackedMinutes || 0;
    }
  });
  projectTrackedMinutes = Math.round(projectTrackedMinutes * 10) / 10;

  const totalTasks = allTaskStats.total;
  const completedTasks = allTaskStats.completed;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Build stats HTML
  let statsHtml = "";
  const statItems = [];

  if (totalTasks > 0) {
    statItems.push(`
      <span class="kanban-stat-item">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${completedTasks}/${totalTasks} done
      </span>
    `);
  }

  if (projectTrackedMinutes > 0) {
    statItems.push(`
      <span class="kanban-stat-item">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${formatDuration(projectTrackedMinutes)}
      </span>
    `);
  }

  if (statItems.length > 0) {
    statsHtml = `<div class="kanban-column-stats">${statItems.join('<span class="kanban-stat-separator"></span>')}</div>`;
  }

  column.innerHTML = `
    <div class="kanban-column-header">
      <div class="kanban-header-top-row">
        <div class="kanban-column-drag-handle" title="Drag to reorder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        <div class="kanban-column-color-dot" style="background: ${project.color}; color: ${project.color};"></div>
        <span class="kanban-column-title">${escapeHtml(project.name)}</span>
        <span class="kanban-column-count">${activeTasks.length}</span>
        <div class="kanban-column-actions">
          <button class="btn-add-task-to-project" data-project-id="${project.id}" title="Add task to ${escapeHtml(project.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="btn-edit-project" data-project-id="${project.id}" title="Edit project">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-delete-project" data-project-id="${project.id}" title="Delete project">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${statsHtml}
      <div class="kanban-progress-bar">
        <div class="kanban-progress-fill" style="width: ${progressPct}%;"></div>
      </div>
    </div>
    <div class="kanban-column-body">
      <div class="kanban-task-list" data-project-id="${project.id}">
        <!-- Task cards -->
      </div>
    </div>
  `;

  // Populate task list
  const taskList = column.querySelector(".kanban-task-list");
  if (activeTasks.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "kanban-column-empty";
    emptyEl.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      <span>Drag tasks here</span>
    `;
    taskList.appendChild(emptyEl);
  } else {
    activeTasks.forEach((event) => {
      const taskCard = createTaskItem(event, false, timerState);
      taskCard.setAttribute("draggable", "true");
      taskList.appendChild(taskCard);
    });
  }

  // Event listeners for action buttons
  const btnAdd = column.querySelector(".btn-add-task-to-project");
  if (btnAdd) {
    btnAdd.addEventListener("click", (e) => {
      e.stopPropagation();
      openAddTaskModal(null, project.id);
    });
  }

  column.querySelector(".btn-edit-project").addEventListener("click", (e) => {
    e.stopPropagation();
    openEditProjectModal(project);
  });

  column.querySelector(".btn-delete-project").addEventListener("click", (e) => {
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

  return column;
}

/**
 * Initialize drag-and-drop for assigning tasks to Kanban columns.
 */
function initKanbanTaskDragAndDrop() {
  const draggables = document.querySelectorAll(
    '#view-projects .task-item[draggable="true"]',
  );
  const columns = document.querySelectorAll("#view-projects .kanban-column");
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

  columns.forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
    });

    col.addEventListener("dragleave", (e) => {
      // Only remove if truly leaving the column (not entering a child)
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove("drag-over");
      }
    });

    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      const projectId = col.dataset.projectId;

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
 * Initialize drag-and-drop for reordering Kanban columns horizontally.
 */
function initKanbanColumnDragAndDrop(listEl) {
  if (listEl.dataset.dragInitDone === "true") return;
  listEl.dataset.dragInitDone = "true";

  let draggedItem = null;
  let placeholder = null;
  let offsetX = 0;
  let isDragging = false;

  function getVisualChildren() {
    return [...listEl.children].filter(
      (el) =>
        el !== draggedItem &&
        !el.classList.contains("drag-placeholder") &&
        el.classList.contains("kanban-column"),
    );
  }

  function onMouseDown(e) {
    const handle = e.target.closest(".kanban-column-drag-handle");
    if (!handle) return;

    const item = handle.closest(".kanban-column");
    if (!item) return;

    e.preventDefault();
    draggedItem = item;

    const rect = item.getBoundingClientRect();
    offsetX = e.clientX - rect.left;

    placeholder = document.createElement("div");
    placeholder.className = "kanban-column drag-placeholder";
    placeholder.style.width = rect.width + "px";
    placeholder.style.height = rect.height + "px";

    item.classList.add("dragging");
    item.style.position = "fixed";
    item.style.width = rect.width + "px";
    item.style.height = rect.height + "px";
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
    draggedItem.style.left = e.clientX - offsetX + "px";

    const elements = getVisualChildren();
    let target = null;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
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
    draggedItem.style.height = "";
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
 * Persist the current visual order of project columns.
 */
async function saveCurrentProjectOrder(listEl) {
  const items = listEl.querySelectorAll(".kanban-column[data-project-id]");
  const orderedIds = [...items].map((el) => el.dataset.projectId);
  setProjectOrder(orderedIds);
  await window.tracker.saveProjectOrder(orderedIds);
}
