const { contextBridge, ipcRenderer } = require("electron");

// Helper to invoke method on the TrackerFacade ('tracker') service
const invokeTracker = (methodName, ...args) =>
  ipcRenderer.invoke("service-invoke", "tracker", methodName, ...args);

contextBridge.exposeInMainWorld("tracker", {
  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onMaximizedChange: (callback) => {
    ipcRenderer.removeAllListeners("window-maximized-change");
    ipcRenderer.on("window-maximized-change", (event, isMaximized) =>
      callback(isMaximized),
    );
  },

  // Native Dialogs
  showSaveDialog: (options) => ipcRenderer.invoke("dialog-save-file", options),
  showOpenDialog: (options) => ipcRenderer.invoke("dialog-open-file", options),

  // Calendar
  getCalendarEvents: () => invokeTracker("getCalendarEvents"),
  getCalendars: () => invokeTracker("getCalendars"),
  onCalendarUpdated: (callback) => {
    ipcRenderer.removeAllListeners("calendar-updated");
    ipcRenderer.on("calendar-updated", (event, data) => callback(data));
  },

  // Tasks
  getTasks: () => invokeTracker("getTasks"),
  saveTask: (task) => invokeTracker("saveTask", task),
  deleteTask: (taskId) => invokeTracker("deleteTask", taskId),
  setEstimate: (taskId, minutes) =>
    invokeTracker("setEstimate", taskId, minutes),
  markTaskComplete: (taskId) => invokeTracker("markTaskComplete", taskId),
  markTaskIncomplete: (taskId) => invokeTracker("markTaskIncomplete", taskId),
  saveTaskOrder: (orderedIds) => invokeTracker("saveTaskOrder", orderedIds),
  getTaskOrder: () => invokeTracker("getTaskOrder"),
  getTaskSortMode: () => invokeTracker("getTaskSortMode"),
  saveTaskSortMode: (mode) => invokeTracker("saveTaskSortMode", mode),

  // Time Entries / Sessions (First-Class Logs)
  getAllSessions: (options) => invokeTracker("getAllSessions", options),
  getSessions: (taskId) => invokeTracker("getSessions", taskId),
  saveSession: (session) => invokeTracker("saveSession", session),
  deleteSession: (identifier) => invokeTracker("deleteSession", identifier),

  // Projects
  getProjects: () => invokeTracker("getProjects"),
  saveProject: (project) => invokeTracker("saveProject", project),
  deleteProject: (projectId) => invokeTracker("deleteProject", projectId),
  assignTaskToProject: (taskId, projectId) =>
    invokeTracker("assignTaskToProject", taskId, projectId),
  saveProjectOrder: (orderedIds) =>
    invokeTracker("saveProjectOrder", orderedIds),
  getProjectOrder: () => invokeTracker("getProjectOrder"),

  // Habits
  getHabits: () => invokeTracker("getHabits"),
  saveHabit: (habit) => invokeTracker("saveHabit", habit),
  deleteHabit: (habitId) => invokeTracker("deleteHabit", habitId),

  // Weekly Targets & Settings
  getWeeklyTargets: () => invokeTracker("getWeeklyTargets"),
  saveWeeklyTarget: (targetKey, hours) =>
    invokeTracker("saveWeeklyTarget", targetKey, hours),
  getSetting: (key, defaultVal) => invokeTracker("getSetting", key, defaultVal),
  setSetting: (key, value) => invokeTracker("setSetting", key, value),

  // Analytics
  getAnalytics: (range) => invokeTracker("getAnalytics", range),

  // Timer
  startTimer: (taskId, taskName, estimateMinutes) =>
    invokeTracker("startTimer", taskId, taskName, estimateMinutes),
  pauseTimer: () => invokeTracker("pauseTimer"),
  resumeTimer: () => invokeTracker("resumeTimer"),
  stopTimer: () => invokeTracker("stopTimer"),
  getTimerState: () => invokeTracker("getTimerState"),
  onTimerTick: (callback) => {
    ipcRenderer.removeAllListeners("timer-tick");
    ipcRenderer.on("timer-tick", (event, data) => callback(data));
  },

  // Backup & Safe Data Operations
  exportBackup: () => invokeTracker("exportBackup"),
  importBackup: (jsonData) => invokeTracker("importBackup", jsonData),
  resetData: (scope) => invokeTracker("resetData", scope),
});
