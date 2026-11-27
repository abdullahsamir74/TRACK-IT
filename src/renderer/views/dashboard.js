/* ========================================
   VIEW — Dashboard
   ======================================== */

import {
  formatDuration,
  escapeHtml,
  getLocalDateString,
  getCombinedEvents,
} from "../utils.js";
import {
  getState,
  setTrackedTasks,
  setCalendarEvents,
  setTaskSortMode,
  updateStreakCount,
  switchView,
} from "../state.js";
import {
  getDailyGoalHours,
  getFocus3,
  toggleFocusTask,
  setDailyGoal,
  startFocusTask,
  refreshTodaySummary,
  runCelebrations,
} from "../focus.js";
import { createTaskItem } from "../components/task-item.js";
import { initDragAndDrop } from "../components/drag-drop.js";
import { openAddTaskModal, openLogTimeModal } from "../components/modals.js";
import { showToast } from "../components/toast.js";
import { sortEvents } from "../constants.js";

let dashboardInitialized = false;

const MOMENTUM_RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const PLAY_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const PAUSE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;

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
 * Render the daily goal ring, streak, and Today's Focus 3 card.
 */
async function renderMomentum(todayEvents, timerState, allEvents) {
  let summary = null;
  try {
    summary = await refreshTodaySummary();
  } catch (err) {
    console.error("Failed to load today's momentum summary:", err);
  }

  const tracked = summary?.trackedMinutes ?? 0;
  const goalHours = summary?.goalHours ?? getDailyGoalHours();
  const goalMinutes = summary?.goalMinutes ?? Math.round(goalHours * 60);
  const progress =
    summary?.goalProgress ??
    (goalMinutes > 0 ? Math.min(1, tracked / goalMinutes) : 0);
  const percent = Math.round(progress * 100);

  const ring = document.getElementById("momentum-ring-progress");
  if (ring) {
    ring.style.strokeDasharray = String(MOMENTUM_RING_CIRCUMFERENCE);
    ring.style.strokeDashoffset = String(
      MOMENTUM_RING_CIRCUMFERENCE * (1 - progress),
    );
    ring.classList.toggle("complete", Boolean(summary?.goalMet));
  }

  const percentEl = document.getElementById("momentum-percent");
  if (percentEl) percentEl.textContent = `${percent}%`;

  const trackedEl = document.getElementById("momentum-tracked");
  if (trackedEl) trackedEl.textContent = formatDuration(tracked);

  const goalEl = document.getElementById("momentum-goal");
  if (goalEl) goalEl.textContent = formatDuration(goalMinutes);

  const subEl = document.getElementById("momentum-goal-sub");
  if (subEl) {
    if (summary?.goalMet) {
      subEl.textContent =
        "Goal complete. Anything else today is a bonus.";
    } else if (tracked > 0) {
      const remaining =
        summary?.remainingMinutes ?? Math.max(0, goalMinutes - tracked);
      subEl.textContent = `${formatDuration(remaining)} to go — you're ${percent}% there.`;
    } else {
      subEl.textContent = "Start a focus session to build momentum.";
    }
  }

  const streakEl = document.getElementById("momentum-streak-count");
  if (streakEl) streakEl.textContent = String(summary?.streak ?? 0);

  const goalSelect = document.getElementById("select-daily-goal");
  if (goalSelect) {
    ensureGoalOption(goalSelect, goalHours);
    goalSelect.value = String(goalHours);
    goalSelect.onchange = async () => {
      const next = parseFloat(goalSelect.value);
      await setDailyGoal(next);
      showToast(`Daily focus goal set to ${next}h`, "success");
      renderDashboard();
    };
  }

  const hudBtn = document.getElementById("btn-open-hud");
  if (hudBtn) {
    hudBtn.onclick = () => window.tracker.toggleHud();
  }

  renderFocus3(todayEvents, timerState, allEvents);

  await runCelebrations(summary);
}

function ensureGoalOption(select, hours) {
  const value = String(hours);
  const exists = Array.from(select.options).some((opt) => opt.value === value);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${hours}h goal`;
    select.appendChild(opt);
  }
}

function renderFocus3(todayEvents, timerState, allEvents) {
  const listEl = document.getElementById("focus3-list");
  if (!listEl) return;

  const state = getState();
  const focusIds = getFocus3();
  const lookupEvents = allEvents || todayEvents || [];

  listEl.innerHTML = "";

  if (focusIds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "focus3-empty";
    empty.innerHTML =
      "<p>No Focus 3 yet.</p><span>Star up to three tasks to make today winnable.</span>";
    listEl.appendChild(empty);
  }

  focusIds.forEach((id) => {
    const task = state.trackedTasks[id] || {};
    const event = lookupEvents.find((e) => e.id === id);
    const isUnavailable = !state.trackedTasks[id] && !event;
    const name = isUnavailable
      ? "Task no longer available"
      : (task.name || event?.summary || "Untitled Task").trim();
    const completed = Boolean(task.completed);
    const isTiming =
      timerState?.running &&
      timerState.taskId === id &&
      !timerState.paused;

    const row = document.createElement("div");
    row.className = `focus3-row${completed ? " completed" : ""}${isUnavailable ? " unavailable" : ""}`;
    row.dataset.taskId = id;
    row.innerHTML = isUnavailable
      ? `
      <span class="focus3-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <button class="focus3-btn focus3-remove" data-action="remove" title="Remove from Focus 3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `
      : `
      <button class="focus3-check${completed ? " checked" : ""}" data-action="toggle" title="${completed ? "Mark incomplete" : "Complete task"}"></button>
      <span class="focus3-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      ${
        completed
          ? ""
          : `<button class="focus3-btn focus3-play${isTiming ? " active" : ""}" data-action="start" title="${isTiming ? "Pause timer" : "Start focus session"}">
               ${isTiming ? PAUSE_ICON : PLAY_ICON}
             </button>`
      }
      <button class="focus3-btn focus3-remove" data-action="remove" title="Remove from Focus 3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    const toggleBtn = row.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.addEventListener("click", async () => {
        if (completed) {
          await window.tracker.markTaskIncomplete(id);
        } else {
          await window.tracker.saveTask({
            id,
            name,
            start: event?.start || task.start,
            notes:
              task.notes || task.description || event?.description || "",
            estimateMinutes:
              task.estimateMinutes || event?.durationMinutes || null,
          });
          await window.tracker.markTaskComplete(id);
        }
        setTrackedTasks(await window.tracker.getTasks());
        renderDashboard();
      });
    }

    const playBtn = row.querySelector('[data-action="start"]');
    if (playBtn) {
      playBtn.addEventListener("click", async () => {
        if (isTiming) {
          await window.tracker.pauseTimer();
        } else if (
          timerState?.running &&
          timerState.taskId === id &&
          timerState.paused
        ) {
          await window.tracker.resumeTimer();
        } else {
          await startFocusTask({ id, name }, task.estimateMinutes || null);
        }
        renderDashboard();
      });
    }

    row
      .querySelector('[data-action="remove"]')
      .addEventListener("click", async () => {
        await toggleFocusTask(id);
        renderDashboard();
      });

    listEl.appendChild(row);
  });

  if (focusIds.length < 3) {
    const suggestions = (todayEvents || [])
      .filter((e) => !focusIds.includes(e.id))
      .filter((e) => !state.trackedTasks[e.id]?.completed)
      .slice(0, 3);

    if (suggestions.length > 0) {
      const divider = document.createElement("div");
      divider.className = "focus3-suggestions-label";
      divider.textContent = "Add from today";
      listEl.appendChild(divider);

      suggestions.forEach((event) => {
        const task = state.trackedTasks[event.id] || {};
        const name = (event.summary || task.name || "Untitled Task").trim();
        const row = document.createElement("button");
        row.type = "button";
        row.className = "focus3-suggestion";
        row.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>${escapeHtml(name)}</span>
        `;
        row.addEventListener("click", async () => {
          const result = await toggleFocusTask(event.id);
          if (result.full) {
            showToast("Focus 3 is full — remove one first.", "warning");
          }
          renderDashboard();
        });
        listEl.appendChild(row);
      });
    }
  }
}

/**
 * Render the full dashboard view.
 */
export async function renderDashboard() {
  initDashboardButtons();
  updateDashboardDate();

  const todayStr = getLocalDateString();

  // Get tracking data first to ensure fresh tasks and state
  const tasks = await window.tracker.getTasks();
  setTrackedTasks(tasks || {});

  // Combine calendar events and manual tasks
  const state = getState();
  const allEvents = getCombinedEvents(state.calendarEvents, state.trackedTasks);

  // Get today's events
  const todayEvents = allEvents.filter((e) => {
    const eventDate = getLocalDateString(e.start);
    return eventDate === todayStr;
  });

  // Breaks stay visible in the list but are excluded from analytics counts.
  const countedTodayEvents = todayEvents.filter((e) => !e.isBreak);

  const sessions = await window.tracker.getAllSessions();
  const todaySessions = (sessions || []).filter((s) => {
    return (
      getLocalDateString(s.startTime) === todayStr &&
      !state.trackedTasks[s.taskId]?.isBreak
    );
  });

  // Stat cards
  const totalTasksEl = document.getElementById("stat-total-tasks");
  if (totalTasksEl) totalTasksEl.textContent = countedTodayEvents.length;

  const trackedToday = todaySessions.reduce(
    (sum, s) => sum + (s.durationMinutes || 0),
    0,
  );
  const totalTimeEl = document.getElementById("stat-total-time");
  if (totalTimeEl) totalTimeEl.textContent = formatDuration(trackedToday);

  const completedTodayCount = countedTodayEvents.filter(
    (e) => state.trackedTasks[e.id]?.completed,
  ).length;
  const completedCountEl = document.getElementById("stat-completed-count");
  if (completedCountEl) completedCountEl.textContent = completedTodayCount;

  // Estimated total remaining for uncompleted tasks
  const pendingTodayEvents = countedTodayEvents.filter(
    (e) => !state.trackedTasks[e.id]?.completed,
  );
  const estimatedRemaining = pendingTodayEvents.reduce((sum, e) => {
    const task = state.trackedTasks[e.id];
    const est = task?.estimateMinutes || e.durationMinutes || 0;
    const tracked = task?.totalTrackedMinutes || 0;
    const remaining = Math.max(0, est - tracked);
    return sum + (est > 0 ? (tracked > 0 ? remaining : est) : 0);
  }, 0);
  const estTimeEl = document.getElementById("stat-estimated-time");
  if (estTimeEl) estTimeEl.textContent = formatDuration(estimatedRemaining);

  // Active timer banner
  const timerState = await window.tracker.getTimerState();
  const activeTimerEl = document.getElementById("dashboard-active-timer");
  if (activeTimerEl) {
    if (timerState && timerState.running) {
      activeTimerEl.style.display = "flex";
      const task = timerState.taskId ? state.trackedTasks[timerState.taskId] : null;
      const proj = task?.projectId ? state.customProjects[task.projectId] : null;
      const displayTask = proj
        ? `${proj.name} · ${timerState.taskName}`
        : timerState.taskName;
      document.getElementById("dashboard-timer-task").textContent =
        displayTask;
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

  // Momentum: daily goal + Today's Focus 3
  await renderMomentum(todayEvents, timerState, allEvents);

  // Sort preference setup
  const sortSelect = document.getElementById("select-dashboard-sort");
  if (sortSelect) {
    sortSelect.value = state.taskSortMode;
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

    // Sort todayEvents based on state.taskSortMode
    sortEvents(todayEvents, state);

    const isDraggable = state.taskSortMode === "manual";
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
