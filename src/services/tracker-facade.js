class TrackerFacade {
  constructor(trackingService, timerService, calendarService) {
    this.tracking = trackingService;
    this.timer = timerService;
    this.calendar = calendarService;
  }

  // Task tracking delegation
  getTasks() {
    return this.tracking.getTasks();
  }

  saveTask(task) {
    return this.tracking.saveTask(task);
  }

  deleteTask(taskId) {
    return this.tracking.deleteTask(taskId);
  }

  setEstimate(taskId, minutes) {
    return this.tracking.setEstimate(taskId, minutes);
  }

  getSessions(taskId) {
    return this.tracking.getSessions(taskId);
  }

  getAllSessions() {
    return this.tracking.getAllSessions();
  }

  getAnalytics(range) {
    return this.tracking.getAnalytics(range);
  }

  // Calendar delegation
  getCalendars() {
    return this.calendar.getCalendars();
  }

  getCalendarEvents() {
    return this.calendar.getEvents();
  }

  // Timer delegation
  getTimerState() {
    return this.timer.getState();
  }

  pauseTimer() {
    return this.timer.pause();
  }

  resumeTimer(onTick) {
    return this.timer.resume(onTick);
  }

  startTimer(taskId, taskName, estimateMinutes, onTick) {
    // If another timer is running, stop and save it first
    if (this.timer.isRunning()) {
      const state = this.timer.getState();
      if (state.taskId !== taskId) {
        const session = this.timer.stop();
        if (session) {
          this.tracking.saveSession(session);
        }
      }
    }
    return this.timer.start(taskId, taskName, estimateMinutes, onTick);
  }

  stopTimer() {
    const session = this.timer.stop();
    if (session) {
      this.tracking.saveSession(session);
    }
    return session;
  }

  // Task Completion coordination
  markTaskComplete(taskId) {
    const timerState = this.timer.getState();
    if (this.timer.isRunning() && timerState.taskId === taskId) {
      const session = this.timer.stop();
      if (session) {
        this.tracking.saveSession(session);
      }
    } else {
      const tasks = this.tracking.getTasks();
      const task = tasks[taskId] || {};
      const estimateMin = task.estimateMinutes || 0;
      const durationMs = estimateMin * 60000;
      const taskDate = task.start ? new Date(task.start) : new Date();
      const endTime = new Date(taskDate.getTime() + durationMs);
      this.tracking.saveSession({
        taskId,
        taskName: task.name || taskId,
        startTime: taskDate.toISOString(),
        endTime: endTime.toISOString(),
        durationMs,
        durationMinutes: estimateMin,
        estimateMinutes: estimateMin || null,
        completionSession: true,
      });
    }
    return this.tracking.markComplete(taskId);
  }

  markTaskIncomplete(taskId) {
    return this.tracking.markIncomplete(taskId);
  }

  // Reset delegations
  resetAll() {
    return this.tracking.resetAll();
  }

  resetTrackingData() {
    return this.tracking.resetTrackingData();
  }

  resetSessions() {
    return this.tracking.resetSessions();
  }

  resetProjects() {
    return this.tracking.resetProjects();
  }

  // Task ordering delegations
  saveTaskOrder(orderedIds) {
    return this.tracking.saveTaskOrder(orderedIds);
  }

  getTaskOrder() {
    return this.tracking.getTaskOrder();
  }

  // Projects delegations
  getProjects() {
    return this.tracking.getProjects();
  }

  saveProject(project) {
    return this.tracking.saveProject(project);
  }

  deleteProject(projectId) {
    return this.tracking.deleteProject(projectId);
  }

  assignTaskToProject(taskId, projectId) {
    return this.tracking.assignTaskToProject(taskId, projectId);
  }

  saveProjectOrder(orderedIds) {
    return this.tracking.saveProjectOrder(orderedIds);
  }

  getProjectOrder() {
    return this.tracking.getProjectOrder();
  }

  // Habits delegations
  getHabits() {
    return this.tracking.getHabits();
  }

  saveHabit(habit) {
    return this.tracking.saveHabit(habit);
  }

  deleteHabit(habitId) {
    return this.tracking.deleteHabit(habitId);
  }
}

module.exports = TrackerFacade;
