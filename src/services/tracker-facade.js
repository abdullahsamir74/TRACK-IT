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
    return this.repo.markTaskComplete(taskId);
  }

  markTaskIncomplete(taskId) {
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
