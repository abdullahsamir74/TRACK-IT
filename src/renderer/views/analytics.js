/* ========================================
   VIEW — Analytics
   ======================================== */

import { formatDuration, escapeHtml } from '../utils.js';
import { analyticsChart, setAnalyticsChart } from '../state.js';

/**
 * Initialize analytics range selector.
 */
export function initAnalytics() {
  document.getElementById('analytics-range').addEventListener('change', () => {
    renderAnalytics();
  });
}

/**
 * Render the full analytics view.
 */
export async function renderAnalytics() {
  const range = document.getElementById('analytics-range').value;

  try {
    const analytics = await window.tracker.getAnalytics(range);

    // Summary stats
    document.getElementById('analytics-total-hours').textContent = formatDuration(analytics.totalTrackedMinutes);
    document.getElementById('analytics-total-sessions').textContent = analytics.totalSessions;

    const completionRate = analytics.totalTaskCount > 0
      ? Math.round((analytics.completedCount / analytics.totalTaskCount) * 100)
      : 0;
    document.getElementById('analytics-completion-rate').textContent = `${completionRate}%`;

    const days = analytics.daily.length || 1;
    const avgDaily = analytics.totalTrackedMinutes / days;
    document.getElementById('analytics-avg-daily').textContent = formatDuration(avgDaily);

    // Chart
    renderChart(analytics.daily);

    // Top tasks
    renderTopTasks(analytics.taskStats);

    // Streak
    document.getElementById('streak-count').textContent = analytics.streak || 0;
  } catch (err) {
    console.error('Error rendering analytics:', err);
  }
}

/**
 * Render the bar chart with daily data.
 */
function renderChart(dailyData) {
  const canvas = document.getElementById('analytics-chart');
  const ctx = canvas.getContext('2d');

  let currentChart = analyticsChart;
  if (currentChart) {
    currentChart.destroy();
  }

  const labels = dailyData.map(d => {
    const date = new Date(d.date + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });

  const trackedData = dailyData.map(d => Math.round(d.trackedMinutes / 60 * 100) / 100);

  const newChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours Tracked',
        data: trackedData,
        backgroundColor: 'rgba(124, 110, 240, 0.6)',
        borderColor: 'rgba(124, 110, 240, 1)',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#f0f2f8',
          bodyColor: '#8b95b0',
          borderColor: 'rgba(255,255,255,0.1)',
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
            color: '#5a6580',
            font: { family: 'Inter', size: 11 },
            maxRotation: 45,
          },
          border: { display: false },
        },
        y: {
          grid: {
            color: 'rgba(255,255,255,0.04)',
          },
          ticks: {
            color: '#5a6580',
            font: { family: 'Inter', size: 11 },
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
  const listEl = document.getElementById('top-tasks-list');

  if (!taskStats || taskStats.length === 0) {
    listEl.innerHTML = '<div class="empty-state small"><p>No data yet</p></div>';
    return;
  }

  const maxMinutes = taskStats[0]?.totalMinutes || 1;

  listEl.innerHTML = '';
  taskStats.slice(0, 5).forEach(task => {
    const item = document.createElement('div');
    item.className = 'top-task-item';
    const barWidth = Math.round((task.totalMinutes / maxMinutes) * 100);
    item.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="top-task-name">${escapeHtml(task.taskName || 'Unknown')}</span>
          <span class="top-task-time">${formatDuration(task.totalMinutes)}</span>
        </div>
        <div class="top-task-bar" style="width: ${barWidth}%;"></div>
      </div>
    `;
    listEl.appendChild(item);
  });
}
