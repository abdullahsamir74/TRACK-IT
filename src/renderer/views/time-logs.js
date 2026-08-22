/* ========================================
   VIEW — Time Logs & Session History
   ======================================== */

import { formatDuration, escapeHtml, getLocalDateString } from "../utils.js";
import {
  allSessions,
  setAllSessions,
  customProjects,
  trackedTasks,
  setTrackedTasks,
  renderCurrentView,
} from "../state.js";
import { openLogTimeModal, openEditTimeEntryModal } from "../components/modals.js";
import { showConfirmDialog } from "../components/confirm-dialog.js";
import { showToast } from "../components/toast.js";

let timeLogsInitialized = false;

export function initTimeLogs() {
  if (timeLogsInitialized) return;
  timeLogsInitialized = true;

  const btnLogPast = document.getElementById("btn-log-past-time");
  if (btnLogPast) {
    btnLogPast.addEventListener("click", () => {
      openLogTimeModal();
    });
  }

  const rangeSelect = document.getElementById("time-logs-range");
  if (rangeSelect) {
    rangeSelect.addEventListener("change", () => renderTimeLogs());
  }

  const projSelect = document.getElementById("time-logs-project-filter");
  if (projSelect) {
    projSelect.addEventListener("change", () => renderTimeLogs());
  }

  const searchInput = document.getElementById("time-logs-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderTimeLogs());
  }
}

export async function renderTimeLogs() {
  initTimeLogs();

  const container = document.getElementById("time-logs-list");
  if (!container) return;

  // Refresh sessions from backend
  const sessions = (await window.tracker.getAllSessions()) || [];
  setAllSessions(sessions);

  // Populate Project filter dropdown
  const projSelect = document.getElementById("time-logs-project-filter");
  if (projSelect) {
    const currentVal = projSelect.value;
    projSelect.innerHTML = `<option value="all">All Projects</option>`;
    Object.values(customProjects).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === currentVal) opt.selected = true;
      projSelect.appendChild(opt);
    });
  }

  const rangeVal = document.getElementById("time-logs-range")?.value || "this_week";
  const projectVal = projSelect?.value || "all";
  const searchVal = document.getElementById("time-logs-search")?.value.toLowerCase().trim() || "";

  // Date range filtering
  const now = new Date();
  const todayStr = getLocalDateString(now);
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  let startDateStr = null;
  let endDateStr = null;

  if (rangeVal === "today") {
    startDateStr = todayStr;
    endDateStr = todayStr;
  } else if (rangeVal === "yesterday") {
    startDateStr = yesterdayStr;
    endDateStr = yesterdayStr;
  } else if (rangeVal === "this_week") {
    const sun = new Date(now);
    sun.setDate(now.getDate() - now.getDay());
    startDateStr = getLocalDateString(sun);
  } else if (rangeVal === "last_7_days") {
    const past7 = new Date(now);
    past7.setDate(now.getDate() - 6);
    startDateStr = getLocalDateString(past7);
  } else if (rangeVal === "this_month") {
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateStr = getLocalDateString(mStart);
  }

  const filtered = sessions.filter((s) => {
    const sDate = getLocalDateString(s.startTime);
    if (startDateStr && sDate < startDateStr) return false;
    if (endDateStr && sDate > endDateStr) return false;

    if (projectVal !== "all") {
      const task = s.taskId ? trackedTasks[s.taskId] : null;
      const pId = s.projectId || (task && task.projectId);
      if (pId !== projectVal) return false;
    }

    if (searchVal) {
      const matchName = (s.taskName || "").toLowerCase().includes(searchVal);
      const matchNote = (s.notes || "").toLowerCase().includes(searchVal);
      if (!matchName && !matchNote) return false;
    }

    return true;
  });

  // Calculate summary KPI
  const totalMins = filtered.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalTimeEl = document.getElementById("logs-total-time");
  const totalCountEl = document.getElementById("logs-total-count");
  if (totalTimeEl) totalTimeEl.textContent = formatDuration(totalMins);
  if (totalCountEl) totalCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p>No time logs found</p>
        <span>Start the timer or click "Log Past Time" to record work history</span>
      </div>
    `;
    return;
  }

  // Group filtered sessions by day
  const groups = {};
  for (const s of filtered) {
    const dayKey = getLocalDateString(s.startTime);
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(s);
  }

  const sortedDays = Object.keys(groups).sort((a, b) => (b > a ? 1 : -1));

  container.innerHTML = "";

  for (const dayKey of sortedDays) {
    const daySessions = groups[dayKey];
    const dayTotalMins = daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

    let dayHeading = dayKey;
    if (dayKey === todayStr) {
      dayHeading = `Today — ${formatReadableDate(dayKey)}`;
    } else if (dayKey === yesterdayStr) {
      dayHeading = `Yesterday — ${formatReadableDate(dayKey)}`;
    } else {
      dayHeading = formatReadableDate(dayKey);
    }

    const groupSection = document.createElement("div");
    groupSection.className = "time-logs-day-group";
    groupSection.innerHTML = `
      <div class="day-group-header">
        <span class="day-group-title">${dayHeading}</span>
        <span class="day-group-total">${formatDuration(dayTotalMins)}</span>
      </div>
      <div class="day-group-items"></div>
    `;

    const itemsContainer = groupSection.querySelector(".day-group-items");

    for (const session of daySessions) {
      const card = createSessionCard(session);
      itemsContainer.appendChild(card);
    }

    container.appendChild(groupSection);
  }
}

function formatReadableDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function createSessionCard(session) {
  const card = document.createElement("div");
  card.className = "session-card";
  card.dataset.sessionId = session.id;

  const startFormatted = formatTime(session.startTime);
  const endFormatted = formatTime(session.endTime);
  const timeRangeStr = startFormatted && endFormatted ? `${startFormatted} – ${endFormatted}` : startFormatted;

  let typeBadge = `<span class="entry-type-badge type-timer">⏱️ Timer</span>`;
  if (session.entryType === "pomodoro") {
    typeBadge = `<span class="entry-type-badge type-pomodoro">🍅 Pomodoro</span>`;
  } else if (session.entryType === "manual") {
    typeBadge = `<span class="entry-type-badge type-manual">✍️ Manual</span>`;
  }

  const projName = session.projectName || (session.projectId && customProjects[session.projectId]?.name) || null;
  const projColor = session.projectColor || (session.projectId && customProjects[session.projectId]?.color) || "#38bdf8";

  const projectTag = projName
    ? `<span class="session-project-tag" style="color: ${projColor}; border-color: ${projColor}40; background: ${projColor}15;">${escapeHtml(projName)}</span>`
    : "";

  card.innerHTML = `
    <div class="session-card-left">
      <div class="session-color-dot" style="background: ${projColor};"></div>
      <div class="session-main-info">
        <div class="session-task-title">
          <span>${escapeHtml(session.taskName || "Untitled Task")}</span>
          ${projectTag}
          ${typeBadge}
        </div>
        <div class="session-meta-row">
          <span class="session-time-range">${timeRangeStr}</span>
          ${session.notes ? `<span class="session-notes-snippet" title="${escapeHtml(session.notes)}">📝 ${escapeHtml(session.notes)}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="session-card-right">
      <span class="session-duration-pill">${formatDuration(session.durationMinutes)}</span>
      <div class="session-actions">
        <button class="btn-icon btn-edit-session" title="Edit session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon btn-icon-danger btn-delete-session" title="Delete session safely">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `;

  // Edit handler
  card.querySelector(".btn-edit-session").addEventListener("click", () => {
    openEditTimeEntryModal(session);
  });

  // Delete handler
  card.querySelector(".btn-delete-session").addEventListener("click", () => {
    showConfirmDialog({
      title: "Delete Time Entry?",
      message: `Are you sure you want to delete this <strong>${formatDuration(session.durationMinutes)}</strong> entry for "<strong>${escapeHtml(session.taskName)}</strong>"?<br><br><span style="color:var(--text-secondary); font-size:12px;">Note: Your task completion status and estimates will NOT be affected.</span>`,
      confirmText: "Delete Entry",
      onConfirm: async () => {
        const deleted = await window.tracker.deleteSession(session.id);
        if (deleted) {
          showToast("Time entry deleted safely", "success");
          // Refresh data
          setTrackedTasks(await window.tracker.getTasks());
          renderCurrentView();
        }
      },
    });
  });

  return card;
}
