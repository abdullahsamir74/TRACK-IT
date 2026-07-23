import { formatDuration, escapeHtml, getLocalDateString } from "../utils.js";
import { analyticsChart, setAnalyticsChart } from "../state.js";
import {
  openGlobalTargetModal,
  openEditProjectModal,
} from "../components/modals.js";

/**
 * Initialize analytics range selector and global target button.
 */
export function initAnalytics() {
  const rangeEl = document.getElementById("analytics-range");
  if (rangeEl) {
    rangeEl.addEventListener("change", () => {
      renderAnalytics();
    });
  }

  const btnGlobalTarget = document.getElementById("btn-edit-global-target");
  if (btnGlobalTarget) {
    btnGlobalTarget.addEventListener("click", () => {
      openGlobalTargetModal();
    });
  }
}

/**
 * Render the full analytics view.
 */
export async function renderAnalytics() {
  const rangeEl = document.getElementById("analytics-range");
  const range = rangeEl ? rangeEl.value : "week";

  try {
    const analytics = await window.tracker.getAnalytics(range);
    if (!analytics) return;

    // Summary stats
    const totalHoursEl = document.getElementById("analytics-total-hours");
    if (totalHoursEl) {
      totalHoursEl.textContent = formatDuration(
        analytics.totalTrackedMinutes || 0,
      );
    }

    const totalSessionsEl = document.getElementById("analytics-total-sessions");
    if (totalSessionsEl) {
      totalSessionsEl.textContent = analytics.totalSessions || 0;
    }

    const completionRateEl = document.getElementById(
      "analytics-completion-rate",
    );
    if (completionRateEl) {
      const rate =
        analytics.totalTaskCount > 0
          ? Math.round(
              (analytics.completedCount / analytics.totalTaskCount) * 100,
            )
          : 0;
      completionRateEl.textContent = `${rate}%`;
    }

    const avgDailyEl = document.getElementById("analytics-avg-daily");
    if (avgDailyEl) {
      const days =
        analytics.daily && analytics.daily.length > 0
          ? analytics.daily.length
          : 1;
      const avgMins = (analytics.totalTrackedMinutes || 0) / days;
      avgDailyEl.textContent = formatDuration(avgMins);
    }

    renderChart(analytics.daily || []);
    renderTopTasks(analytics.taskStats || []);
    renderHeatmap(analytics.heatmapData || {});
    await renderWeeklyTargets(analytics);
  } catch (err) {
    console.error("Failed to render analytics:", err);
  }
}

/**
 * Render 365-day GitHub-style Activity Heatmap.
 */
function renderHeatmap(heatmapData) {
  const gridEl = document.getElementById("heatmap-grid");
  const monthsHeaderEl = document.getElementById("heatmap-months-header");
  if (!gridEl) return;

  gridEl.innerHTML = "";
  if (monthsHeaderEl) monthsHeaderEl.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  // Start date: Jan 1st of current year aligned to nearest Sunday
  const startDate = new Date(currentYear, 0, 1);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  // End date: Dec 31st of current year aligned to nearest Saturday
  const endDate = new Date(currentYear, 11, 31);
  while (endDate.getDay() !== 6) {
    endDate.setDate(endDate.getDate() + 1);
  }

  let activeDaysCount = 0;
  let totalDays = 0;
  let maxStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;

  const monthLabels = [];
  let lastMonth = -1;
  let colIndex = 1;

  const tempDate = new Date(startDate);
  while (tempDate <= endDate) {
    totalDays++;
    const currentMonth = tempDate.getMonth();
    const dayOfWeek = tempDate.getDay();

    if (dayOfWeek === 0 && totalDays > 1) {
      colIndex++;
    }

    if (tempDate.getFullYear() === currentYear && currentMonth !== lastMonth) {
      monthLabels.push({
        name: tempDate.toLocaleDateString("en-US", { month: "short" }),
        col: colIndex,
      });
      lastMonth = currentMonth;
    }

    const key = getLocalDateString(tempDate);
    const mins = (heatmapData && heatmapData[key]) || 0;

    let level = 0;
    if (mins > 0) {
      level = 1;
      activeDaysCount++;
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }

    const cell = document.createElement("div");
    cell.className = `heatmap-cell level-${level}`;
    if (tempDate > today) {
      cell.classList.add("future-day");
    }

    const dateOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    const dateStr = tempDate.toLocaleDateString("en-US", dateOptions);
    cell.setAttribute("title", `${dateStr}: ${formatDuration(mins)} tracked`);

    gridEl.appendChild(cell);

    tempDate.setDate(tempDate.getDate() + 1);
  }

  // Render month header labels
  if (monthsHeaderEl) {
    monthLabels.forEach((m) => {
      const lbl = document.createElement("span");
      lbl.className = "heatmap-month-label";
      lbl.style.gridColumnStart = m.col;
      lbl.textContent = m.name;
      monthsHeaderEl.appendChild(lbl);
    });
  }

  // Calculate current streak ending today or yesterday
  let checkD = new Date(today);
  let streakLimit = 365;
  while (streakLimit-- > 0) {
    const k = getLocalDateString(checkD);
    if (heatmapData && heatmapData[k] > 0) {
      currentStreak++;
      checkD.setDate(checkD.getDate() - 1);
    } else {
      if (getLocalDateString(checkD) === getLocalDateString(today)) {
        checkD.setDate(checkD.getDate() - 1);
        const yk = getLocalDateString(checkD);
        if (heatmapData && heatmapData[yk] > 0) {
          continue;
        }
      }
      break;
    }
  }

  const activeDaysEl = document.getElementById("heatmap-active-days");
  if (activeDaysEl) activeDaysEl.textContent = activeDaysCount;

  const activeRateEl = document.getElementById("heatmap-active-rate");
  if (activeRateEl) {
    const activeRate =
      totalDays > 0 ? Math.round((activeDaysCount / totalDays) * 100) : 0;
    activeRateEl.textContent = `${activeRate}%`;
  }

  const maxStreakEl = document.getElementById("heatmap-longest-streak");
  if (maxStreakEl) maxStreakEl.textContent = maxStreak;

  const currStreakEl = document.getElementById("heatmap-current-streak");
  if (currStreakEl) currStreakEl.textContent = currentStreak;
}

/**
 * Render Weekly Time Target Progress cards for global & per-project targets.
 */
async function renderWeeklyTargets(analytics) {
  const gridEl = document.getElementById("targets-grid");
  if (!gridEl) return;

  gridEl.innerHTML = "";

  const targets = (await window.tracker.getWeeklyTargets()) || {};
  const projects = (await window.tracker.getProjects()) || {};

  const globalTargetHours = targets["global"] || 0;
  const globalMins = analytics.currentWeekTotalMinutes || 0;
  const globalTrackedHours = Math.round((globalMins / 60) * 10) / 10;
  const globalPercent =
    globalTargetHours > 0
      ? Math.min(
          100,
          Math.round((globalTrackedHours / globalTargetHours) * 100),
        )
      : 0;

  // Global target card (Only Overall Weekly Target)
  const globalCard = document.createElement("div");
  globalCard.className = "target-item-card target-single-card";
  globalCard.style.cursor = "pointer";
  globalCard.title = "Click to edit overall weekly target";
  globalCard.innerHTML = `
    <div class="target-item-header">
      <span class="target-item-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Overall Target
      </span>
      <span class="target-item-status">${globalTrackedHours}h / ${globalTargetHours > 0 ? globalTargetHours + "h (" + globalPercent + "%)" : "No goal (click to set)"}</span>
    </div>
    <div class="target-track-bar">
      <div class="target-fill-bar" style="width: ${globalPercent}%; background: linear-gradient(90deg, #38bdf8, #0284c7);"></div>
    </div>
    <div class="target-single-metrics">
      <div class="target-metric-box">
        <span class="target-metric-val">${globalTrackedHours}h</span>
        <span class="target-metric-lbl">Tracked This Week</span>
      </div>
      <div class="target-metric-box">
        <span class="target-metric-val">${globalTargetHours > 0 ? globalTargetHours + "h" : "--"}</span>
        <span class="target-metric-lbl">Weekly Goal</span>
      </div>
    </div>
  `;
  globalCard.addEventListener("click", () => openGlobalTargetModal());
  gridEl.appendChild(globalCard);
}

/**
 * Render the bar chart with daily data.
 */
function renderChart(dailyData) {
  const canvas = document.getElementById("analytics-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (analyticsChart && typeof analyticsChart.destroy === "function") {
    try {
      analyticsChart.destroy();
    } catch (e) {
      console.error("Error destroying chart:", e);
    }
  }

  const labels = (dailyData || []).map((d) => {
    const date = new Date(d.date + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  });

  const trackedData = (dailyData || []).map(
    (d) => Math.round(((d.trackedMinutes || 0) / 60) * 100) / 100,
  );

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const barBg = "rgba(56, 189, 248, 0.85)";
  const barBorder = "#38bdf8";
  const textColor = isLight ? "#52525b" : "#a1a1aa";
  const gridColor = isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)";
  const tooltipBg = isLight ? "#09090b" : "#18181b";
  const tooltipTitle = isLight ? "#ffffff" : "#f4f4f5";
  const tooltipBody = "#a1a1aa";

  const newChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Hours Tracked",
          data: trackedData,
          backgroundColor: barBg,
          borderColor: barBorder,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: gridColor,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => `${ctx.raw}h tracked`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { family: "Inter", size: 11 },
            maxRotation: 45,
          },
          border: { display: false },
        },
        y: {
          grid: {
            color: gridColor,
          },
          ticks: {
            color: textColor,
            font: { family: "Inter", size: 11 },
            callback: (val) => `${val}h`,
          },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });

  setAnalyticsChart(newChart);
}

/**
 * Render the top-tasks list in analytics.
 */
function renderTopTasks(taskStats) {
  const listEl = document.getElementById("top-tasks-list");
  if (!listEl) return;

  if (!taskStats || taskStats.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state small"><p>No data yet</p></div>';
    return;
  }

  const maxMinutes = taskStats[0]?.totalMinutes || 1;

  listEl.innerHTML = "";
  taskStats.slice(0, 5).forEach((task) => {
    const item = document.createElement("div");
    item.className = "top-task-item";
    const barWidth = Math.round((task.totalMinutes / maxMinutes) * 100);
    item.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="top-task-name">${escapeHtml(task.taskName || "Unknown")}</span>
          <span class="top-task-time">${formatDuration(task.totalMinutes)}</span>
        </div>
        <div class="top-task-bar" style="width: ${barWidth}%;"></div>
      </div>
    `;
    listEl.appendChild(item);
  });
}
