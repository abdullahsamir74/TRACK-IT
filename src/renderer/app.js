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
} from "./state.js";

// ---- Views ----
import { renderDashboard, updateDashboardDate } from "./views/dashboard.js";
import { renderSchedule } from "./views/schedule.js";
import {
  initTimerControls,
  renderTimerView,
  updateTimerDisplay,
} from "./views/timer.js";
import { initAnalytics, renderAnalytics } from "./views/analytics.js";
import { initProjects, renderProjects } from "./views/projects.js";
import { initHabits, renderHabitsView } from "./views/habits.js";

// ---- Components ----
import { initModals } from "./components/modals.js";
import { initResetButtons } from "./components/confirm-dialog.js";

// ---- Sounds ----
import { playAlarmSound } from "./sounds.js";

// Track whether the estimate-reached alert has already fired for the current session
let estimateAlertFired = false;
let currentAlarm = null;

/** Reset the alert flag (call when a new timer starts or stops). */
export function resetEstimateAlert() {
  estimateAlertFired = false;
  if (currentAlarm) {
    currentAlarm.stop();
    currentAlarm = null;
  }
}

// ---- Initialization ----
async function loadViewTemplates() {
  const [titlebarHtml, sidebarHtml, modalsHtml] = await Promise.all([
    fetch("components/titlebar.html").then((r) => r.text()),
    fetch("components/sidebar.html").then((r) => r.text()),
    fetch("components/modals.html").then((r) => r.text()),
  ]);

  const titlebarSlot = document.getElementById("titlebar-slot");
  const sidebarSlot = document.getElementById("sidebar-slot");
  const modalsSlot = document.getElementById("modals-slot");
  const mainContent = document.getElementById("main-content");

  if (titlebarSlot) titlebarSlot.outerHTML = titlebarHtml;
  if (sidebarSlot) sidebarSlot.outerHTML = sidebarHtml;
  if (modalsSlot) modalsSlot.outerHTML = modalsHtml;

  const views = [
    "dashboard",
    "schedule",
    "timer",
    "analytics",
    "projects",
    "habits",
  ];

  if (mainContent) {
    const viewHtmls = await Promise.all(
      views.map(async (v) => {
        const res = await fetch(`views/${v}.html`);
        return res.text();
      }),
    );
    mainContent.innerHTML = viewHtmls.join("\n");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Load HTML templates dynamically
  await loadViewTemplates();

  // Register view renderers (avoids circular imports in state.js)
  registerViewRenderers({
    dashboard: renderDashboard,
    schedule: renderSchedule,
    timer: renderTimerView,
    analytics: renderAnalytics,
    projects: renderProjects,
    habits: renderHabitsView,
  });

  // Init UI components
  initTitlebar();
  initNavigation();
  initModals();
  initTimerControls();
  initAnalytics();
  initResetButtons();
  initProjects();
  initHabits();

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

    // Play alert sound when the timer reaches the estimate
    if (state.estimateMinutes && state.progress >= 1 && !estimateAlertFired) {
      estimateAlertFired = true;
      currentAlarm = playAlarmSound();
    }
  });

  // Update date on dashboard
  updateDashboardDate();

  // Listen for window resize to handle dynamic chart scaling
  window.addEventListener("resize", () => {
    import("./state.js").then(({ analyticsChart }) => {
      if (analyticsChart && typeof analyticsChart.resize === "function") {
        analyticsChart.resize();
      }
    });
  });
});

// ---- Titlebar & Theme ----
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("tracker-theme", theme);

  const btnToggle = document.getElementById("btn-theme-toggle");
  const moonIcon = btnToggle?.querySelector(".icon-moon");
  const sunIcon = btnToggle?.querySelector(".icon-sun");

  if (moonIcon && sunIcon) {
    if (theme === "light") {
      // In light mode, show moon icon to switch to night mode
      moonIcon.style.display = "block";
      sunIcon.style.display = "none";
      btnToggle.title = "Switch to Night Mode (Dark)";
    } else {
      // In dark mode, show sun icon to switch to day mode
      moonIcon.style.display = "none";
      sunIcon.style.display = "block";
      btnToggle.title = "Switch to Day Mode (Light)";
    }
  }

  renderCurrentView();
}

function initTheme() {
  const savedTheme = localStorage.getItem("tracker-theme") || "dark";
  applyTheme(savedTheme);
}

function initTitlebar() {
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const btnMin = document.getElementById("btn-minimize");
  const btnMax = document.getElementById("btn-maximize");
  const btnClose = document.getElementById("btn-close");

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = current === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
    });
  }

  if (btnMin) btnMin.addEventListener("click", () => window.tracker.minimize());
  if (btnMax) btnMax.addEventListener("click", () => window.tracker.maximize());
  if (btnClose)
    btnClose.addEventListener("click", () => window.tracker.close());

  initTheme();
}

// ---- Navigation ----
function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}
