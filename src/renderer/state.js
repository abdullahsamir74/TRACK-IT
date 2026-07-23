/* ========================================
   STATE — Shared application state & data
   ======================================== */

// Centralized State Store implementation
class Store {
  constructor() {
    this.state = {
      calendarEvents: [],
      trackedTasks: {},
      customProjects: {},
      expandedProjects: {},
      habits: {},
      currentView: "dashboard",
      selectedTimerTask: null,
      analyticsChart: null,
      taskOrder: [],
      projectOrder: [],
      weeklyTargets: {},
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
    currentView = this.state.currentView;
    selectedTimerTask = this.state.selectedTimerTask;
    analyticsChart = this.state.analyticsChart;
    taskOrder = this.state.taskOrder;
    projectOrder = this.state.projectOrder;
    weeklyTargets = this.state.weeklyTargets;

    this.notify();
  }

  /**
   * Subscribe to state updates
   */
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
export let currentView = "dashboard";
export let selectedTimerTask = null;
export let analyticsChart = null;
export let taskOrder = [];
export let projectOrder = [];
export let weeklyTargets = {};

// ---- State setters invoking the store ----
export function setCalendarEvents(val) {
  storeInstance.updateState({ calendarEvents: val });
}
export function setTrackedTasks(val) {
  storeInstance.updateState({ trackedTasks: val });
}
export function setCustomProjects(val) {
  storeInstance.updateState({ customProjects: val });
}
export function setExpandedProjects(val) {
  storeInstance.updateState({ expandedProjects: val });
}
export function setHabits(val) {
  storeInstance.updateState({ habits: val });
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
  storeInstance.updateState({ taskOrder: val });
}
export function setProjectOrder(val) {
  storeInstance.updateState({ projectOrder: val });
}
export function setWeeklyTargets(val) {
  storeInstance.updateState({ weeklyTargets: val });
}

// Expose store subscription if views want to register reactive updates
export const subscribeToState = (listener) => storeInstance.subscribe(listener);

// ---- View registry (populated by app.js to avoid circular imports) ----
let viewRenderers = {};

export function registerViewRenderers(renderers) {
  viewRenderers = renderers;
}

// ---- Data Loading ----
export async function loadData() {
  try {
    const [events, tasks, timerState, projects, habitsData, targets] =
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
      ]);

    const taskOrderVal =
      (await window.tracker.getTaskOrder().catch(() => [])) || [];
    const projectOrderVal =
      (await window.tracker.getProjectOrder().catch(() => [])) || [];

    // Sanitize legacy purple project colors
    if (projects) {
      Object.values(projects).forEach((proj) => {
        if (proj.color === "#7c6ef0" || proj.color === "#6b5ce0") {
          proj.color = "#38bdf8";
          window.tracker.saveProject(proj).catch(() => {});
        }
      });
    }

    storeInstance.updateState({
      calendarEvents: events || [],
      trackedTasks: tasks || {},
      customProjects: projects || {},
      habits: habitsData || {},
      taskOrder: taskOrderVal,
      projectOrder: projectOrderVal,
      weeklyTargets: targets || {},
    });

    // Import updateTimerDisplay dynamically to avoid circular dependency
    if (timerState && timerState.running) {
      const { updateTimerDisplay } = await import("./views/timer.js");
      updateTimerDisplay(timerState);
    }
  } catch (err) {
    console.error("Error loading data:", err);
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
  const renderer = viewRenderers[currentView];
  if (renderer) {
    await renderer();
  }
}
