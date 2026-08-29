/* ========================================
   VIEW — Settings & Data Management
   ======================================== */

import { applyTheme } from "../app.js";
import { updateAppBadge } from "../badge.js";
import {
  trackedTasks,
  customProjects,
  habits,
  allSessions,
  setTrackedTasks,
  setCustomProjects,
  setHabits,
  setAllSessions,
  renderCurrentView,
  loadData,
} from "../state.js";
import { showConfirmDialog } from "../components/confirm-dialog.js";
import { showToast } from "../components/toast.js";

let settingsInitialized = false;

export function initSettings() {
  if (settingsInitialized) return;
  settingsInitialized = true;

  // Theme select
  const themeSelect = document.getElementById("settings-theme-select");
  if (themeSelect) {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    themeSelect.value = currentTheme;
    themeSelect.addEventListener("change", () => {
      applyTheme(themeSelect.value);
    });
  }

  // Sound toggle
  const soundToggle = document.getElementById("settings-sounds-toggle");
  if (soundToggle) {
    const soundEnabled = localStorage.getItem("tracker-sounds-enabled") !== "false";
    soundToggle.checked = soundEnabled;
    soundToggle.addEventListener("change", () => {
      localStorage.setItem("tracker-sounds-enabled", soundToggle.checked ? "true" : "false");
      showToast(soundToggle.checked ? "Sound effects enabled" : "Sound effects muted", "info");
    });
  }

  // Badge mode select
  const badgeSelect = document.getElementById("settings-badge-select");
  if (badgeSelect) {
    const savedBadgeMode = localStorage.getItem("tracker-badge-mode") || "pending";
    badgeSelect.value = savedBadgeMode;
    badgeSelect.addEventListener("change", async () => {
      localStorage.setItem("tracker-badge-mode", badgeSelect.value);
      await updateAppBadge();
      showToast("App icon badge preference updated! 🔔", "success");
    });
  }

  // Export Backup
  const btnExport = document.getElementById("btn-export-backup");
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      try {
        const backup = await window.tracker.exportBackup();
        const jsonStr = JSON.stringify(backup, null, 2);

        // Download via browser blob
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `track-it-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        showToast("Backup exported successfully! 📁", "success");
      } catch (err) {
        console.error("Export error:", err);
        showToast("Failed to export backup", "error");
      }
    });
  }

  // Import Backup
  const btnImport = document.getElementById("btn-import-backup");
  const fileImport = document.getElementById("file-import-backup");

  if (btnImport && fileImport) {
    btnImport.addEventListener("click", () => {
      fileImport.click();
    });

    fileImport.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const payload = JSON.parse(text);

        showConfirmDialog({
          title: "Restore Backup?",
          message:
            "This will merge or restore data from the selected backup file into your database. Continue?",
          confirmText: "Restore Data",
          onConfirm: async () => {
            await window.tracker.importBackup(payload);
            await loadData();
            showToast("Backup restored successfully! 🎉", "success");
            renderCurrentView();
          },
        });
      } catch (err) {
        console.error("Import error:", err);
        showToast("Invalid backup file format", "error");
      } finally {
        fileImport.value = "";
      }
    });
  }

  // Scoped Resets
  const btnResetSessions = document.getElementById("btn-reset-sessions-only");
  if (btnResetSessions) {
    btnResetSessions.addEventListener("click", () => {
      showConfirmDialog({
        title: "Clear Time Logs?",
        message:
          "This will delete all recorded time logs and session history. Your tasks, projects, estimates, and task completion statuses will <strong>not</strong> be affected.",
        confirmText: "Clear Logs Only",
        onConfirm: async () => {
          await window.tracker.resetData("sessions_only");
          await loadData();
          showToast("Time logs cleared safely", "success");
          renderCurrentView();
        },
      });
    });
  }

  const btnResetHabits = document.getElementById("btn-reset-habits-only");
  if (btnResetHabits) {
    btnResetHabits.addEventListener("click", () => {
      showConfirmDialog({
        title: "Clear Habits?",
        message: "This will delete all habit trackers and their completion logs.",
        confirmText: "Clear Habits",
        onConfirm: async () => {
          await window.tracker.resetData("habits_only");
          await loadData();
          showToast("Habits cleared", "success");
          renderCurrentView();
        },
      });
    });
  }

  const btnFactoryReset = document.getElementById("btn-factory-reset");
  if (btnFactoryReset) {
    btnFactoryReset.addEventListener("click", () => {
      showConfirmDialog({
        title: "Factory Reset All Data?",
        message:
          "⚠️ <strong style='color:var(--accent-danger);'>DANGER:</strong> This will permanently delete ALL local tasks, projects, time logs, habits, and preferences. GNOME Calendar events will remain untouched.",
        confirmText: "Factory Reset Everything",
        onConfirm: async () => {
          await window.tracker.resetData("all");
          await loadData();
          showToast("All data reset to defaults", "warning");
          renderCurrentView();
        },
      });
    });
  }
}

export async function renderSettings() {
  initSettings();

  // Update DB stats counts
  const tasks = await window.tracker.getTasks();
  const sessions = await window.tracker.getAllSessions();
  const projects = await window.tracker.getProjects();
  const habitsData = await window.tracker.getHabits();

  const countTasksEl = document.getElementById("db-stat-tasks");
  const countSessionsEl = document.getElementById("db-stat-sessions");
  const countProjectsEl = document.getElementById("db-stat-projects");
  const countHabitsEl = document.getElementById("db-stat-habits");

  if (countTasksEl) countTasksEl.textContent = Object.keys(tasks || {}).length;
  if (countSessionsEl) countSessionsEl.textContent = (sessions || []).length;
  if (countProjectsEl) countProjectsEl.textContent = Object.keys(projects || {}).length;
  if (countHabitsEl) countHabitsEl.textContent = Object.keys(habitsData || {}).length;

  const themeSelect = document.getElementById("settings-theme-select");
  if (themeSelect) {
    themeSelect.value = document.documentElement.getAttribute("data-theme") || "dark";
  }

  const badgeSelect = document.getElementById("settings-badge-select");
  if (badgeSelect) {
    badgeSelect.value = localStorage.getItem("tracker-badge-mode") || "pending";
  }
}
