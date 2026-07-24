const { contextBridge, ipcRenderer } = require("electron");

// Helper to invoke method on the TrackerFacade ('tracker') service
const invokeTracker = (methodName, ...args) =>
  ipcRenderer.invoke("service-invoke", "tracker", methodName, ...args);

contextBridge.exposeInMainWorld("tracker", {
  // Window controls (handled directly by Electron Main)
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

  // Sessions
  getSessions: (taskId) => invokeTracker("getSessions", taskId),
  getAllSessions: () => invokeTracker("getAllSessions"),
  deleteSession: (identifier) => invokeTracker("deleteSession", identifier),
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

  // Reset & ordering
  resetAll: () => invokeTracker("resetAll"),
  resetTrackingData: () => invokeTracker("resetTrackingData"),
  resetSessions: () => invokeTracker("resetSessions"),
  resetProjects: () => invokeTracker("resetProjects"),
  saveTaskOrder: (orderedIds) => invokeTracker("saveTaskOrder", orderedIds),
  getTaskOrder: () => invokeTracker("getTaskOrder"),

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

  // Weekly Targets
  getWeeklyTargets: () => invokeTracker("getWeeklyTargets"),
  saveWeeklyTarget: (targetKey, hours) =>
    invokeTracker("saveWeeklyTarget", targetKey, hours),
});
