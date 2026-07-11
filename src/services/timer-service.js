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
  }

  /**
   * Start a new timer
   */
  start(taskId, taskName, estimateMinutes, onTick) {
    // Stop any existing timer
    if (this._interval) {
      clearInterval(this._interval);
    }

    this._state = {
      running: true,
      paused: false,
      taskId,
      taskName,
      estimateMinutes: estimateMinutes || null,
      startTime: Date.now(),
      pausedTime: null,
      totalPausedMs: 0,
      elapsedMs: 0,
    };

    this._interval = setInterval(() => {
      if (!this._state.paused) {
        this._state.elapsedMs = Date.now() - this._state.startTime - this._state.totalPausedMs;
        if (onTick) {
          onTick(this.getState());
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
    }
    return this.getState();
  }

  /**
   * Resume the timer
   */
  resume(onTick) {
    if (this._state.running && this._state.paused) {
      const pauseDuration = Date.now() - this._state.pausedTime;
      this._state.totalPausedMs += pauseDuration;
      this._state.paused = false;
      this._state.pausedTime = null;

      // Re-attach tick callback if provided
      if (onTick && this._interval) {
        clearInterval(this._interval);
        this._interval = setInterval(() => {
          if (!this._state.paused) {
            this._state.elapsedMs = Date.now() - this._state.startTime - this._state.totalPausedMs;
            onTick(this.getState());
          }
        }, 1000);
      }
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

    // Calculate final elapsed time
    let finalElapsedMs;
    if (this._state.paused) {
      finalElapsedMs = this._state.pausedTime - this._state.startTime - this._state.totalPausedMs;
    } else {
      finalElapsedMs = Date.now() - this._state.startTime - this._state.totalPausedMs;
    }

    const session = {
      taskId: this._state.taskId,
      taskName: this._state.taskName,
      startTime: new Date(this._state.startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs: Math.max(0, finalElapsedMs),
      durationMinutes: Math.round(Math.max(0, finalElapsedMs) / 60000 * 100) / 100,
      estimateMinutes: this._state.estimateMinutes,
    };

    // Reset state
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
    const elapsedMs = this._state.running ? this._state.elapsedMs : 0;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    let progress = 0;
    if (this._state.estimateMinutes && this._state.estimateMinutes > 0) {
      progress = Math.min(1, (elapsedMs / 60000) / this._state.estimateMinutes);
    }

    return {
      running: this._state.running,
      paused: this._state.paused,
      taskId: this._state.taskId,
      taskName: this._state.taskName,
      estimateMinutes: this._state.estimateMinutes,
      elapsedMs,
      elapsedFormatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      progress,
      hours,
      minutes,
      seconds,
    };
  }
}

module.exports = TimerService;
