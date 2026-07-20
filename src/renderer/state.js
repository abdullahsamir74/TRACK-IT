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
      currentView: 'dashboard',
      selectedTimerTask: null,
      analyticsChart: null,
      taskOrder: [],
      projectOrder: [],
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

    this.notify();
  }

  /**
   * Subscribe to state updates
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in state subscriber:', err);
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
export let currentView = 'dashboard';
export let selectedTimerTask = null;
export let analyticsChart = null;
export let taskOrder = [];
export let projectOrder = [];

// ---- State setters invoking the store ----
export function setCalendarEvents(val) { storeInstance.updateState({ calendarEvents: val }); }
export function setTrackedTasks(val) { storeInstance.updateState({ trackedTasks: val }); }
export function setCustomProjects(val) { storeInstance.updateState({ customProjects: val }); }
export function setExpandedProjects(val) { storeInstance.updateState({ expandedProjects: val }); }
export function setHabits(val) { storeInstance.updateState({ habits: val }); }
export function setCurrentView(val) { storeInstance.updateState({ currentView: val }); }
export function setSelectedTimerTask(val) { storeInstance.updateState({ selectedTimerTask: val }); }
export function setAnalyticsChart(val) { storeInstance.updateState({ analyticsChart: val }); }
export function setTaskOrder(val) { storeInstance.updateState({ taskOrder: val }); }
export function setProjectOrder(val) { storeInstance.updateState({ projectOrder: val }); }

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
    const [events, tasks, timerState, projects, habitsData] = await Promise.all([
      window.tracker.getCalendarEvents(),
      window.tracker.getTasks(),
      window.tracker.getTimerState(),
      window.tracker.getProjects(),
      window.tracker.getHabits(),
    ]);

    const taskOrderVal = (await window.tracker.getTaskOrder()) || [];
    const projectOrderVal = (await window.tracker.getProjectOrder()) || [];

    storeInstance.updateState({
      calendarEvents: events || [],
      trackedTasks: tasks || {},
      customProjects: projects || {},
      habits: habitsData || {},
      taskOrder: taskOrderVal,
      projectOrder: projectOrderVal
    });

    // Import updateTimerDisplay dynamically to avoid circular dependency
    if (timerState && timerState.running) {
      const { updateTimerDisplay } = await import('./views/timer.js');
      updateTimerDisplay(timerState);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// ---- Navigation ----
export function switchView(viewName) {
  storeInstance.updateState({ currentView: viewName });

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });

  renderCurrentView();
}

export async function renderCurrentView() {
  const renderer = viewRenderers[currentView];
  if (renderer) {
    await renderer();
  }
}
