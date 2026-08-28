class TimerService {
  constructor() {
    this._state = {
      running: false,
      paused: false,
      taskId: null,
      taskName: null,
      estimateMinutes: null,
      startTime: null,
      pausedTime: null,
      totalPausedMs: 0,
      elapsedMs: 0,
    };
    this._interval = null;
    this._onTick = null;
  }

  _calculateElapsedMs() {
    if (!this._state.running || !this._state.startTime) return 0;
    if (this._state.paused && this._state.pausedTime) {
      return Math.max(
        0,
        this._state.pausedTime -
          this._state.startTime -
          this._state.totalPausedMs,
      );
    }
    return Math.max(
      0,
      Date.now() - this._state.startTime - this._state.totalPausedMs,
    );
  }

  /**
   * Start a new timer
   */
  start(taskId, taskName, estimateMinutes, onTick) {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    if (typeof onTick === "function") {
      this._onTick = onTick;
    }

    const est =
      typeof estimateMinutes === "number" &&
      !isNaN(estimateMinutes) &&
      estimateMinutes > 0
        ? estimateMinutes
        : null;

    this._state = {
      running: true,
      paused: false,
      taskId: taskId || null,
      taskName: taskName || "Untitled Task",
      estimateMinutes: est,
      startTime: Date.now(),
      pausedTime: null,
      totalPausedMs: 0,
      elapsedMs: 0,
    };

    this._interval = setInterval(() => {
      if (!this._state.paused) {
        this._state.elapsedMs = this._calculateElapsedMs();
        if (typeof this._onTick === "function") {
          this._onTick(this.getState());
        }
      }
    }, 1000);

    return this.getState();
  }

  /**
   * Pause the timer
   */
  pause() {
    if (this._state.running && !this._state.paused) {
      this._state.paused = true;
      this._state.pausedTime = Date.now();
      this._state.elapsedMs = this._calculateElapsedMs();
    }
    return this.getState();
  }

  /**
   * Resume the timer
   */
  resume(onTick) {
    if (typeof onTick === "function") {
      this._onTick = onTick;
    }

    if (this._state.running && this._state.paused) {
      const pauseDuration = Date.now() - (this._state.pausedTime || Date.now());
      this._state.totalPausedMs += pauseDuration;
      this._state.paused = false;
      this._state.pausedTime = null;

      if (this._interval) {
        clearInterval(this._interval);
      }
      this._interval = setInterval(() => {
        if (!this._state.paused) {
          this._state.elapsedMs = this._calculateElapsedMs();
          if (typeof this._onTick === "function") {
            this._onTick(this.getState());
          }
        }
      }, 1000);
    }
    return this.getState();
  }

  /**
   * Stop the timer and return the session data
   */
  stop() {
    if (!this._state.running) return null;

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    const finalElapsedMs = this._calculateElapsedMs();

    const session = {
      taskId: this._state.taskId,
      taskName: this._state.taskName,
      startTime: new Date(this._state.startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs: finalElapsedMs,
      durationMinutes: Math.round((finalElapsedMs / 60000) * 100) / 100,
      estimateMinutes: this._state.estimateMinutes,
    };

    this._state = {
      running: false,
      paused: false,
      taskId: null,
      taskName: null,
      estimateMinutes: null,
      startTime: null,
      pausedTime: null,
      totalPausedMs: 0,
      elapsedMs: 0,
    };

    return session;
  }

  /**
   * Check if timer is running
   */
  isRunning() {
    return this._state.running;
  }

  /**
   * Get current timer state
   */
  getState() {
    const elapsedMs = this._state.running ? this._calculateElapsedMs() : 0;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    let progress = 0;
    if (this._state.estimateMinutes && this._state.estimateMinutes > 0) {
      progress = Math.min(1, elapsedMs / 60000 / this._state.estimateMinutes);
    }

    return {
      running: this._state.running,
      paused: this._state.paused,
      taskId: this._state.taskId,
      taskName: this._state.taskName,
      estimateMinutes: this._state.estimateMinutes,
      elapsedMs,
      elapsedFormatted: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      progress: isNaN(progress) ? 0 : progress,
      hours,
      minutes,
      seconds,
    };
  }
}

module.exports = TimerService;
