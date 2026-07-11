/* ========================================
   STATE — Shared application state & data
   ======================================== */

// ---- Mutable shared state ----
export let calendarEvents = [];
export let trackedTasks = {};
export let customProjects = {};
export let expandedProjects = {};
export let currentView = 'dashboard';
export let selectedTimerTask = null;
export let analyticsChart = null;
export let taskOrder = [];
export let projectOrder = [];

// ---- State setters (needed because ES module exports are live bindings) ----
export function setCalendarEvents(val) { calendarEvents = val; }
export function setTrackedTasks(val) { trackedTasks = val; }
export function setCustomProjects(val) { customProjects = val; }
export function setExpandedProjects(val) { expandedProjects = val; }
export function setCurrentView(val) { currentView = val; }
export function setSelectedTimerTask(val) { selectedTimerTask = val; }
export function setAnalyticsChart(val) { analyticsChart = val; }
export function setTaskOrder(val) { taskOrder = val; }
export function setProjectOrder(val) { projectOrder = val; }

// ---- View registry (populated by app.js to avoid circular imports) ----
let viewRenderers = {};

export function registerViewRenderers(renderers) {
  viewRenderers = renderers;
}

// ---- Data Loading ----
export async function loadData() {
  try {
    const [events, tasks, timerState, projects] = await Promise.all([
      window.tracker.getCalendarEvents(),
      window.tracker.getTasks(),
      window.tracker.getTimerState(),
      window.tracker.getProjects(),
    ]);

    calendarEvents = events || [];
    trackedTasks = tasks || {};
    customProjects = projects || {};
    taskOrder = (await window.tracker.getTaskOrder()) || [];
    projectOrder = (await window.tracker.getProjectOrder()) || [];

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
  currentView = viewName;

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
