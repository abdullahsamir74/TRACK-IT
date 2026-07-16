const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Calendar
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),
  getCalendars: () => ipcRenderer.invoke('get-calendars'),
  onCalendarUpdated: (callback) => {
    ipcRenderer.on('calendar-updated', (event, data) => callback(data));
  },

  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  saveTask: (task) => ipcRenderer.invoke('save-task', task),
  deleteTask: (taskId) => ipcRenderer.invoke('delete-task', taskId),
  setEstimate: (taskId, minutes) => ipcRenderer.invoke('set-estimate', taskId, minutes),
  markTaskComplete: (taskId) => ipcRenderer.invoke('mark-task-complete', taskId),
  markTaskIncomplete: (taskId) => ipcRenderer.invoke('mark-task-incomplete', taskId),

  // Sessions
  getSessions: (taskId) => ipcRenderer.invoke('get-sessions', taskId),
  getAllSessions: () => ipcRenderer.invoke('get-all-sessions'),
  getAnalytics: (range) => ipcRenderer.invoke('get-analytics', range),

  // Timer
  startTimer: (taskId, taskName, estimateMinutes) =>
    ipcRenderer.invoke('start-timer', taskId, taskName, estimateMinutes),
  pauseTimer: () => ipcRenderer.invoke('pause-timer'),
  resumeTimer: () => ipcRenderer.invoke('resume-timer'),
  stopTimer: () => ipcRenderer.invoke('stop-timer'),
  getTimerState: () => ipcRenderer.invoke('get-timer-state'),
  onTimerTick: (callback) => {
    ipcRenderer.on('timer-tick', (event, data) => callback(data));
  },

  // Reset & ordering
  resetAll: () => ipcRenderer.invoke('reset-all'),
  resetTrackingData: () => ipcRenderer.invoke('reset-tracking-data'),
  resetSessions: () => ipcRenderer.invoke('reset-sessions'),
  resetProjects: () => ipcRenderer.invoke('reset-projects'),
  saveTaskOrder: (orderedIds) => ipcRenderer.invoke('save-task-order', orderedIds),
  getTaskOrder: () => ipcRenderer.invoke('get-task-order'),

  // Projects
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  assignTaskToProject: (taskId, projectId) => ipcRenderer.invoke('assign-task-to-project', taskId, projectId),
  saveProjectOrder: (orderedIds) => ipcRenderer.invoke('save-project-order', orderedIds),
  getProjectOrder: () => ipcRenderer.invoke('get-project-order'),

  // Habits
  getHabits: () => ipcRenderer.invoke('get-habits'),
  saveHabit: (habit) => ipcRenderer.invoke('save-habit', habit),
  deleteHabit: (habitId) => ipcRenderer.invoke('delete-habit', habitId),
});
