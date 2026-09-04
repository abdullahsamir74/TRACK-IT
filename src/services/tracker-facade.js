class TrackerFacade {
  constructor(repository, analyticsService, timerService, calendarService) {
    this.repo = repository;
    this.analytics = analyticsService;
    this.timer = timerService;
    this.calendar = calendarService;
  }

  // --- Calendar ---
  async getCalendarEvents() {
    return await this.calendar.getEvents();
  }

  getCalendars() {
    return this.calendar.getCalendars();
  }

  // --- Tasks ---
  getTasks() {
    return this.repo.getTasks();
  }

  saveTask(task) {
    return this.repo.saveTask(task);
  }

  saveTaskNotes(taskId, notes) {
    return this.repo.saveTaskNotes(taskId, notes);
  }

  deleteTask(taskId) {
    return this.repo.deleteTask(taskId);
  }

  setEstimate(taskId, minutes) {
    return this.repo.setEstimate(taskId, minutes);
  }

  markTaskComplete(taskId) {
    const timerState = this.timer ? this.timer.getState() : null;
    if (this.timer && this.timer.isRunning() && timerState && timerState.taskId === taskId) {
      const session = this.timer.stop();
      if (session) {
        this.repo.saveSession(session);
      }
    } else {
      // No active timer on this task — check if task has an estimate to auto-log offline progress
      const tasks = this.repo.getTasks();
      const task = tasks[taskId];
      if (task) {
        const estimateMin = task.estimateMinutes || 0;
        if (estimateMin > 0) {
          const existingTracked = task.totalTrackedMinutes || 0;
          if (existingTracked < estimateMin) {
            const durationToAdd = Math.round((estimateMin - existingTracked) * 10) / 10;
            const durationMs = Math.round(durationToAdd * 60000);
            const now = new Date();
            const taskDate = task.start ? new Date(task.start) : now;
            const isScheduledToday =
              taskDate.getFullYear() === now.getFullYear() &&
              taskDate.getMonth() === now.getMonth() &&
              taskDate.getDate() === now.getDate();
            const sessionDate = isScheduledToday && !isNaN(taskDate.getTime()) ? taskDate : now;
            const startTime = sessionDate.toISOString();
            const endTime = new Date(sessionDate.getTime() + durationMs).toISOString();

            this.repo.saveSession({
              id: `session_comp_${taskId}_${Date.now()}`,
              taskId,
              projectId: task.projectId || null,
              taskName: task.name || taskId,
              startTime,
              endTime,
              durationMinutes: durationToAdd,
              durationMs,
              entryType: "manual",
              notes: "Completed offline with estimated duration",
              completionSession: true,
            });
          }
        }
      }
    }

    return this.repo.markTaskComplete(taskId);
  }

  markTaskIncomplete(taskId) {
    this.repo.deleteCompletionSession(taskId);
    return this.repo.markTaskIncomplete(taskId);
  }

  saveTaskOrder(orderedIds) {
    return this.repo.saveTaskOrder(orderedIds);
  }

  getTaskOrder() {
    return this.repo.getTaskOrder();
  }

  getTaskSortMode() {
    return this.repo.getTaskSortMode();
  }

  saveTaskSortMode(mode) {
    return this.repo.saveTaskSortMode(mode);
  }

  // --- Time Entries / Sessions ---
  getAllSessions(options) {
    return this.repo.getAllSessions(options);
  }

  getSessions(taskId) {
    return this.repo.getSessions(taskId);
  }

  saveSession(session) {
    return this.repo.saveSession(session);
  }

  deleteSession(identifier) {
    return this.repo.deleteSession(identifier);
  }

  // --- Projects ---
  getProjects() {
    return this.repo.getProjects();
  }

  saveProject(project) {
    return this.repo.saveProject(project);
  }

  deleteProject(projectId) {
    return this.repo.deleteProject(projectId);
  }

  assignTaskToProject(taskId, projectId) {
    return this.repo.assignTaskToProject(taskId, projectId);
  }

  saveProjectOrder(orderedIds) {
    return this.repo.saveProjectOrder(orderedIds);
  }

  getProjectOrder() {
    return this.repo.getProjectOrder();
  }

  // --- Habits ---
  getHabits() {
    return this.repo.getHabits();
  }

  saveHabit(habit) {
    return this.repo.saveHabit(habit);
  }

  deleteHabit(habitId) {
    return this.repo.deleteHabit(habitId);
  }

  // --- Targets & Settings ---
  getWeeklyTargets() {
    return this.repo.getWeeklyTargets();
  }

  saveWeeklyTarget(targetKey, hours) {
    return this.repo.saveWeeklyTarget(targetKey, hours);
  }

  getSetting(key, defaultVal) {
    return this.repo.getSetting(key, defaultVal);
  }

  setSetting(key, value) {
    return this.repo.setSetting(key, value);
  }

  // --- Analytics ---
  getAnalytics(range) {
    return this.analytics.getAnalytics(range);
  }

  // --- Timer ---
  startTimer(taskId, taskName, estimateMinutes, onTick) {
    // If another timer is running for a different task, stop and save it first
    if (this.timer.isRunning()) {
      const state = this.timer.getState();
      if (state.taskId !== taskId) {
        const session = this.timer.stop();
        if (session) {
          this.repo.saveSession(session);
        }
      }
    }
    return this.timer.start(taskId, taskName, estimateMinutes, onTick);
  }

  pauseTimer() {
    return this.timer.pause();
  }

  resumeTimer(onTick) {
    return this.timer.resume(onTick);
  }

  stopTimer() {
    const session = this.timer.stop();
    if (session) {
      this.repo.saveSession(session);
    }
    return session;
  }

  getTimerState() {
    return this.timer.getState();
  }

  // --- Backup & Safe Data Management ---
  exportBackup() {
    return this.repo.exportDatabaseJson();
  }

  importBackup(jsonData) {
    return this.repo.importDatabaseJson(jsonData);
  }

  resetData(scope) {
    return this.repo.resetData(scope);
  }
}

module.exports = TrackerFacade;
