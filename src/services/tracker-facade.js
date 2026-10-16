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
    return this.repo.tasks.getTasks();
  }

  saveTask(task) {
    return this.repo.tasks.saveTask(task);
  }

  saveTaskNotes(taskId, notes, taskName = null) {
    return this.repo.tasks.saveTaskNotes(taskId, notes, taskName);
  }

  deleteTask(taskId) {
    return this.repo.tasks.deleteTask(taskId);
  }

  setEstimate(taskId, minutes) {
    return this.repo.tasks.setEstimate(taskId, minutes);
  }

  async markTaskComplete(taskId, autoLogEstimate = true) {
    const timerState = this.timer ? this.timer.getState() : null;
    if (
      this.timer &&
      this.timer.isRunning() &&
      timerState &&
      timerState.taskId === taskId
    ) {
      const session = this.timer.stop();
      if (session) {
        await this.repo.sessions.saveSession(session);
      }
    } else if (autoLogEstimate) {
      // No active timer on this task — check if task has an estimate to auto-log offline progress
      const tasks = await this.repo.tasks.getTasks();
      const task = tasks[taskId];
      if (task) {
        const estimateMin = task.estimateMinutes || 0;
        if (estimateMin > 0) {
          const existingTracked = task.totalTrackedMinutes || 0;
          if (existingTracked < estimateMin) {
            const durationToAdd =
              Math.round((estimateMin - existingTracked) * 10) / 10;
            const durationMs = Math.round(durationToAdd * 60000);
            const now = new Date();
            const taskDate = task.start ? new Date(task.start) : now;
            const isScheduledToday =
              taskDate.getFullYear() === now.getFullYear() &&
              taskDate.getMonth() === now.getMonth() &&
              taskDate.getDate() === now.getDate();
            const sessionDate =
              isScheduledToday && !isNaN(taskDate.getTime()) ? taskDate : now;
            const startTime = sessionDate.toISOString();
            const endTime = new Date(
              sessionDate.getTime() + durationMs,
            ).toISOString();

            await this.repo.sessions.saveSession({
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

    return this.repo.tasks.markTaskComplete(taskId);
  }

  async markTaskIncomplete(taskId) {
    await this.repo.sessions.deleteCompletionSession(taskId);
    return this.repo.tasks.markTaskIncomplete(taskId);
  }

  saveTaskOrder(orderedIds) {
    return this.repo.tasks.saveTaskOrder(orderedIds);
  }

  getTaskOrder() {
    return this.repo.tasks.getTaskOrder();
  }

  getTaskSortMode() {
    return this.repo.tasks.getTaskSortMode();
  }

  saveTaskSortMode(mode) {
    return this.repo.tasks.saveTaskSortMode(mode);
  }

  // --- Time Entries / Sessions ---
  getAllSessions(options) {
    return this.repo.sessions.getAllSessions(options);
  }

  getSessions(taskId) {
    return this.repo.sessions.getSessions(taskId);
  }

  saveSession(session) {
    return this.repo.sessions.saveSession(session);
  }

  deleteSession(identifier) {
    return this.repo.sessions.deleteSession(identifier);
  }

  // --- Projects ---
  getProjects() {
    return this.repo.projects.getProjects();
  }

  saveProject(project) {
    return this.repo.projects.saveProject(project);
  }

  deleteProject(projectId) {
    return this.repo.projects.deleteProject(projectId);
  }

  assignTaskToProject(taskId, projectId) {
    return this.repo.projects.assignTaskToProject(taskId, projectId);
  }

  saveProjectOrder(orderedIds) {
    return this.repo.projects.saveProjectOrder(orderedIds);
  }

  getProjectOrder() {
    return this.repo.projects.getProjectOrder();
  }

  // --- Habits ---
  getHabits() {
    return this.repo.habits.getHabits();
  }

  saveHabit(habit) {
    return this.repo.habits.saveHabit(habit);
  }

  deleteHabit(habitId) {
    return this.repo.habits.deleteHabit(habitId);
  }

  // --- Targets & Settings ---
  getWeeklyTargets() {
    return this.repo.settings.getWeeklyTargets();
  }

  saveWeeklyTarget(targetKey, hours) {
    return this.repo.settings.saveWeeklyTarget(targetKey, hours);
  }

  getSetting(key, defaultVal) {
    return this.repo.settings.getSetting(key, defaultVal);
  }

  setSetting(key, value) {
    return this.repo.settings.setSetting(key, value);
  }

  // --- Analytics ---
  getAnalytics(range) {
    return this.analytics.getAnalytics(range);
  }

  // --- Timer ---
  async startTimer(taskId, taskName, estimateMinutes, onTick) {
    // If another timer is running for a different task, stop and save it first
    if (this.timer.isRunning()) {
      const state = this.timer.getState();
      if (state.taskId !== taskId) {
        const session = this.timer.stop();
        if (session) {
          await this.repo.sessions.saveSession(session);
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

  async stopTimer() {
    const session = this.timer.stop();
    if (session) {
      await this.repo.sessions.saveSession(session);
    }
    return session;
  }

  getTimerState() {
    return this.timer.getState();
  }

  // --- Backup & Safe Data Management ---
  exportBackup() {
    return this.repo.backup.exportDatabaseJson();
  }

  importBackup(jsonData) {
    return this.repo.backup.importDatabaseJson(jsonData);
  }

  resetData(scope) {
    return this.repo.backup.resetData(scope);
  }
}

module.exports = TrackerFacade;
