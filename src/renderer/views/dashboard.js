/* ========================================
   VIEW — Dashboard
   ======================================== */

import { formatDuration, getLocalDateString, getCombinedEvents } from '../utils.js';
import {
  calendarEvents, trackedTasks, setTrackedTasks,
  setCalendarEvents, taskOrder,
} from '../state.js';
import { switchView } from '../state.js';
import { createTaskItem } from '../components/task-item.js';
import { initDragAndDrop } from '../components/drag-drop.js';

/**
 * Update the date display on the dashboard header.
 */
export function updateDashboardDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashboard-date').textContent = now.toLocaleDateString('en-US', options);
}

/**
 * Render the full dashboard view.
 */
export async function renderDashboard() {
  const todayStr = getLocalDateString();

  // Combine calendar events and manual tasks
  const allEvents = getCombinedEvents(calendarEvents, trackedTasks);

  // Get today's events
  const todayEvents = allEvents.filter(e => {
    const eventDate = getLocalDateString(e.start);
    return eventDate === todayStr;
  });

  // Get tracking data
  const tasks = await window.tracker.getTasks();
  setTrackedTasks(tasks || {});
  const sessions = await window.tracker.getAllSessions();
  const todaySessions = (sessions || []).filter(s => {
    return getLocalDateString(s.startTime) === todayStr;
  });

  // Stat cards
  document.getElementById('stat-total-tasks').textContent = todayEvents.length;

  const trackedToday = todaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  document.getElementById('stat-total-time').textContent = formatDuration(trackedToday);

  const completedCount = Object.values(trackedTasks).filter(t => t.completed).length;
  document.getElementById('stat-completed-count').textContent = completedCount;

  const estimatedTotal = todayEvents.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
  document.getElementById('stat-estimated-time').textContent = formatDuration(estimatedTotal);

  // Active timer
  const timerState = await window.tracker.getTimerState();
  const activeTimerEl = document.getElementById('dashboard-active-timer');
  if (timerState && timerState.running) {
    activeTimerEl.style.display = 'flex';
    document.getElementById('dashboard-timer-task').textContent = timerState.taskName;
    document.getElementById('dashboard-timer-display').textContent = timerState.elapsedFormatted;

    // Navigate to timer view on click
    document.getElementById('dashboard-goto-timer').onclick = () => switchView('timer');
  } else {
    activeTimerEl.style.display = 'none';
  }

  // Streak
  try {
    const analytics = await window.tracker.getAnalytics('week');
    document.getElementById('streak-count').textContent = analytics.streak || 0;
  } catch(e) {}

  // Today's task list
  const taskListEl = document.getElementById('dashboard-task-list');
  if (todayEvents.length === 0) {
    // Show all events if none today
    const recentEvents = calendarEvents.slice(0, 10);
    if (recentEvents.length > 0) {
      taskListEl.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'schedule-date-header';
      header.textContent = 'Recent Events';
      taskListEl.appendChild(header);
      recentEvents.forEach(event => {
        taskListEl.appendChild(createTaskItem(event, false, timerState));
      });
    } else {
      taskListEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <p>No tasks scheduled</p>
          <span>Events from GNOME Calendar will appear here</span>
        </div>
      `;
    }
  } else {
    taskListEl.innerHTML = '';
    // Sort todayEvents using taskOrder
    if (taskOrder && taskOrder.length > 0) {
      const orderMap = {};
      taskOrder.forEach((id, i) => orderMap[id] = i);
      todayEvents.sort((a, b) => {
        const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
        const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
        if (oa !== ob) return oa - ob;
        return new Date(a.start) - new Date(b.start);
      });
    } else {
      todayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    }
    todayEvents.forEach(event => {
      taskListEl.appendChild(createTaskItem(event, true, timerState));
    });
    initDragAndDrop(taskListEl);
  }

  // Refresh button
  document.getElementById('btn-refresh-calendar').onclick = async () => {
    setCalendarEvents(await window.tracker.getCalendarEvents());
    renderDashboard();
  };
}
