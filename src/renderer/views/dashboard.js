/* ========================================
   VIEW — Dashboard
   ======================================== */

import {
  formatDuration,
  getLocalDateString,
  getCombinedEvents,
} from "../utils.js";
import {
  calendarEvents,
  trackedTasks,
  setTrackedTasks,
  setCalendarEvents,
  taskOrder,
  taskSortMode,
  setTaskSortMode,
  updateStreakCount,
  switchView,
} from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import { initDragAndDrop } from "../components/drag-drop.js";
import { openAddTaskModal, openLogTimeModal } from "../components/modals.js";

let dashboardInitialized = false;

function initDashboardButtons() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;

  const btnAdd = document.getElementById("btn-quick-add-task");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => openAddTaskModal());
  }

  const btnLog = document.getElementById("btn-dashboard-log-time");
  if (btnLog) {
    btnLog.addEventListener("click", () => openLogTimeModal());
  }
}

/**
 * Update the date display on the dashboard header.
 */
export function updateDashboardDate() {
  const now = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const el = document.getElementById("dashboard-date");
  if (el) {
    el.textContent = now.toLocaleDateString("en-US", options);
  }
}

/**
 * Render the full dashboard view.
 */
export async function renderDashboard() {
  initDashboardButtons();
  updateDashboardDate();

  const todayStr = getLocalDateString();

  // Combine calendar events and manual tasks
  const allEvents = getCombinedEvents(calendarEvents, trackedTasks);

  // Get today's events
  const todayEvents = allEvents.filter((e) => {
    const eventDate = getLocalDateString(e.start);
    return eventDate === todayStr;
  });

  // Get tracking data
  const tasks = await window.tracker.getTasks();
  setTrackedTasks(tasks || {});
  const sessions = await window.tracker.getAllSessions();
  const todaySessions = (sessions || []).filter((s) => {
    return getLocalDateString(s.startTime) === todayStr;
  });

  // Stat cards
  const totalTasksEl = document.getElementById("stat-total-tasks");
  if (totalTasksEl) totalTasksEl.textContent = todayEvents.length;

  const trackedToday = todaySessions.reduce(
    (sum, s) => sum + (s.durationMinutes || 0),
    0,
  );
  const totalTimeEl = document.getElementById("stat-total-time");
  if (totalTimeEl) totalTimeEl.textContent = formatDuration(trackedToday);

  const completedTodayCount = todayEvents.filter(
    (e) => trackedTasks[e.id]?.completed,
  ).length;
  const completedCountEl = document.getElementById("stat-completed-count");
  if (completedCountEl) completedCountEl.textContent = completedTodayCount;

  const estimatedTotal = todayEvents.reduce(
    (sum, e) => sum + (trackedTasks[e.id]?.estimateMinutes || e.durationMinutes || 0),
    0,
  );
  const estTimeEl = document.getElementById("stat-estimated-time");
  if (estTimeEl) estTimeEl.textContent = formatDuration(estimatedTotal);

  // Active timer banner
  const timerState = await window.tracker.getTimerState();
  const activeTimerEl = document.getElementById("dashboard-active-timer");
  if (activeTimerEl) {
    if (timerState && timerState.running) {
      activeTimerEl.style.display = "flex";
      document.getElementById("dashboard-timer-task").textContent =
        timerState.taskName;
      document.getElementById("dashboard-timer-display").textContent =
        timerState.elapsedFormatted;

      document.getElementById("dashboard-goto-timer").onclick = () =>
        switchView("timer");
    } else {
      activeTimerEl.style.display = "none";
    }
  }

  // Streak
  await updateStreakCount();

  // Sort preference setup
  const sortSelect = document.getElementById("select-dashboard-sort");
  if (sortSelect) {
    sortSelect.value = taskSortMode;
    sortSelect.onchange = async () => {
      const newMode = sortSelect.value;
      await window.tracker.saveTaskSortMode(newMode);
      setTaskSortMode(newMode);
      renderDashboard();
    };
  }

  // Today's task list
  const taskListEl = document.getElementById("dashboard-task-list");
  if (!taskListEl) return;

  if (todayEvents.length === 0) {
    const recentEvents = allEvents.slice(0, 10);
    if (recentEvents.length > 0) {
      taskListEl.innerHTML = "";
      const header = document.createElement("div");
      header.className = "schedule-date-header";
      header.textContent = "Upcoming & Recent Events";
      taskListEl.appendChild(header);
      recentEvents.forEach((event) => {
        taskListEl.appendChild(createTaskItem(event, false, timerState));
      });
    } else {
      taskListEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <p>No tasks scheduled for today</p>
          <span>Events from GNOME Calendar or manual tasks will appear here</span>
        </div>
      `;
    }
  } else {
    taskListEl.innerHTML = "";

    // Sort todayEvents based on taskSortMode
    if (taskSortMode === "manual") {
      if (taskOrder && taskOrder.length > 0) {
        const orderMap = {};
        taskOrder.forEach((id, i) => (orderMap[id] = i));
        todayEvents.sort((a, b) => {
          const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
          const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
          if (oa !== ob) return oa - ob;
          return new Date(a.start) - new Date(b.start);
        });
      } else {
        todayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
      }
    } else if (taskSortMode === "date") {
      todayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    } else if (taskSortMode === "priority") {
      const priorityMap = { high: 3, medium: 2, low: 1 };
      todayEvents.sort((a, b) => {
        const taskA = trackedTasks[a.id] || {};
        const taskB = trackedTasks[b.id] || {};
        const pa = priorityMap[taskA.priority] || 0;
        const pb = priorityMap[taskB.priority] || 0;
        if (pa !== pb) {
          return pb - pa;
        }
        return new Date(a.start) - new Date(b.start);
      });
    }

    const isDraggable = taskSortMode === "manual";
    todayEvents.forEach((event) => {
      taskListEl.appendChild(createTaskItem(event, isDraggable, timerState));
    });
    if (isDraggable) {
      initDragAndDrop(taskListEl);
    }
  }

  // Refresh button
  const refreshBtn = document.getElementById("btn-refresh-calendar");
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      setCalendarEvents(await window.tracker.getCalendarEvents());
      renderDashboard();
    };
  }
}
