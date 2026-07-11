/* ========================================
   LEARNING TRACKER — App Logic
   ======================================== */

// State
let calendarEvents = [];
let trackedTasks = {};
let currentView = 'dashboard';
let selectedTimerTask = null;
let analyticsChart = null;
let taskOrder = [];

// ---- Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
  initTitlebar();
  initNavigation();
  initModals();
  initTimerControls();
  initAnalytics();
  initResetButtons();

  await loadData();
  renderCurrentView();

  // Listen for live calendar updates
  window.tracker.onCalendarUpdated((events) => {
    calendarEvents = events;
    if (currentView === 'dashboard' || currentView === 'schedule') {
      renderCurrentView();
    }
  });

  // Listen for timer ticks
  window.tracker.onTimerTick((state) => {
    updateTimerDisplay(state);
  });

  // Update date on dashboard
  updateDashboardDate();
});

// ---- Data Loading ----
async function loadData() {
  try {
    const [events, tasks, timerState] = await Promise.all([
      window.tracker.getCalendarEvents(),
      window.tracker.getTasks(),
      window.tracker.getTimerState(),
    ]);

    calendarEvents = events || [];
    trackedTasks = tasks || {};
    taskOrder = (await window.tracker.getTaskOrder()) || [];

    if (timerState && timerState.running) {
      updateTimerDisplay(timerState);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

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

function switchView(viewName) {
  currentView = viewName;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });

  renderCurrentView();
}

async function renderCurrentView() {
  switch (currentView) {
    case 'dashboard': await renderDashboard(); break;
    case 'schedule': await renderSchedule(); break;
    case 'timer': await renderTimerView(); break;
    case 'analytics': await renderAnalytics(); break;
  }
}

// ---- Dashboard ----
function updateDashboardDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashboard-date').textContent = now.toLocaleDateString('en-US', options);
}

async function renderDashboard() {
  const todayStr = new Date().toISOString().split('T')[0];

  // Get today's events
  const todayEvents = calendarEvents.filter(e => {
    const eventDate = new Date(e.start).toISOString().split('T')[0];
    return eventDate === todayStr;
  });

  // Get tracking data
  const tasks = await window.tracker.getTasks();
  trackedTasks = tasks || {};
  const sessions = await window.tracker.getAllSessions();
  const todaySessions = (sessions || []).filter(s => {
    return new Date(s.startTime).toISOString().split('T')[0] === todayStr;
  });

  // Stat cards
  document.getElementById('stat-total-tasks').textContent = todayEvents.length || Object.keys(trackedTasks).length;

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
    const allEvents = calendarEvents.slice(0, 10);
    if (allEvents.length > 0) {
      taskListEl.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'schedule-date-header';
      header.textContent = 'Recent Events';
      taskListEl.appendChild(header);
      allEvents.forEach(event => {
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
    todayEvents.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(event => {
      taskListEl.appendChild(createTaskItem(event, false, timerState));
    });
  }

  // Refresh button
  document.getElementById('btn-refresh-calendar').onclick = async () => {
    calendarEvents = await window.tracker.getCalendarEvents();
    renderDashboard();
  };
}

// ---- Schedule View ----
async function renderSchedule() {
  const taskListEl = document.getElementById('schedule-task-list');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Filter click handlers
  filterBtns.forEach(btn => {
    btn.onclick = async () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await renderScheduleList(btn.dataset.filter);
    };
  });

  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
  await renderScheduleList(activeFilter);

  // Add task button
  document.getElementById('btn-add-task').onclick = () => openAddTaskModal();
}

async function renderScheduleList(filter) {
  const taskListEl = document.getElementById('schedule-task-list');
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();

  // Combine calendar events and manual tasks
  let allItems = [...calendarEvents];

  // Add manual tasks from the store
  Object.values(trackedTasks).forEach(task => {
    if (task.isManual) {
      allItems.push({
        id: task.id,
        summary: task.name,
        start: task.start,
        end: task.end,
        durationMinutes: task.estimateMinutes || 60,
        calendarColor: '#7c6ef0',
        calendarName: 'Manual',
        isManual: true,
      });
    }
  });

  // Apply filter
  if (filter === 'today') {
    allItems = allItems.filter(e => new Date(e.start).toISOString().split('T')[0] === todayStr);
  } else if (filter === 'upcoming') {
    allItems = allItems.filter(e => new Date(e.start) >= now);
  } else if (filter === 'past') {
    allItems = allItems.filter(e => new Date(e.start) < now);
  }

  // Sort chronologically by default
  allItems.sort((a, b) => new Date(a.start) - new Date(b.start));

  if (allItems.length === 0) {
    taskListEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No events found</p>
      </div>
    `;
    return;
  }

  const timerState = await window.tracker.getTimerState();

  // Group by date
  const groups = {};
  allItems.forEach(item => {
    const dateKey = new Date(item.start).toISOString().split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });

  // Sort inside each date group using custom taskOrder
  if (taskOrder.length > 0) {
    const orderMap = {};
    taskOrder.forEach((id, i) => orderMap[id] = i);
    for (const dateKey of Object.keys(groups)) {
      groups[dateKey].sort((a, b) => {
        const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
        const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
        return oa - ob;
      });
    }
  }

  taskListEl.innerHTML = '';
  for (const [dateKey, items] of Object.entries(groups)) {
    const header = document.createElement('div');
    header.className = 'schedule-date-header';
    const dateObj = new Date(dateKey + 'T00:00:00');
    if (dateKey === todayStr) {
      header.textContent = 'Today';
    } else {
      header.textContent = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    taskListEl.appendChild(header);

    items.forEach(item => {
      taskListEl.appendChild(createTaskItem(item, true, timerState));
    });
  }

  // Initialize drag-and-drop on the task list
  initDragAndDrop(taskListEl);
}

// ---- Create Task Item Element ----
function createTaskItem(event, draggable = false, timerState = null) {
  const task = trackedTasks[event.id] || {};
  const isCompleted = task.completed || false;

  const item = document.createElement('div');
  item.className = `task-item${isCompleted ? ' completed' : ''}`;
  item.dataset.taskId = event.id;

  const startTime = new Date(event.start);
  const timeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const estimate = task.estimateMinutes || event.durationMinutes || null;
  const tracked = task.totalTrackedMinutes || 0;

  const isCurrentTaskTiming = timerState && timerState.running && timerState.taskId === event.id && !timerState.paused;

  item.innerHTML = `
    ${draggable ? `<div class="drag-handle" title="Drag to reorder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
    </div>` : ''}
    <div class="task-color-dot" style="background: ${event.calendarColor || '#7c6ef0'};"></div>
    <button class="task-checkbox ${isCompleted ? 'checked' : ''}" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}"></button>
    <div class="task-info">
      <div class="task-name">${escapeHtml(event.summary)}</div>
      <div class="task-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${timeStr}
        ${event.calendarName ? ` · ${escapeHtml(event.calendarName)}` : ''}
      </div>
    </div>
    ${estimate ? `<span class="task-badge estimate">${formatDuration(estimate)}</span>` : ''}
    ${tracked > 0 ? `<span class="task-badge tracked">${formatDuration(tracked)} tracked</span>` : ''}
    <div class="task-actions">
      <button class="task-action-btn" title="Set estimate" data-action="estimate" data-task-id="${event.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="task-action-btn ${isCompleted ? 'disabled' : ''}" title="${isCompleted ? 'Task completed' : (isCurrentTaskTiming ? 'Pause timer' : 'Start timer')}" data-action="start-timer" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}" data-estimate="${estimate || ''}" ${isCompleted ? 'disabled' : ''}>
        ${isCurrentTaskTiming ? 
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>` : 
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        }
      </button>
    </div>
  `;

  // Checkbox handler
  const checkbox = item.querySelector('.task-checkbox');
  checkbox.addEventListener('click', async () => {
    const taskId = checkbox.dataset.taskId;
    const taskName = checkbox.dataset.taskName;

    if (isCompleted) {
      await window.tracker.markTaskIncomplete(taskId);
    } else {
      await window.tracker.markTaskComplete(taskId);
      // Also save the task name for reference
      await window.tracker.saveTask({ id: taskId, name: taskName });
    }

    // Reload data and re-render
    trackedTasks = await window.tracker.getTasks();
    renderCurrentView();
  });

  // Action buttons
  item.querySelectorAll('.task-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'estimate') {
        openEstimateModal(btn.dataset.taskId, estimate);
      } else if (action === 'start-timer' && !isCompleted) {
        // Check if timer is already running for this task
        const timerState = await window.tracker.getTimerState();
        if (timerState.running && timerState.taskId === btn.dataset.taskId) {
          // Already timing this task — pause it
          if (!timerState.paused) {
            await window.tracker.pauseTimer();
          } else {
            await window.tracker.resumeTimer();
          }
          switchView('timer');
        } else {
          // Start new timer for this task
          selectedTimerTask = {
            id: btn.dataset.taskId,
            name: btn.dataset.taskName,
            estimate: btn.dataset.estimate ? parseInt(btn.dataset.estimate) : null,
          };
          switchView('timer');
          startTimerForTask();
        }
      }
    });
  });

  return item;
}

// ---- Timer View ----
function initTimerControls() {
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
      trackedTasks = await window.tracker.getTasks();
      renderTimerView();
    }
  });
}

async function startTimerForTask() {
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

function updateTimerDisplay(state) {
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

async function renderTimerView() {
  const timerState = await window.tracker.getTimerState();

  // Update buttons based on state
  if (timerState.running) {
    document.getElementById('btn-timer-stop').disabled = false;
    document.getElementById('timer-task-name').textContent = timerState.taskName;
    document.getElementById('timer-display').textContent = timerState.elapsedFormatted;

    // Auto-select the currently active/paused task in the list
    selectedTimerTask = {
      id: timerState.taskId,
      name: timerState.taskName,
      estimate: timerState.estimateMinutes
    };

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
      selectedTimerTask = task;
      document.querySelectorAll('.timer-task-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
    listEl.appendChild(opt);
  });
}

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

// ---- Analytics ----
function initAnalytics() {
  document.getElementById('analytics-range').addEventListener('change', () => {
    renderAnalytics();
  });
}

async function renderAnalytics() {
  const range = document.getElementById('analytics-range').value;

  try {
    const analytics = await window.tracker.getAnalytics(range);

    // Summary stats
    const totalHours = analytics.totalTrackedMinutes / 60;
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

function renderChart(dailyData) {
  const canvas = document.getElementById('analytics-chart');
  const ctx = canvas.getContext('2d');

  if (analyticsChart) {
    analyticsChart.destroy();
  }

  const labels = dailyData.map(d => {
    const date = new Date(d.date + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });

  const trackedData = dailyData.map(d => Math.round(d.trackedMinutes / 60 * 100) / 100);

  analyticsChart = new Chart(ctx, {
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
}

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

// ---- Modals ----
function initModals() {
  // Add task modal
  document.getElementById('btn-modal-close').addEventListener('click', closeModals);
  document.getElementById('btn-cancel-task').addEventListener('click', closeModals);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModals();
  });

  // Estimate modal
  document.getElementById('btn-estimate-close').addEventListener('click', closeModals);
  document.getElementById('btn-estimate-cancel').addEventListener('click', closeModals);
  document.getElementById('estimate-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('estimate-modal-overlay')) closeModals();
  });

  // Form submissions
  document.getElementById('form-add-task').addEventListener('submit', handleAddTask);
  document.getElementById('form-estimate').addEventListener('submit', handleSetEstimate);
}

function openAddTaskModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('task-date').value = today;
  document.getElementById('task-time').value = '09:00';
  document.getElementById('task-name').value = '';
  document.getElementById('task-estimate').value = '';
  document.getElementById('modal-overlay').style.display = 'flex';
}

function openEstimateModal(taskId, currentEstimate) {
  document.getElementById('estimate-task-id').value = taskId;
  document.getElementById('estimate-minutes').value = currentEstimate || '';
  document.getElementById('estimate-modal-overlay').style.display = 'flex';
}

function closeModals() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('estimate-modal-overlay').style.display = 'none';
}

async function handleAddTask(e) {
  e.preventDefault();

  const name = document.getElementById('task-name').value.trim();
  const date = document.getElementById('task-date').value;
  const time = document.getElementById('task-time').value;
  const estimate = parseInt(document.getElementById('task-estimate').value) || 60;

  if (!name || !date || !time) return;

  const startDate = new Date(`${date}T${time}`);
  const endDate = new Date(startDate.getTime() + estimate * 60000);

  const task = {
    id: `manual-${Date.now()}`,
    name,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    estimateMinutes: estimate,
    isManual: true,
    createdAt: new Date().toISOString(),
  };

  await window.tracker.saveTask(task);
  trackedTasks = await window.tracker.getTasks();

  closeModals();
  renderCurrentView();
}

async function handleSetEstimate(e) {
  e.preventDefault();

  const taskId = document.getElementById('estimate-task-id').value;
  const minutes = parseInt(document.getElementById('estimate-minutes').value);

  if (!taskId || !minutes) return;

  await window.tracker.setEstimate(taskId, minutes);
  trackedTasks = await window.tracker.getTasks();

  closeModals();
  renderCurrentView();
}

// ---- Reset ----
function initResetButtons() {
  const resetIds = ['btn-reset-dashboard', 'btn-reset-schedule', 'btn-reset-timer', 'btn-reset-analytics'];
  resetIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => showConfirmDialog());
    }
  });
}

function showConfirmDialog() {
  // Remove existing dialog if any
  const existing = document.querySelector('.confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>Reset All Data?</h3>
      <p>This will permanently delete all tracked sessions, estimates, task completions, and custom ordering. Calendar events from GNOME will remain untouched.</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
        <button class="btn btn-danger" id="confirm-reset">Reset Everything</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('confirm-reset').addEventListener('click', async () => {
    await window.tracker.resetAll();
    trackedTasks = {};
    taskOrder = [];
    overlay.remove();
    renderCurrentView();
  });
}

// ---- Drag & Drop (Mouse-based for Electron/Linux reliability) ----
function initDragAndDrop(listEl) {
  if (listEl.dataset.dragInitDone === 'true') return;
  listEl.dataset.dragInitDone = 'true';

  let draggedItem = null;
  let placeholder = null;
  let offsetY = 0;
  let isDragging = false;

  function getVisualChildren() {
    return [...listEl.children].filter(el => 
      el !== draggedItem && 
      !el.classList.contains('drag-placeholder') && 
      !el.classList.contains('dragging')
    );
  }

  function onMouseDown(e) {
    console.log('Drag Drop: mousedown triggered on target:', e.target);

    // Prevent drag initiation when clicking interactive components (checkboxes, buttons, actions)
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.task-actions') || e.target.closest('.task-checkbox')) {
      console.log('Drag Drop: clicked interactive element, ignoring drag');
      return;
    }

    const item = e.target.closest('.task-item');
    if (!item) {
      console.log('Drag Drop: task-item container not found, ignoring');
      return;
    }

    e.preventDefault();
    draggedItem = item;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;
    console.log('Drag Drop: Start drag. rect.top:', rect.top, 'clientY:', e.clientY, 'offsetY:', offsetY);

    // Create placeholder
    placeholder = document.createElement('div');
    placeholder.className = 'task-item drag-placeholder';
    placeholder.style.height = rect.height + 'px';

    // Style the dragged item as floating
    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.width = rect.width + 'px';
    item.style.top = rect.top + 'px';
    item.style.left = rect.left + 'px';
    item.style.zIndex = '1000';
    item.style.pointerEvents = 'none';

    // Insert placeholder where the item was
    item.parentNode.insertBefore(placeholder, item);

    isDragging = true;
    document.body.style.cursor = 'grabbing';
    console.log('Drag Drop: placeholder inserted, listeners attached');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging || !draggedItem) return;

    // Move the floating item
    const newTop = e.clientY - offsetY;
    draggedItem.style.top = newTop + 'px';
    console.log('Drag Drop: mousemove newTop:', newTop);

    // Find which child element we're hovering over (including headers)
    const elements = getVisualChildren();
    let target = null;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        target = el;
        break;
      }
    }

    // Remove existing placeholder and re-insert
    if (placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    if (target) {
      target.parentNode.insertBefore(placeholder, target);
    } else {
      // After the last child
      listEl.appendChild(placeholder);
    }
  }

  function onMouseUp() {
    if (!isDragging || !draggedItem) return;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';

    // Place the real item where the placeholder is
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedItem, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    }

    // Reset styles
    draggedItem.classList.remove('dragging');
    draggedItem.style.position = '';
    draggedItem.style.width = '';
    draggedItem.style.top = '';
    draggedItem.style.left = '';
    draggedItem.style.zIndex = '';
    draggedItem.style.pointerEvents = '';

    // Save the new order
    saveCurrentOrder(listEl);

    draggedItem = null;
    placeholder = null;
    isDragging = false;
  }

  listEl.addEventListener('mousedown', onMouseDown);
}

async function saveCurrentOrder(listEl) {
  const items = listEl.querySelectorAll('.task-item[data-task-id]');
  const orderedIds = [...items].map(el => el.dataset.taskId);
  taskOrder = orderedIds;
  await window.tracker.saveTaskOrder(orderedIds);
}

// ---- Utilities ----
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
