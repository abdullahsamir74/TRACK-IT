/* ========================================
   VIEW — Projects (Kanban Board + List)
   ======================================== */

import { escapeHtml, getCombinedEvents, formatDuration, sanitizeColor } from "../utils.js";
import {
  getState,
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

const PREFS_KEY = "trackit.projects.prefs";
const SORT_MODES = ["manual", "name", "progress", "hours"];
const VIEW_MODES = ["board", "list"];

let viewMode = "board";
let sortMode = "manual";
let searchQuery = "";
let searchDebounce = null;
let prefsLoaded = false;
let renderToken = 0;
let activeAssignPopover = null;
let activeAssignAnchor = null;

/* --------------------------------------------------------------------------
   Preferences (view mode + sort order persist locally)
   -------------------------------------------------------------------------- */

function loadPrefs() {
  if (prefsLoaded) return;
  prefsLoaded = true;
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (VIEW_MODES.includes(prefs.viewMode)) viewMode = prefs.viewMode;
    if (SORT_MODES.includes(prefs.sortMode)) sortMode = prefs.sortMode;
    if (typeof prefs.railCollapsed === "boolean") {
      getState().expandedProjects["unassigned"] = !prefs.railCollapsed;
    }
  } catch {
    /* ignore malformed prefs */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        viewMode,
        sortMode,
        railCollapsed:
          getState().expandedProjects["unassigned"] === false,
      }),
    );
  } catch {
    /* localStorage may be unavailable */
  }
}

function syncToolbar() {
  const sortSelect = document.getElementById("projects-sort");
  if (sortSelect) sortSelect.value = sortMode;

  const boardBtn = document.getElementById("btn-projects-board");
  const listBtn = document.getElementById("btn-projects-list");
  const isBoard = viewMode === "board";
  boardBtn?.classList.toggle("active", isBoard);
  listBtn?.classList.toggle("active", !isBoard);
  boardBtn?.setAttribute("aria-pressed", String(isBoard));
  listBtn?.setAttribute("aria-pressed", String(!isBoard));
}

/* --------------------------------------------------------------------------
   Initialization
   -------------------------------------------------------------------------- */

/**
 * Initialize the projects view.
 */
export function initProjects() {
  initProjectModal();
  loadPrefs();

  // Enable smooth horizontal wheel scrolling across Kanban columns
  const board = document.getElementById("projects-list-stack");
  if (board) {
    board.addEventListener(
      "wheel",
      (e) => {
        // List view scrolls vertically; don't hijack it.
        if (board.classList.contains("list-view")) return;

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

  // Search
  const searchInput = document.getElementById("projects-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderProjects();
      }, 140);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !searchInput.value) return;
      e.preventDefault();
      clearTimeout(searchDebounce);
      searchInput.value = "";
      searchQuery = "";
      renderProjects();
    });
  }

  // Sort
  const sortSelect = document.getElementById("projects-sort");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      if (!SORT_MODES.includes(sortSelect.value)) return;
      sortMode = sortSelect.value;
      savePrefs();
      renderProjects();
    });
  }

  // View mode toggle
  const boardBtn = document.getElementById("btn-projects-board");
  const listBtn = document.getElementById("btn-projects-list");
  if (boardBtn) {
    boardBtn.addEventListener("click", () => {
      if (viewMode === "board") return;
      viewMode = "board";
      savePrefs();
      syncToolbar();
      renderProjects();
    });
  }
  if (listBtn) {
    listBtn.addEventListener("click", () => {
      if (viewMode === "list") return;
      viewMode = "list";
      savePrefs();
      syncToolbar();
      renderProjects();
    });
  }

  // Quick-assign popover dismissal
  document.addEventListener("click", (e) => {
    if (!activeAssignPopover) return;
    if (activeAssignPopover.contains(e.target)) return;
    closeAssignPopover();
  });
  document.addEventListener(
    "scroll",
    (e) => {
      if (activeAssignPopover?.contains(e.target)) return;
      closeAssignPopover();
    },
    true,
  );
  window.addEventListener("resize", () => closeAssignPopover());
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !activeAssignPopover) return;
      e.preventDefault();
      e.stopPropagation();
      closeAssignPopover();
    },
    true,
  );

  syncToolbar();
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

/**
 * Render the full projects view as a Kanban board or compact list.
 */
export async function renderProjects() {
  const columnsContainer = document.getElementById("projects-list-stack");
  if (!columnsContainer) return;

  const token = ++renderToken;

  let timerState = null;
  let analytics = null;
  let targets = {};
  const [timerResult, analyticsResult, targetsResult] = await Promise.allSettled([
    window.tracker.getTimerState(),
    window.tracker.getAnalytics("week"),
    window.tracker.getWeeklyTargets(),
  ]);
  if (timerResult.status === "fulfilled") timerState = timerResult.value;
  if (analyticsResult.status === "fulfilled") analytics = analyticsResult.value;
  if (targetsResult.status === "fulfilled" && targetsResult.value) {
    targets = targetsResult.value;
  }

  // A newer render started while we were awaiting data.
  if (token !== renderToken) return;

  const state = getState();
  const projects = Object.values(state.customProjects || {});
  const weeklyMinutes = analytics?.weeklyProjectMinutes || {};

  const projectTasks = {};
  const projectAllTasks = {};
  projects.forEach((p) => {
    projectTasks[p.id] = [];
    projectAllTasks[p.id] = { total: 0, completed: 0 };
  });

  // Combine calendar events and manual tasks
  const allEvents = getCombinedEvents(state.calendarEvents, state.trackedTasks);
  const unassignedEvents = [];

  allEvents.forEach((event) => {
    const task = state.trackedTasks[event.id] || {};
    if (task.projectId && state.customProjects[task.projectId]) {
      projectAllTasks[task.projectId].total++;
      if (task.completed) {
        projectAllTasks[task.projectId].completed++;
      } else {
        projectTasks[task.projectId].push(event);
      }
    } else if (!task.completed) {
      unassignedEvents.push(event);
    }
  });

  // The inbox rail is visible by default; only an explicit collapse hides it.
  if (state.expandedProjects["unassigned"] === undefined) {
    state.expandedProjects["unassigned"] = true;
  }

  // Match the board's search against inbox task names as well.
  const visibleUnassigned = searchQuery
    ? unassignedEvents.filter((event) =>
        String(event.summary || "")
          .toLowerCase()
          .includes(searchQuery),
      )
    : unassignedEvents;

  closeAssignPopover();
  columnsContainer.innerHTML = "";
  columnsContainer.classList.toggle("list-view", viewMode === "list");
  columnsContainer.dataset.viewMode = viewMode;
  columnsContainer.dataset.sortMode = sortMode;
  // Reordering while a search filter is active would drop hidden projects
  // from the saved order, so only allow it on the full, manual board.
  columnsContainer.dataset.draggable =
    sortMode === "manual" && !searchQuery ? "true" : "false";

  // 1. Render compact unassigned inbox rail
  renderUnassignedDrawer(visibleUnassigned, timerState);

  // 2. Filter + sort projects
  const visibleProjects = filterProjects(projects, projectTasks, searchQuery);
  const orderedProjects = sortProjects(
    visibleProjects,
    sortMode,
    projectAllTasks,
    weeklyMinutes,
  );

  // 3. Render the board or list
  if (projects.length === 0) {
    columnsContainer.appendChild(
      createEmptyState({
        title: "No projects created yet",
        hint: 'Click "Create Project" above to start grouping your tasks',
        actionLabel: "Create your first project",
        onAction: () => document.getElementById("btn-new-project")?.click(),
      }),
    );
  } else if (visibleProjects.length === 0) {
    columnsContainer.appendChild(
      createEmptyState({
        title: "No projects match your search",
        hint: `Nothing found for “${escapeHtml(searchQuery)}”`,
        actionLabel: "Clear search",
        onAction: () => {
          searchQuery = "";
          const input = document.getElementById("projects-search");
          if (input) input.value = "";
          renderProjects();
        },
      }),
    );
  } else if (viewMode === "list") {
    orderedProjects.forEach((project) => {
      columnsContainer.appendChild(
        createProjectListRow(
          project,
          projectTasks[project.id],
          projectAllTasks[project.id],
          timerState,
          weeklyMinutes,
          targets,
        ),
      );
    });
  } else {
    orderedProjects.forEach((project) => {
      columnsContainer.appendChild(
        createKanbanColumn(
          project,
          projectTasks[project.id],
          projectAllTasks[project.id],
          timerState,
          weeklyMinutes,
          targets,
        ),
      );
    });
  }

  if (viewMode === "board") {
    initKanbanTaskDragAndDrop();
    initKanbanColumnDragAndDrop(columnsContainer);
  }
}

/**
 * Filter projects by name or by any active task name.
 */
function filterProjects(projects, projectTasks, query) {
  if (!query) return projects;
  const state = getState();
  return projects.filter((project) => {
    if (project.name.toLowerCase().includes(query)) return true;
    return (projectTasks[project.id] || []).some((event) => {
      const task = state.trackedTasks[event.id] || {};
      return (event.summary || task.name || "").toLowerCase().includes(query);
    });
  });
}

/**
 * Sort projects for the current toolbar mode.
 */
function sortProjects(projects, mode, projectAllTasks, weeklyMinutes) {
  const state = getState();
  const orderIndex = (id) => {
    const idx = (state.projectOrder || []).indexOf(id);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  const completion = (p) => {
    const stats = projectAllTasks[p.id];
    return stats && stats.total > 0 ? stats.completed / stats.total : 0;
  };
  const hours = (p) => Number(weeklyMinutes[p.id] || 0);

  const sorted = [...projects];
  if (mode === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else if (mode === "progress") {
    sorted.sort(
      (a, b) =>
        completion(b) - completion(a) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  } else if (mode === "hours") {
    sorted.sort(
      (a, b) =>
        hours(b) - hours(a) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  } else {
    sorted.sort(
      (a, b) =>
        orderIndex(a.id) - orderIndex(b.id) ||
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }
  return sorted;
}

/* --------------------------------------------------------------------------
   Unassigned inbox rail
   -------------------------------------------------------------------------- */

/**
 * Render the persistent unassigned inbox rail.
 */
function renderUnassignedDrawer(unassignedEvents, timerState) {
  const state = getState();
  const rail = document.getElementById("unassigned-pool-panel");
  const pool = document.getElementById("unassigned-tasks-pool");
  const countBadge = document.getElementById("unassigned-tasks-count");
  const header = document.getElementById("unassigned-drawer-header");

  if (!rail || !pool || !countBadge) return;

  pool.innerHTML = "";
  countBadge.textContent = unassignedEvents.length;

  // The inbox is expanded by default; only an explicit collapse hides it.
  const isExpanded = state.expandedProjects["unassigned"] !== false;
  rail.classList.toggle("collapsed", !isExpanded);
  header?.setAttribute("aria-expanded", String(isExpanded));
  header?.setAttribute(
    "title",
    isExpanded ? "Collapse unassigned tasks" : "Expand unassigned tasks",
  );

  // Bind toggle only once
  if (rail.dataset.eventInit !== "true") {
    rail.dataset.eventInit = "true";
    header?.addEventListener("click", () => {
      const collapsed = rail.classList.toggle("collapsed");
      // Read fresh state: updateState() replaces the state object.
      getState().expandedProjects["unassigned"] = !collapsed;
      savePrefs();
      header.setAttribute("aria-expanded", String(!collapsed));
      header.setAttribute(
        "title",
        collapsed ? "Expand unassigned tasks" : "Collapse unassigned tasks",
      );
    });
  }

  if (unassignedEvents.length === 0) {
    pool.appendChild(createUnassignedEmpty());
  } else {
    unassignedEvents.forEach((event) => {
      const taskCard = createTaskItem(event, false, timerState);
      taskCard.setAttribute("draggable", "true");
      decorateInboxCard(taskCard);
      pool.appendChild(taskCard);
    });
  }
}

/**
 * Turn a task card into a compact inbox row with a quick-assign action.
 */
function decorateInboxCard(card) {
  card.classList.add("inbox-task-item");

  const badges = card.querySelector(".task-badges");
  if (!badges || badges.querySelector(".inbox-assign-btn")) return;

  const taskId = card.dataset.taskId;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "inbox-assign-btn";
  btn.dataset.taskId = taskId;
  btn.title = "Assign to project";
  btn.setAttribute("aria-label", "Assign task to project");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("draggable", "false");
  btn.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
    Assign
  `;
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAssignPopover(btn, taskId);
  });

  badges.appendChild(btn);
}

/**
 * Restore a task card to its full board appearance.
 */
function undecorateInboxCard(card) {
  card.classList.remove("inbox-task-item");
  card.querySelector(".inbox-assign-btn")?.remove();
}

/* --------------------------------------------------------------------------
   Quick assign popover
   -------------------------------------------------------------------------- */

function closeAssignPopover() {
  if (activeAssignPopover) {
    activeAssignPopover.remove();
    activeAssignPopover = null;
  }
  if (activeAssignAnchor) {
    activeAssignAnchor.setAttribute("aria-expanded", "false");
    activeAssignAnchor = null;
  }
}

/**
 * Open a small project picker anchored to an inbox row's Assign button.
 */
function openAssignPopover(anchor, taskId) {
  // Second click on the same anchor toggles it closed.
  if (activeAssignAnchor === anchor && activeAssignPopover) {
    closeAssignPopover();
    return;
  }
  closeAssignPopover();

  const projects = Object.values(getState().customProjects || {}).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const popover = document.createElement("div");
  popover.className = "assign-popover";
  popover.setAttribute("role", "menu");
  popover.setAttribute("aria-label", "Assign task to project");

  const title = document.createElement("div");
  title.className = "assign-popover-title";
  title.textContent = "Assign to project";
  popover.appendChild(title);

  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "assign-empty";
    empty.textContent = "No projects yet. Create one to file this task.";
    popover.appendChild(empty);
  }

  projects.forEach((project) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "assign-option";
    option.setAttribute("role", "menuitem");
    option.innerHTML = `
      <span class="assign-dot" style="background: ${sanitizeColor(project.color, "#38bdf8")}"></span>
      <span>${escapeHtml(project.name)}</span>
    `;
    option.addEventListener("click", () => {
      closeAssignPopover();
      assignInboxTask(taskId, project.id);
    });
    popover.appendChild(option);
  });

  const create = document.createElement("button");
  create.type = "button";
  create.className = "assign-create";
  create.textContent = "+ New project";
  create.addEventListener("click", () => {
    closeAssignPopover();
    document.getElementById("btn-new-project")?.click();
  });
  popover.appendChild(create);

  document.body.appendChild(popover);

  // Position under the anchor, flipping up when there is no room below.
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const margin = 8;
  let left = Math.min(rect.left, window.innerWidth - width - margin);
  left = Math.max(margin, left);
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - height - 6);
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  activeAssignPopover = popover;
  activeAssignAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");

  // Roving focus: arrows move between options, Enter activates.
  popover.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const options = [...popover.querySelectorAll(".assign-option, .assign-create")];
    if (options.length === 0) return;
    const index = options.indexOf(document.activeElement);
    const next =
      e.key === "ArrowDown"
        ? (index + 1) % options.length
        : (index - 1 + options.length) % options.length;
    options[next]?.focus();
  });

  requestAnimationFrame(() => {
    popover.querySelector(".assign-option, .assign-create")?.focus();
  });
}

/**
 * Persist an inbox quick-assign and re-render the board.
 */
async function assignInboxTask(taskId, projectId) {
  try {
    await window.tracker.assignTaskToProject(taskId, projectId || null);
    setTrackedTasks(await window.tracker.getTasks());
    renderProjects();
  } catch (err) {
    console.error("Failed to assign task:", err);
  }
}


/* --------------------------------------------------------------------------
   Kanban column
   -------------------------------------------------------------------------- */

/**
 * Create a single Kanban column for a project.
 */
function createKanbanColumn(
  project,
  activeTasks,
  allTaskStats,
  timerState,
  weeklyMinutes,
  targets,
) {
  const color = sanitizeColor(project.color, "#38bdf8");
  const column = document.createElement("div");
  column.className = "kanban-column";
  column.dataset.projectId = project.id;
  column.style.setProperty("--column-color", color);

  const totalTasks = allTaskStats.total;
  const completedTasks = allTaskStats.completed;
  const progressPct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const metrics = getWeeklyMetrics(project, weeklyMinutes, targets);
  const targetHours = metrics.targetHours;

  // Stats row
  const statItems = [];
  if (totalTasks > 0) {
    statItems.push(`
      <span class="kanban-stat-item" title="${completedTasks} of ${totalTasks} tasks completed">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${completedTasks}/${totalTasks} done
      </span>
    `);
  }
  if (targetHours <= 0 && metrics.minutes > 0) {
    statItems.push(`
      <span class="kanban-stat-item" title="Tracked this week">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${formatDuration(metrics.minutes)} this week
      </span>
    `);
  }
  const statsHtml =
    statItems.length > 0
      ? `<div class="kanban-column-stats">${statItems.join('<span class="kanban-stat-separator"></span>')}</div>`
      : "";

  const targetHtml =
    targetHours > 0
      ? `
        <div class="kanban-target">
          <div class="kanban-target-label-row">
            <span class="kanban-target-label">This week</span>
            <span class="kanban-target-value">${formatDuration(metrics.minutes)} / ${formatHours(targetHours)} · ${metrics.rawPct}%</span>
          </div>
          <div class="kanban-target-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${metrics.pct}" aria-label="${escapeHtml(project.name)} weekly target progress">
            <div class="kanban-target-fill${metrics.complete ? " is-complete" : ""}" style="width: ${metrics.pct}%;"></div>
          </div>
        </div>`
      : `
        <button class="kanban-set-target" data-project-id="${project.id}" title="Set a weekly hour target for ${escapeHtml(project.name)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Set weekly target
        </button>`;

  const completionBarHtml =
    targetHours > 0
      ? ""
      : `<div class="kanban-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="${escapeHtml(project.name)} completion">
          <div class="kanban-progress-fill" style="width: ${progressPct}%;"></div>
        </div>`;

  column.innerHTML = `
    <div class="kanban-column-header">
      <div class="kanban-header-top-row">
        <div class="kanban-column-drag-handle" title="Drag to reorder" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        <div class="kanban-column-color-dot" style="background: ${color}; color: ${color};"></div>
        <span class="kanban-column-title" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
        <span class="kanban-column-count" title="${activeTasks.length} active tasks">${activeTasks.length}</span>
        <div class="kanban-column-actions">
          <button class="btn-add-task-to-project" data-project-id="${project.id}" title="Add task to ${escapeHtml(project.name)}" aria-label="Add task to ${escapeHtml(project.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="btn-edit-project" data-project-id="${project.id}" title="Edit project" aria-label="Edit ${escapeHtml(project.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-delete-project" data-project-id="${project.id}" title="Delete project" aria-label="Delete ${escapeHtml(project.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${statsHtml}
      ${targetHtml}
      ${completionBarHtml}
    </div>
    <div class="kanban-column-body">
      <div class="kanban-task-list" data-project-id="${project.id}">
        <!-- Task cards -->
      </div>
    </div>
    <button class="kanban-add-task" data-project-id="${project.id}" aria-label="Add task to ${escapeHtml(project.name)}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add task
    </button>
  `;

  // Populate task list
  const taskList = column.querySelector(".kanban-task-list");
  if (activeTasks.length === 0) {
    taskList.appendChild(createColumnEmpty(project.id));
  } else {
    activeTasks.forEach((event) => {
      const taskCard = createTaskItem(event, false, timerState);
      taskCard.setAttribute("draggable", "true");
      taskList.appendChild(taskCard);
    });
  }

  // Event listeners for action buttons
  column.querySelector(".btn-add-task-to-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddTaskModal(null, project.id);
  });

  column.querySelector(".kanban-add-task")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddTaskModal(null, project.id);
  });

  column.querySelector(".kanban-set-target")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditProjectModal(project);
  });

  column.querySelector(".btn-edit-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditProjectModal(project);
  });

  column.querySelector(".btn-delete-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDeleteProject(project);
  });

  return column;
}

/* --------------------------------------------------------------------------
   List view
   -------------------------------------------------------------------------- */

/**
 * Create a compact project row for the list view.
 */
function createProjectListRow(
  project,
  activeTasks,
  allTaskStats,
  timerState,
  weeklyMinutes,
  targets,
) {
  const color = sanitizeColor(project.color, "#38bdf8");
  const totalTasks = allTaskStats.total;
  const completedTasks = allTaskStats.completed;
  const completionPct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const metrics = getWeeklyMetrics(project, weeklyMinutes, targets);

  const row = document.createElement("div");
  row.className = "project-list-row";
  row.dataset.projectId = project.id;
  row.style.setProperty("--project-color", color);
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `Edit project ${project.name}`);

  const progressLabel =
    metrics.targetHours > 0
      ? `${formatDuration(metrics.minutes)} / ${formatHours(metrics.targetHours)} this week`
      : `${completedTasks}/${totalTasks} tasks done`;
  const progressPct =
    metrics.targetHours > 0 ? metrics.pct : completionPct;
  const progressMeta =
    metrics.targetHours > 0
      ? `${metrics.rawPct}%${metrics.complete ? " · target reached" : ""}`
      : `${completionPct}% complete`;

  row.innerHTML = `
    <span class="project-list-accent" aria-hidden="true"></span>
    <div class="project-list-main">
      <div class="project-list-title-row">
        <span class="project-list-title">${escapeHtml(project.name)}</span>
        <span class="project-list-count">${activeTasks.length} active</span>
      </div>
      <div class="project-list-meta">
        ${totalTasks > 0 ? `${completedTasks}/${totalTasks} done` : "No tasks yet"}
        ${metrics.minutes > 0 ? `<span class="project-list-dot"></span>${formatDuration(metrics.minutes)} this week` : ""}
      </div>
    </div>
    <div class="project-list-progress">
      <div class="project-list-progress-labels">
        <span class="project-list-progress-label">${progressLabel}</span>
        <span class="project-list-progress-pct">${progressMeta}</span>
      </div>
      <div class="project-list-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}">
        <div class="project-list-bar-fill${metrics.targetHours > 0 && metrics.complete ? " is-complete" : ""}" style="width: ${progressPct}%;"></div>
      </div>
    </div>
    <div class="project-list-actions">
      <button class="btn-add-task-to-project" data-project-id="${project.id}" title="Add task to ${escapeHtml(project.name)}" aria-label="Add task to ${escapeHtml(project.name)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <button class="btn-edit-project" data-project-id="${project.id}" title="Edit project" aria-label="Edit ${escapeHtml(project.name)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn-delete-project" data-project-id="${project.id}" title="Delete project" aria-label="Delete ${escapeHtml(project.name)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `;

  row.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    openEditProjectModal(project);
  });
  row.addEventListener("keydown", (e) => {
    if (e.target !== row) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEditProjectModal(project);
    }
  });

  row.querySelector(".btn-add-task-to-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddTaskModal(null, project.id);
  });
  row.querySelector(".btn-edit-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditProjectModal(project);
  });
  row.querySelector(".btn-delete-project")?.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDeleteProject(project);
  });

  return row;
}

/* --------------------------------------------------------------------------
   Shared helpers
   -------------------------------------------------------------------------- */

/**
 * Resolve weekly tracking progress for a project.
 */
function getWeeklyMetrics(project, weeklyMinutes, targets) {
  const targetMap = targets || getState().weeklyTargets || {};
  const minutes = Math.max(0, Number(weeklyMinutes?.[project.id] || 0));
  const hours = minutes / 60;
  const settingsTarget = Number(targetMap[project.id]);
  const targetHours =
    Number.isFinite(settingsTarget) && settingsTarget > 0
      ? settingsTarget
      : Number(project.weeklyTargetHours || 0) || 0;
  const rawPct = targetHours > 0 ? Math.round((hours / targetHours) * 100) : 0;

  return {
    minutes,
    targetHours,
    rawPct,
    pct: Math.min(100, rawPct),
    complete: targetHours > 0 && hours >= targetHours,
  };
}

function formatHours(hours) {
  const num = Number(hours) || 0;
  return Number.isInteger(num) ? `${num}h` : `${num.toFixed(1)}h`;
}

function confirmDeleteProject(project) {
  showConfirmDialog({
    title: "Delete Project?",
    message: `Are you sure you want to delete project "<strong>${escapeHtml(project.name)}</strong>"? Tasks in it will return to Unassigned.`,
    confirmText: "Delete Project",
    onConfirm: async () => {
      await window.tracker.deleteProject(project.id);
      delete getState().expandedProjects[project.id];
      setCustomProjects(await window.tracker.getProjects());
      setTrackedTasks(await window.tracker.getTasks());
      renderProjects();
    },
  });
}

function createEmptyState({ title, hint, actionLabel, onAction }) {
  const empty = document.createElement("div");
  empty.className = "kanban-empty-state";
  empty.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
    <p>${title}</p>
    <span>${hint}</span>
    ${actionLabel ? `<button type="button" class="btn btn-accent kanban-empty-action">${actionLabel}</button>` : ""}
  `;
  empty.querySelector(".kanban-empty-action")?.addEventListener("click", onAction);
  return empty;
}

function createColumnEmpty(projectId) {
  const emptyEl = document.createElement("div");
  emptyEl.className = "kanban-column-empty";
  emptyEl.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    <span>Drag tasks here or click to add</span>
  `;
  emptyEl.addEventListener("click", () => openAddTaskModal(null, projectId));
  return emptyEl;
}

function createUnassignedEmpty() {
  const emptyEl = document.createElement("div");
  emptyEl.className = "unassigned-rail-empty";
  if (searchQuery) {
    emptyEl.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span>No unassigned tasks match “${escapeHtml(searchQuery)}”.</span>
    `;
  } else {
    emptyEl.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>Inbox zero — every task has a project.</span>
    `;
  }
  return emptyEl;
}

/* --------------------------------------------------------------------------
   Drag & drop — task assignment
   -------------------------------------------------------------------------- */

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
    if (draggable.dataset.dragBound === "true") return;
    draggable.dataset.dragBound = "true";

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

    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const targetList = col.querySelector(".kanban-task-list");
      handleTaskDrop(e, targetList, col.dataset.projectId);
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

    unassignedPool.addEventListener("drop", (e) => {
      e.preventDefault();
      unassignedPool.classList.remove("drag-over");
      handleTaskDrop(e, unassignedPool, null);
    });
  }
}

/**
 * Move a task card optimistically, then persist the assignment.
 */
async function handleTaskDrop(e, targetList, targetProjectId) {
  const taskId = e.dataTransfer.getData("text/plain");
  if (!taskId || !targetList) return;

  const card = document.querySelector(
    `#view-projects .task-item[data-task-id="${CSS.escape(taskId)}"]`,
  );
  if (!card) return;

  const sourceColumn = card.closest(".kanban-column");
  const sourceProjectId = sourceColumn ? sourceColumn.dataset.projectId : null;
  if ((sourceProjectId || null) === (targetProjectId || null)) return;

  // Optimistic UI: move the node without re-rendering the whole board.
  targetList.appendChild(card);
  if (targetProjectId) {
    undecorateInboxCard(card);
  } else {
    decorateInboxCard(card);
  }
  refreshBoardSummaries();

  try {
    await window.tracker.assignTaskToProject(taskId, targetProjectId || null);
    setTrackedTasks(await window.tracker.getTasks());
  } catch (err) {
    console.error("Failed to assign task:", err);
    renderProjects();
  }
}

/**
 * Refresh active counts and empty placeholders after an optimistic move.
 * Completion totals are unaffected by moving an active task.
 */
function refreshBoardSummaries() {
  document.querySelectorAll("#view-projects .kanban-column").forEach((col) => {
    const list = col.querySelector(".kanban-task-list");
    if (!list) return;
    const count = list.querySelectorAll(".task-item").length;
    const badge = col.querySelector(".kanban-column-count");
    if (badge) badge.textContent = count;

    const empty = list.querySelector(".kanban-column-empty");
    if (count === 0 && !empty) {
      list.appendChild(createColumnEmpty(col.dataset.projectId));
    } else if (count > 0 && empty) {
      empty.remove();
    }
  });

  const pool = document.getElementById("unassigned-tasks-pool");
  const countBadge = document.getElementById("unassigned-tasks-count");
  if (pool) {
    const count = pool.querySelectorAll(".task-item").length;
    if (countBadge) countBadge.textContent = count;
    const empty = pool.querySelector(".unassigned-rail-empty");
    if (count === 0 && !empty) {
      pool.appendChild(createUnassignedEmpty());
    } else if (count > 0 && empty) {
      empty.remove();
    }
  }
}

/* --------------------------------------------------------------------------
   Drag & drop — column ordering
   -------------------------------------------------------------------------- */

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
    // Manual ordering only — sorted/filtered views keep their computed order.
    if (listEl.dataset.sortMode !== "manual") return;
    if (listEl.dataset.draggable === "false") return;

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
