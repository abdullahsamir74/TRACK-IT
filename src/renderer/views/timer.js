/* ========================================
   VIEW — Timer
   ======================================== */

import { formatDuration, escapeHtml, getLocalDateString, getCombinedEvents } from '../utils.js';
import {
  calendarEvents, trackedTasks, setTrackedTasks,
  selectedTimerTask, setSelectedTimerTask, taskOrder,
} from '../state.js';
import { initDragAndDrop } from '../components/drag-drop.js';
import { playTimerStopSound } from '../sounds.js';
import { resetEstimateAlert } from '../app.js';

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
      enterFullscreenTimer();
    } else {
      // Start new
      startTimerForTask();
    }
  });

  stopBtn.addEventListener('click', async () => {
    const session = await window.tracker.stopTimer();
    if (session) {
      // Play stop sound and reset estimate alert
      playTimerStopSound();
      resetEstimateAlert();

      // Reset display
      document.getElementById('timer-display').textContent = '00:00:00';
      document.getElementById('timer-task-name').textContent = 'No task selected';
      document.getElementById('timer-play-icon').style.display = '';
      document.getElementById('timer-pause-icon').style.display = 'none';
      stopBtn.disabled = true;

      // Reset ring
      const ring = document.querySelector('.timer-ring-progress');
      if (ring) ring.style.strokeDashoffset = '565.48';

      // Reset estimate bar
      document.getElementById('timer-estimate-bar').style.display = 'none';
      document.getElementById('timer-estimate-fill').style.width = '0%';

      // Refresh
      setTrackedTasks(await window.tracker.getTasks());
      renderTimerView();
    }
  });

  // Global Escape key listener to exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      exitFullscreenTimer();
    }
  });

  // Handle system fullscreen change (e.g. F11 or OS menu exit)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      const overlay = document.getElementById('fullscreen-timer-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  // Click handler for fullscreen close button
  const closeBtn = document.getElementById('btn-fullscreen-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      exitFullscreenTimer();
    });
  }
}

/**
 * Start the timer for the currently selected task.
 */
export async function startTimerForTask() {
  if (!selectedTimerTask) return;

  // Reset the estimate-reached alert so it can fire for this new session
  resetEstimateAlert();

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

  // Automatically trigger fullscreen mode when timer starts
  enterFullscreenTimer();
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
  const ring = document.querySelector('.timer-ring-progress');
  if (ring) {
    ring.style.strokeDashoffset = offset;
  }

  // Update estimate bar
  if (state.estimateMinutes) {
    const fill = document.getElementById('timer-estimate-fill');
    if (fill) fill.style.width = `${Math.min(progress * 100, 100)}%`;
  }

  // Update dashboard timer
  const dashboardTimer = document.getElementById('dashboard-active-timer');
  if (dashboardTimer && state.running) {
    dashboardTimer.style.display = 'flex';
    document.getElementById('dashboard-timer-task').textContent = state.taskName;
    document.getElementById('dashboard-timer-display').textContent = state.elapsedFormatted;
  }

  // Change ring color if over estimate
  if (ring) {
    if (progress > 1) {
      ring.style.stroke = '#ff6b8a';
    } else {
      ring.style.stroke = '#7c6ef0';
    }
  }

  // Update fullscreen display if it is visible
  const fsOverlay = document.getElementById('fullscreen-timer-overlay');
  if (fsOverlay && fsOverlay.style.display !== 'none') {
    const fsDisplay = document.getElementById('fullscreen-timer-display');
    const fsTask = document.getElementById('fullscreen-task-name');
    if (fsDisplay) fsDisplay.textContent = state.elapsedFormatted;
    if (fsTask) fsTask.textContent = state.taskName;
  }
}

/**
 * Enter fullscreen timer mode.
 */
export function enterFullscreenTimer() {
  const overlay = document.getElementById('fullscreen-timer-overlay');
  if (!overlay) return;

  window.tracker.getTimerState().then(state => {
    if (state && state.running) {
      document.getElementById('fullscreen-task-name').textContent = state.taskName;
      document.getElementById('fullscreen-timer-display').textContent = state.elapsedFormatted;
      overlay.style.display = 'flex';

      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Could not enter fullscreen mode:', err);
        });
      }
    }
  });
}

/**
 * Exit fullscreen timer mode.
 */
export function exitFullscreenTimer() {
  const overlay = document.getElementById('fullscreen-timer-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(err => {
      console.warn('Could not exit fullscreen mode:', err);
    });
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

  const merged = getCombinedEvents(calendarEvents, trackedTasks);
  const incompleteTasks = merged
    .map(e => {
      const task = trackedTasks[e.id] || {};
      return {
        id: e.id,
        name: e.summary,
        estimate: task.estimateMinutes || e.durationMinutes || null,
        calendarColor: e.calendarColor || '#7c6ef0',
        completed: task.completed || false
      };
    })
    .filter(t => !t.completed);

  // Deduplicate in case there are overlapping IDs
  const seen = new Set();
  const unique = incompleteTasks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (unique.length === 0) {
    listEl.innerHTML = '<div class="empty-state small"><p>No tasks available</p></div>';
    return;
  }

  // Sort unique tasks using taskOrder
  if (taskOrder && taskOrder.length > 0) {
    const orderMap = {};
    taskOrder.forEach((id, i) => orderMap[id] = i);
    unique.sort((a, b) => {
      const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
      const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
      return oa - ob;
    });
  }

  listEl.innerHTML = '';
  unique.slice(0, 8).forEach(task => {
    const opt = document.createElement('div');
    opt.className = `timer-task-option${selectedTimerTask?.id === task.id ? ' selected' : ''}`;
    opt.dataset.taskId = task.id;
    opt.setAttribute('role', 'button');
    opt.setAttribute('tabindex', '0');
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

  // Initialize drag-and-drop on the task list
  initDragAndDrop(listEl);
}

/**
 * Render today's completed timer sessions.
 */
async function renderTodaySessions() {
  const sessions = await window.tracker.getAllSessions();
  const todayStr = getLocalDateString();
  const todaySessions = (sessions || []).filter(s => {
    return getLocalDateString(s.startTime) === todayStr;
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
      <span class="session-duration">${formatDuration(session.durationMinutes)}${session.completionSession ? ' ✓' : ''}</span>
    `;
    listEl.appendChild(item);
  });
}
