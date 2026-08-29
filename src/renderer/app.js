/* ========================================
   TRACK IT — App Entry Point
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
import { initTimeLogs, renderTimeLogs } from "./views/time-logs.js";
import { initAnalytics, renderAnalytics } from "./views/analytics.js";
import { initProjects, renderProjects } from "./views/projects.js";
import { initHabits, renderHabitsView } from "./views/habits.js";
import { renderCalendar } from "./views/calendar.js";
import { initSettings, renderSettings } from "./views/settings.js";

// ---- Components ----
import { initModals } from "./components/modals.js";
import { initCustomPickers } from "./components/custom-pickers.js";
import { initKeyboardShortcuts } from "./components/shortcuts.js";
import {
  initCustomDropdowns,
  attachCustomDropdowns,
} from "./components/custom-dropdown.js";

// ---- Sounds ----
import { playAlarmSound } from "./sounds.js";

// ---- Badging & Notifications ----
import { initBadgeEngine, updateAppBadge } from "./badge.js";

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
    "calendar",
    "timer",
    "time-logs",
    "projects",
    "habits",
    "analytics",
    "settings",
  ];

  if (mainContent) {
    const viewHtmls = await Promise.all(
      views.map(async (v) => {
        try {
          const res = await fetch(`views/${v}.html`);
          return await res.text();
        } catch (e) {
          console.error(`Failed to load view template ${v}:`, e);
          return "";
        }
      }),
    );
    mainContent.innerHTML = viewHtmls.join("\n");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Load HTML templates dynamically
  await loadViewTemplates();

  // Register view renderers
  registerViewRenderers({
    dashboard: renderDashboard,
    schedule: renderSchedule,
    calendar: renderCalendar,
    timer: renderTimerView,
    "time-logs": renderTimeLogs,
    projects: renderProjects,
    habits: renderHabitsView,
    analytics: renderAnalytics,
    settings: renderSettings,
  });

  // Init UI components
  initTitlebar();
  initNavigation();
  initModals();
  initCustomPickers();
  initKeyboardShortcuts();
  initCustomDropdowns();
  initTimerControls();
  initTimeLogs();
  initAnalytics();
  initProjects();
  initHabits();
  initSettings();
  initBadgeEngine();

  // Load data & render
  await loadData();
  renderCurrentView();
  updateAppBadge();

  // Listen for live calendar updates
  window.tracker.onCalendarUpdated((events) => {
    setCalendarEvents(events);
    renderCurrentView();
  });

  // Listen for timer ticks
  window.tracker.onTimerTick((state) => {
    updateTimerDisplay(state);

    // Play alert sound when the timer reaches the estimate
    const soundEnabled = localStorage.getItem("tracker-sounds-enabled") !== "false";
    if (soundEnabled && state.estimateMinutes && state.progress >= 1 && !estimateAlertFired) {
      estimateAlertFired = true;
      currentAlarm = playAlarmSound();
    }
  });

  // Update date on dashboard
  updateDashboardDate();

  // Listen for window resize
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
      moonIcon.style.display = "block";
      sunIcon.style.display = "none";
      btnToggle.title = "Switch to Night Mode (Dark)";
    } else {
      moonIcon.style.display = "none";
      sunIcon.style.display = "block";
      btnToggle.title = "Switch to Day Mode (Light)";
    }
  }

  const settingsThemeSelect = document.getElementById("settings-theme-select");
  if (settingsThemeSelect && settingsThemeSelect.value !== theme) {
    settingsThemeSelect.value = theme;
  }

  renderCurrentView();
}

function initTheme() {
  const savedTheme = localStorage.getItem("tracker-theme") || "dark";
  applyTheme(savedTheme);
}

function updateMaximizeButton(isMaximized) {
  const btnMax = document.getElementById("btn-maximize");
  if (!btnMax) return;
  const iconMax = btnMax.querySelector(".icon-maximize");
  const iconRestore = btnMax.querySelector(".icon-restore");

  if (isMaximized) {
    btnMax.title = "Restore";
    if (iconMax) iconMax.style.display = "none";
    if (iconRestore) iconRestore.style.display = "block";
  } else {
    btnMax.title = "Maximize";
    if (iconMax) iconMax.style.display = "block";
    if (iconRestore) iconRestore.style.display = "none";
  }
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
  if (btnMax) {
    btnMax.addEventListener("click", () => window.tracker.maximize());
    if (window.tracker && window.tracker.isMaximized) {
      window.tracker.isMaximized().then((isMax) => {
        updateMaximizeButton(isMax);
      });
    }
  }
  if (btnClose)
    btnClose.addEventListener("click", () => window.tracker.close());

  if (window.tracker && window.tracker.onMaximizedChange) {
    window.tracker.onMaximizedChange((isMaximized) => {
      updateMaximizeButton(isMaximized);
    });
  }

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
