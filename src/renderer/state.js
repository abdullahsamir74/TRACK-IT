/* ========================================
   STATE — Shared application state & data
   ======================================== */

import { updateAppBadge } from "./badge.js";
import { showToast } from "./components/toast.js";
import { getLocalDateString } from "./utils.js";

class Store {
  constructor() {
    this.state = {
      calendarEvents: [],
      trackedTasks: {},
      customProjects: {},
      expandedProjects: {},
      habits: {},
      allSessions: [],
      currentView: "dashboard",
      selectedTimerTask: null,
      analyticsChart: null,
      taskOrder: [],
      projectOrder: [],
      weeklyTargets: {},
      taskSortMode: "manual",
      focus3: [],
      focus3Date: null,
      dailyGoalHours: 4,
      todaySummary: null,
    };
    this.listeners = [];
  }

  getState() {
    return this.state;
  }

  /**
   * Update state fields and synchronize live bindings
   */
  updateState(newState) {
    this.state = { ...this.state, ...newState };

    updateAppBadge().catch((err) =>
      console.error("Error updating app badge from state:", err),
    );

    this.notify();
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("Error in state subscriber:", err);
      }
    }
  }
}

const storeInstance = new Store();

// ---- State accessor (replaces broken ES module live bindings) ----
// Usage: import { getState } from "./state.js"; then getState().trackedTasks
export function getState() {
  return storeInstance.state;
}

// ---- State setters invoking the store ----
export function setCalendarEvents(val) {
  storeInstance.updateState({ calendarEvents: val || [] });
}
export function setTrackedTasks(val) {
  storeInstance.updateState({ trackedTasks: val || {} });
}
export function setCustomProjects(val) {
  storeInstance.updateState({ customProjects: val || {} });
}
export function setExpandedProjects(val) {
  storeInstance.updateState({ expandedProjects: val || {} });
}
export function setHabits(val) {
  storeInstance.updateState({ habits: val || {} });
}
export function setAllSessions(val) {
  storeInstance.updateState({ allSessions: val || [] });
}
export function setSelectedTimerTask(val) {
  storeInstance.updateState({ selectedTimerTask: val });
}
export function setAnalyticsChart(val) {
  storeInstance.updateState({ analyticsChart: val });
}
export function setTaskOrder(val) {
  storeInstance.updateState({ taskOrder: val || [] });
}
export function setProjectOrder(val) {
  storeInstance.updateState({ projectOrder: val || [] });
}
export function setWeeklyTargets(val) {
  storeInstance.updateState({ weeklyTargets: val || {} });
}
export function setTaskSortMode(val) {
  storeInstance.updateState({ taskSortMode: val || "manual" });
}
export function setFocus3(val) {
  storeInstance.updateState({
    focus3: Array.isArray(val) ? val.slice(0, 3) : [],
  });
}
export function setFocus3Date(val) {
  storeInstance.updateState({ focus3Date: val || null });
}
export function setDailyGoalHours(val) {
  const num = parseFloat(val);
  storeInstance.updateState({
    dailyGoalHours: Number.isFinite(num) && num >= 0 ? num : 4,
  });
}
export function setTodaySummary(val) {
  storeInstance.updateState({ todaySummary: val || null });
}


// ---- View registry ----
let viewRenderers = {};

export function registerViewRenderers(renderers) {
  viewRenderers = renderers;
}

// ---- Focus preferences (daily goal + today's Focus 3) ----
export async function loadFocusSettings() {
  const todayKey = getLocalDateString();
  try {
    const [focus3Raw, goalRaw] = await Promise.all([
      window.tracker.getSetting(`focus3_${todayKey}`, "[]"),
      window.tracker.getSetting("daily_focus_goal_hours", "4"),
    ]);

    let focus3 = [];
    try {
      const parsed = JSON.parse(focus3Raw);
      if (Array.isArray(parsed)) focus3 = parsed.filter(Boolean).slice(0, 3);
    } catch {
      focus3 = [];
    }

    const goal = parseFloat(goalRaw);
    storeInstance.updateState({
      focus3,
      focus3Date: todayKey,
      dailyGoalHours: Number.isFinite(goal) && goal >= 0 ? goal : 4,
    });
  } catch (err) {
    console.error("Failed to load focus settings:", err);
  }
}

// ---- Data Loading ----
export async function loadData() {
  try {
    const [events, tasks, timerState, projects, habitsData, targets, sessions] =
      await Promise.all([
        window.tracker.getCalendarEvents().catch((err) => {
          console.error("Failed to load calendar events:", err);
          return [];
        }),
        window.tracker.getTasks().catch((err) => {
          console.error("Failed to load tasks:", err);
          return {};
        }),
        window.tracker.getTimerState().catch((err) => {
          console.error("Failed to load timer state:", err);
          return null;
        }),
        window.tracker.getProjects().catch((err) => {
          console.error("Failed to load projects:", err);
          return {};
        }),
        window.tracker.getHabits().catch((err) => {
          console.error("Failed to load habits:", err);
          return {};
        }),
        window.tracker.getWeeklyTargets().catch((err) => {
          console.error("Failed to load weekly targets:", err);
          return {};
        }),
        window.tracker.getAllSessions().catch((err) => {
          console.error("Failed to load sessions:", err);
          return [];
        }),
      ]);

    const taskOrderVal =
      (await window.tracker.getTaskOrder().catch(() => [])) || [];
    const projectOrderVal =
      (await window.tracker.getProjectOrder().catch(() => [])) || [];
    const taskSortModeVal =
      (await window.tracker.getTaskSortMode().catch(() => "manual")) || "manual";

    storeInstance.updateState({
      calendarEvents: events || [],
      trackedTasks: tasks || {},
      customProjects: projects || {},
      habits: habitsData || {},
      allSessions: sessions || [],
      taskOrder: taskOrderVal,
      projectOrder: projectOrderVal,
      weeklyTargets: targets || {},
      taskSortMode: taskSortModeVal,
    });

    await loadFocusSettings();
    updateStreakCount();

    if (timerState && timerState.running) {
      const { updateTimerDisplay } = await import("./views/timer.js");
      updateTimerDisplay(timerState);
    }
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

/**
 * Update the global streak badge count in the sidebar
 */
export async function updateStreakCount() {
  const streakEl = document.getElementById("streak-count");
  if (!streakEl) return;
  try {
    const analytics = await window.tracker.getAnalytics("week");
    streakEl.textContent = analytics.streak || 0;
  } catch (e) {
    console.error("Error updating sidebar streak:", e);
  }
}

// ---- Navigation ----
export function switchView(viewName) {
  storeInstance.updateState({ currentView: viewName });

  // Update nav buttons
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${viewName}`);
  });

  renderCurrentView();
}

export async function renderCurrentView() {
  updateStreakCount();
  const viewName = getState().currentView;
  const renderer = viewRenderers[viewName];
  if (renderer) {
    // A single failing view must never blank the whole app.
    try {
      await renderer();
    } catch (err) {
      console.error(`Failed to render view "${viewName}":`, err);
      showToast(`Could not load the "${viewName}" view.`, "error");
    }
  }
  import("./components/custom-dropdown.js")
    .then(({ attachCustomDropdowns }) => {
      attachCustomDropdowns();
    })
    .catch(() => {});
}
