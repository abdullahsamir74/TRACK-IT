/* ========================================
   VIEW — Timer
   ======================================== */

import { formatDuration, escapeHtml } from '../utils.js';
import {
  calendarEvents, trackedTasks, setTrackedTasks,
  selectedTimerTask, setSelectedTimerTask,
} from '../state.js';

/**
 * Initialize timer control buttons (play/pause, stop).
 */
export function initTimerControls() {
  const startBtn = document.getElementById('btn-timer-start');
  const stopBtn = document.getElementById('btn-timer-stop');

  startBtn.addEventListener('click', async () => {
    const timerState = await window.tracker.getTimerState();

    // If a different task is selected in the UI than the one currently running/paused,
    // automatically stop the current task and save its session, then start the new task from 0.
    if (timerState.running && selectedTimerTask && timerState.taskId !== selectedTimerTask.id) {
      await window.tracker.stopTimer();
      startTimerForTask();
      return;
    }

    if (timerState.running && !timerState.paused) {
      // Pause
      await window.tracker.pauseTimer();
      document.getElementById('timer-play-icon').style.display = '';
      document.getElementById('timer-pause-icon').style.display = 'none';
    } else if (timerState.running && timerState.paused) {
      // Resume
      await window.tracker.resumeTimer();
      document.getElementById('timer-play-icon').style.display = 'none';
      document.getElementById('timer-pause-icon').style.display = '';
    } else {
      // Start new
      startTimerForTask();
    }
  });

  stopBtn.addEventListener('click', async () => {
    const session = await window.tracker.stopTimer();
    if (session) {
      // Reset display
      document.getElementById('timer-display').textContent = '00:00:00';
      document.getElementById('timer-task-name').textContent = 'No task selected';
      document.getElementById('timer-play-icon').style.display = '';
      document.getElementById('timer-pause-icon').style.display = 'none';
      stopBtn.disabled = true;

      // Reset ring
      document.querySelector('.timer-ring-progress').style.strokeDashoffset = '565.48';

      // Reset estimate bar
      document.getElementById('timer-estimate-bar').style.display = 'none';
      document.getElementById('timer-estimate-fill').style.width = '0%';

      // Refresh
      setTrackedTasks(await window.tracker.getTasks());
      renderTimerView();
    }
  });
}

/**
 * Start the timer for the currently selected task.
 */
export async function startTimerForTask() {
  if (!selectedTimerTask) return;

  await window.tracker.startTimer(
    selectedTimerTask.id,
    selectedTimerTask.name,
    selectedTimerTask.estimate
  );

  document.getElementById('timer-task-name').textContent = selectedTimerTask.name;
  document.getElementById('timer-play-icon').style.display = 'none';
  document.getElementById('timer-pause-icon').style.display = '';
  document.getElementById('btn-timer-stop').disabled = false;

  // Show estimate bar if there's an estimate
  if (selectedTimerTask.estimate) {
    document.getElementById('timer-estimate-bar').style.display = 'block';
    document.getElementById('timer-estimate-label').textContent = `Est: ${formatDuration(selectedTimerTask.estimate)}`;
  }
}

/**
 * Update the timer display from a tick event.
 */
export function updateTimerDisplay(state) {
  // Update timer display
  document.getElementById('timer-display').textContent = state.elapsedFormatted;

  // Update ring progress
  const circumference = 565.48;
  const progress = state.progress || 0;
  const offset = circumference * (1 - Math.min(progress, 1));
  document.querySelector('.timer-ring-progress').style.strokeDashoffset = offset;

  // Update estimate bar
  if (state.estimateMinutes) {
    document.getElementById('timer-estimate-fill').style.width = `${Math.min(progress * 100, 100)}%`;
  }

  // Update dashboard timer
  const dashboardTimer = document.getElementById('dashboard-active-timer');
  if (dashboardTimer && state.running) {
    dashboardTimer.style.display = 'flex';
    document.getElementById('dashboard-timer-task').textContent = state.taskName;
    document.getElementById('dashboard-timer-display').textContent = state.elapsedFormatted;
  }

  // Change ring color if over estimate
  const ring = document.querySelector('.timer-ring-progress');
  if (progress > 1) {
    ring.style.stroke = '#ff6b8a';
  } else {
    ring.style.stroke = '#7c6ef0';
  }
}

/**
 * Render the full timer view.
 */
export async function renderTimerView() {
  const timerState = await window.tracker.getTimerState();

  // Update buttons based on state
  if (timerState.running) {
    document.getElementById('btn-timer-stop').disabled = false;
    document.getElementById('timer-task-name').textContent = timerState.taskName;
    document.getElementById('timer-display').textContent = timerState.elapsedFormatted;

    // Auto-select the currently active/paused task in the list
    setSelectedTimerTask({
      id: timerState.taskId,
      name: timerState.taskName,
      estimate: timerState.estimateMinutes
    });

    if (timerState.paused) {
      document.getElementById('timer-play-icon').style.display = '';
      document.getElementById('timer-pause-icon').style.display = 'none';
    } else {
      document.getElementById('timer-play-icon').style.display = 'none';
      document.getElementById('timer-pause-icon').style.display = '';
    }

    if (timerState.estimateMinutes) {
      document.getElementById('timer-estimate-bar').style.display = 'block';
      document.getElementById('timer-estimate-label').textContent = `Est: ${formatDuration(timerState.estimateMinutes)}`;
    }
  } else {
    // Reset view to idle if nothing is running
    document.getElementById('btn-timer-stop').disabled = true;
    document.getElementById('timer-task-name').textContent = 'No task selected';
    document.getElementById('timer-display').textContent = '00:00:00';
    document.getElementById('timer-play-icon').style.display = '';
    document.getElementById('timer-pause-icon').style.display = 'none';
    document.getElementById('timer-estimate-bar').style.display = 'none';
    const ring = document.querySelector('.timer-ring-progress');
    if (ring) {
      ring.style.strokeDashoffset = '565.48';
      ring.style.stroke = '#7c6ef0';
    }
  }

  // Task selector
  renderTimerTaskList();

  // Today's sessions
  renderTodaySessions();
}

/**
 * Render the task list for the timer's task selector.
 */
function renderTimerTaskList() {
  const listEl = document.getElementById('timer-task-list');

  // Combine calendar events with manual tasks
  const allTasks = [];

  calendarEvents.forEach(e => {
    const task = trackedTasks[e.id] || {};
    if (!task.completed) {
      allTasks.push({
        id: e.id,
        name: e.summary,
        estimate: task.estimateMinutes || e.durationMinutes || null,
        calendarColor: e.calendarColor,
      });
    }
  });

  // Add manual tasks
  Object.values(trackedTasks).forEach(t => {
    if (t.isManual && !t.completed) {
      allTasks.push({
        id: t.id,
        name: t.name,
        estimate: t.estimateMinutes || null,
        calendarColor: '#7c6ef0',
      });
    }
  });

  // Deduplicate
  const seen = new Set();
  const unique = allTasks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (unique.length === 0) {
    listEl.innerHTML = '<div class="empty-state small"><p>No tasks available</p></div>';
    return;
  }

  listEl.innerHTML = '';
  unique.slice(0, 8).forEach(task => {
    const opt = document.createElement('button');
    opt.className = `timer-task-option${selectedTimerTask?.id === task.id ? ' selected' : ''}`;
    opt.innerHTML = `
      <div class="task-color-dot" style="background: ${task.calendarColor || '#7c6ef0'}; height: 24px;"></div>
      <span style="flex:1; text-align:left;">${escapeHtml(task.name)}</span>
      ${task.estimate ? `<span class="task-badge estimate">${formatDuration(task.estimate)}</span>` : ''}
    `;
    opt.addEventListener('click', () => {
      setSelectedTimerTask(task);
      document.querySelectorAll('.timer-task-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
    listEl.appendChild(opt);
  });
}

/**
 * Render today's completed timer sessions.
 */
async function renderTodaySessions() {
  const sessions = await window.tracker.getAllSessions();
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = (sessions || []).filter(s => {
    return new Date(s.startTime).toISOString().split('T')[0] === todayStr;
  });

  const listEl = document.getElementById('timer-session-list');

  if (todaySessions.length === 0) {
    listEl.innerHTML = '<div class="empty-state small"><p>No sessions recorded today</p></div>';
    return;
  }

  listEl.innerHTML = '';
  todaySessions.reverse().forEach(session => {
    const item = document.createElement('div');
    item.className = 'session-item';
    const startTime = new Date(session.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    item.innerHTML = `
      <div>
        <div class="session-task-name">${escapeHtml(session.taskName || 'Unknown')}</div>
        <div class="session-time">${startTime}</div>
      </div>
      <span class="session-duration">${formatDuration(session.durationMinutes)}</span>
    `;
    listEl.appendChild(item);
  });
}
