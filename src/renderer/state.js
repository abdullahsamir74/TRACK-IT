/* ========================================
   STATE — Shared application state & data
   ======================================== */

import { updateAppBadge } from "./badge.js";

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

    // Synchronize live bindings
    calendarEvents = this.state.calendarEvents;
    trackedTasks = this.state.trackedTasks;
    customProjects = this.state.customProjects;
    expandedProjects = this.state.expandedProjects;
    habits = this.state.habits;
    allSessions = this.state.allSessions;
    currentView = this.state.currentView;
    selectedTimerTask = this.state.selectedTimerTask;
    analyticsChart = this.state.analyticsChart;
    taskOrder = this.state.taskOrder;
    projectOrder = this.state.projectOrder;
    weeklyTargets = this.state.weeklyTargets;
    taskSortMode = this.state.taskSortMode;

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

// ---- Mutable live bindings for external module imports ----
export let calendarEvents = [];
export let trackedTasks = {};
export let customProjects = {};
export let expandedProjects = {};
export let habits = {};
export let allSessions = [];
export let currentView = "dashboard";
export let selectedTimerTask = null;
export let analyticsChart = null;
export let taskOrder = [];
export let projectOrder = [];
export let weeklyTargets = {};
export let taskSortMode = "manual";

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
export function setCurrentView(val) {
  storeInstance.updateState({ currentView: val });
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

export const subscribeToState = (listener) => storeInstance.subscribe(listener);

// ---- View registry ----
let viewRenderers = {};

export function registerViewRenderers(renderers) {
  viewRenderers = renderers;
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
  const renderer = viewRenderers[currentView];
  if (renderer) {
    await renderer();
  }
  import("./components/custom-dropdown.js")
    .then(({ attachCustomDropdowns }) => {
      attachCustomDropdowns();
    })
    .catch(() => {});
}
