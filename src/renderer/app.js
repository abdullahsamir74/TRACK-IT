/* ========================================
   LEARNING TRACKER — App Entry Point
   ======================================== */

// ---- State & Navigation ----
import {
  setCalendarEvents,
  loadData,
  switchView,
  registerViewRenderers,
  renderCurrentView,
} from './state.js';

// ---- Views ----
import { renderDashboard, updateDashboardDate } from './views/dashboard.js';
import { renderSchedule } from './views/schedule.js';
import { initTimerControls, renderTimerView, updateTimerDisplay } from './views/timer.js';
import { initAnalytics, renderAnalytics } from './views/analytics.js';
import { initProjects, renderProjects } from './views/projects.js';

// ---- Components ----
import { initModals } from './components/modals.js';
import { initResetButtons } from './components/confirm-dialog.js';

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
  // Register view renderers (avoids circular imports in state.js)
  registerViewRenderers({
    dashboard: renderDashboard,
    schedule: renderSchedule,
    timer: renderTimerView,
    analytics: renderAnalytics,
    projects: renderProjects,
  });

  // Init UI components
  initTitlebar();
  initNavigation();
  initModals();
  initTimerControls();
  initAnalytics();
  initResetButtons();
  initProjects();

  // Load data & render
  await loadData();
  renderCurrentView();

  // Listen for live calendar updates
  window.tracker.onCalendarUpdated((events) => {
    setCalendarEvents(events);
    renderCurrentView();
  });

  // Listen for timer ticks
  window.tracker.onTimerTick((state) => {
    updateTimerDisplay(state);
  });

  // Update date on dashboard
  updateDashboardDate();
});

// ---- Titlebar ----
function initTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => window.tracker.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.tracker.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.tracker.close());
}

// ---- Navigation ----
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}
