/* ========================================
   VIEW — Timer
   ======================================== */

import {
  formatDuration,
  escapeHtml,
  getLocalDateString,
  getCombinedEvents,
} from "../utils.js";
import {
  calendarEvents,
  trackedTasks,
  setTrackedTasks,
  selectedTimerTask,
  setSelectedTimerTask,
  taskOrder,
  updateStreakCount,
} from "../state.js";
import { initDragAndDrop } from "../components/drag-drop.js";
import { playTimerStopSound, playAlarmSound } from "../sounds.js";
import { resetEstimateAlert } from "../app.js";
import { openTaskNotesModal } from "../components/modals.js";

let timerMode = "stopwatch"; // "stopwatch" | "pomodoro"
let pomodoroFocusMins = 25;
let pomodoroBreakMins = 5;
let pomodoroPhase = "focus"; // "focus" | "shortBreak" | "longBreak"
let pomodoroBlockCount = 1; // 1 to 4
let pomodoroPhaseFired = false;

function updatePomodoroPhaseBadge() {
  const phaseBadge = document.getElementById("pomodoro-phase-badge");
  if (!phaseBadge) return;

  phaseBadge.className = "pomodoro-phase-badge";

  if (pomodoroPhase === "focus") {
    phaseBadge.textContent = `FOCUS SESSION (${pomodoroBlockCount}/4)`;
  } else if (pomodoroPhase === "shortBreak") {
    phaseBadge.classList.add("phase-break-short");
    phaseBadge.textContent = `SHORT BREAK (${pomodoroBreakMins}M)`;
  } else if (pomodoroPhase === "longBreak") {
    phaseBadge.classList.add("phase-break-long");
    phaseBadge.textContent = "LONG BREAK (15M)";
  }
}

/**
 * Initialize timer control buttons (play/pause, stop).
 */
export function initTimerControls() {
  const startBtn = document.getElementById("btn-timer-start");
  const stopBtn = document.getElementById("btn-timer-stop");

  // Mode switcher listeners
  const modeBtns = document.querySelectorAll(".timer-mode-btn");
  const presetsContainer = document.getElementById("pomodoro-presets");
  const phaseBadge = document.getElementById("pomodoro-phase-badge");

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      timerMode = btn.dataset.mode;
      pomodoroPhaseFired = false;

      if (timerMode === "pomodoro") {
        if (presetsContainer) presetsContainer.style.display = "flex";
        if (phaseBadge) phaseBadge.style.display = "inline-block";
        updatePomodoroPhaseBadge();
      } else {
        if (presetsContainer) presetsContainer.style.display = "none";
        if (phaseBadge) phaseBadge.style.display = "none";
      }

      window.tracker.getTimerState().then((state) => {
        if (state && state.running) {
          updateTimerDisplay(state);
        } else {
          refreshIdleTimerDisplay();
        }
      });
    });
  });

  // Preset buttons listeners
  const presetBtns = document.querySelectorAll(".pomo-preset-btn");
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      presetBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      pomodoroFocusMins = parseInt(btn.dataset.focus, 10);
      pomodoroBreakMins = parseInt(btn.dataset.break, 10);
      updatePomodoroPhaseBadge();
      window.tracker.getTimerState().then((state) => {
        if (state && state.running) {
          updateTimerDisplay(state);
        } else {
          refreshIdleTimerDisplay();
        }
      });
    });
  });

  startBtn.addEventListener("click", async () => {
    const timerState = await window.tracker.getTimerState();

    // If a different task is selected in the UI than the one currently running/paused,
    // automatically stop the current task and save its session, then start the new task from 0.
    if (
      timerState.running &&
      selectedTimerTask &&
      timerState.taskId !== selectedTimerTask.id
    ) {
      await window.tracker.stopTimer();
      startTimerForTask(true);
      return;
    }

    if (timerState.running && !timerState.paused) {
      // Pause
      await window.tracker.pauseTimer();
      document.getElementById("timer-play-icon").style.display = "";
      document.getElementById("timer-pause-icon").style.display = "none";
    } else if (timerState.running && timerState.paused) {
      // Resume
      await window.tracker.resumeTimer();
      document.getElementById("timer-play-icon").style.display = "none";
      document.getElementById("timer-pause-icon").style.display = "";
      enterFullscreenTimer();
    } else {
      // Start new
      startTimerForTask(false);
    }
  });

  stopBtn.addEventListener("click", async () => {
    const session = await window.tracker.stopTimer();
    if (session) {
      // Play stop sound and reset estimate alert
      const soundEnabled =
        localStorage.getItem("tracker-sounds-enabled") !== "false";
      if (soundEnabled) {
        playTimerStopSound();
      }
      resetEstimateAlert();

      // Reset pomodoro cycle
      pomodoroPhase = "focus";
      pomodoroBlockCount = 1;
      pomodoroPhaseFired = false;
      updatePomodoroPhaseBadge();

      // Reset display
      document.getElementById("timer-display").textContent =
        timerMode === "pomodoro"
          ? `${String(pomodoroFocusMins).padStart(2, "0")}:00`
          : "00:00:00";
      document.getElementById("timer-task-name").textContent =
        "No task selected";
      document.getElementById("timer-play-icon").style.display = "";
      document.getElementById("timer-pause-icon").style.display = "none";
      stopBtn.disabled = true;

      // Reset ring
      const ring = document.querySelector(".timer-ring-progress");
      if (ring) {
        ring.style.strokeDashoffset =
          timerMode === "pomodoro" ? "0" : "565.48";
        ring.style.stroke = "var(--text-primary)";
      }

      // Reset estimate bar
      document.getElementById("timer-estimate-bar").style.display = "none";
      document.getElementById("timer-estimate-fill").style.width = "0%";

      // Clear selected timer task
      setSelectedTimerTask(null);

      // Exit fullscreen if active
      exitFullscreenTimer();

      // Refresh
      setTrackedTasks(await window.tracker.getTasks());
      renderTimerView();
    }
  });

  // Global Escape key listener to exit fullscreen
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      exitFullscreenTimer();
    }
  });

  // Handle system fullscreen change (e.g. F11 or OS menu exit)
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      const overlay = document.getElementById("fullscreen-timer-overlay");
      if (overlay) overlay.style.display = "none";
    }
  });

  // Click handler for fullscreen close button
  const closeBtn = document.getElementById("btn-fullscreen-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      exitFullscreenTimer();
    });
  }

  // Click handler for timer edit notes button
  const editNotesBtn = document.getElementById("btn-timer-edit-notes");
  if (editNotesBtn) {
    editNotesBtn.addEventListener("click", () => {
      if (selectedTimerTask) {
        openTaskNotesModal(selectedTimerTask);
      }
    });
  }
}

/**
 * Update the notes card on the timer view
 */
export function updateTimerNotesDisplay() {
  const notesCard = document.getElementById("timer-task-notes-card");
  const notesBody = document.getElementById("timer-task-notes-body");
  if (!notesCard || !notesBody) return;

  if (!selectedTimerTask) {
    notesCard.style.display = "none";
    return;
  }

  const taskObj = trackedTasks[selectedTimerTask.id] || {};
  const notes = (taskObj.notes || taskObj.description || "").trim();

  if (notes) {
    notesCard.style.display = "flex";
    notesBody.innerHTML = escapeHtml(notes).replace(/\n/g, "<br>");
  } else {
    notesCard.style.display = "none";
  }
}

/**
 * Start the timer for the currently selected task.
 */
export async function startTimerForTask(isNewTask = false) {
  if (isNewTask) {
    pomodoroPhase = "focus";
    pomodoroBlockCount = 1;
  }

  if (!selectedTimerTask) {
    setSelectedTimerTask({
      id: null,
      name:
        timerMode === "pomodoro"
          ? pomodoroPhase === "focus"
            ? "Pomodoro Focus"
            : pomodoroPhase === "shortBreak"
              ? "Short Break"
              : "Long Break"
          : "General Focus",
      estimate: null,
      totalEstimate: null,
    });
  }

  pomodoroPhaseFired = false;
  updatePomodoroPhaseBadge();

  // Reset the estimate-reached alert so it can fire for this new session
  resetEstimateAlert();

  const taskObj = selectedTimerTask.id
    ? trackedTasks[selectedTimerTask.id] || {}
    : {};
  const totalEst =
    selectedTimerTask.totalEstimate ||
    selectedTimerTask.estimate ||
    taskObj.estimateMinutes ||
    null;
  const tracked = taskObj.totalTrackedMinutes || 0;
  const remainingEst =
    totalEst !== null && totalEst > 0
      ? Math.max(0, totalEst - tracked)
      : null;

  // Update selectedTimerTask with calculated remaining estimate
  selectedTimerTask.estimate = remainingEst;
  selectedTimerTask.totalEstimate = totalEst;

  let displayName = selectedTimerTask.name || "Focus Session";
  if (timerMode === "pomodoro" && pomodoroPhase !== "focus" && !selectedTimerTask.id) {
    displayName =
      pomodoroPhase === "shortBreak" ? "Short Break" : "Long Break";
  }

  await window.tracker.startTimer(
    selectedTimerTask.id,
    displayName,
    remainingEst,
  );

  document.getElementById("timer-task-name").textContent = displayName;
  document.getElementById("timer-play-icon").style.display = "none";
  document.getElementById("timer-pause-icon").style.display = "";
  document.getElementById("btn-timer-stop").disabled = false;

  // Show estimate bar if there's an estimate and mode is stopwatch
  if (remainingEst !== null && remainingEst > 0 && timerMode !== "pomodoro") {
    document.getElementById("timer-estimate-bar").style.display = "block";
    document.getElementById("timer-estimate-label").textContent =
      `Est: ${formatDuration(remainingEst)}`;
  } else {
    document.getElementById("timer-estimate-bar").style.display = "none";
  }

  // Update notes display
  updateTimerNotesDisplay();

  // Automatically trigger fullscreen mode when timer starts
  enterFullscreenTimer();
}

/**
 * Update the timer display from a tick event.
 */
export function updateTimerDisplay(state) {
  const ring = document.querySelector(".timer-ring-progress");
  const circumference = 565.48;

  if (timerMode === "pomodoro") {
    let targetMins = pomodoroFocusMins;
    if (pomodoroPhase === "shortBreak") {
      targetMins = pomodoroBreakMins;
    } else if (pomodoroPhase === "longBreak") {
      targetMins = 15;
    }

    const targetMs = targetMins * 60 * 1000;
    const elapsedMs = state.elapsedMs || 0;
    const remainingMs = Math.max(0, targetMs - elapsedMs);

    const remSecs = Math.floor(remainingMs / 1000);
    const remMins = Math.floor(remSecs / 60);
    const remSecsMod = remSecs % 60;
    const countdownStr = `${String(remMins).padStart(2, "0")}:${String(remSecsMod).padStart(2, "0")}`;

    document.getElementById("timer-display").textContent = countdownStr;

    const progress = Math.min(1, elapsedMs / targetMs);
    const offset = circumference * (1 - progress);
    if (ring) {
      ring.style.strokeDashoffset = offset;
      if (pomodoroPhase === "shortBreak") {
        ring.style.stroke = "var(--accent-green, #34d399)";
      } else if (pomodoroPhase === "longBreak") {
        ring.style.stroke = "var(--accent-pink, #f43f5e)";
      } else {
        ring.style.stroke = "var(--accent-blue, #38bdf8)";
      }
    }

    // Check phase completion
    if (remainingMs <= 0 && state.running && !pomodoroPhaseFired) {
      pomodoroPhaseFired = true;
      const soundEnabled =
        localStorage.getItem("tracker-sounds-enabled") !== "false";
      if (soundEnabled) {
        playAlarmSound();
      }

      // Advance phase internally through 4-block cycle
      if (pomodoroPhase === "focus") {
        if (pomodoroBlockCount >= 4) {
          pomodoroPhase = "longBreak";
          pomodoroBlockCount = 1;
        } else {
          pomodoroPhase = "shortBreak";
          pomodoroBlockCount++;
        }
      } else {
        pomodoroPhase = "focus";
      }

      updatePomodoroPhaseBadge();
      exitFullscreenTimer();

      // Stop timer and await manual Start from user for next phase
      window.tracker.stopTimer().then(async () => {
        const tasks = await window.tracker.getTasks();
        setTrackedTasks(tasks);

        const playIcon = document.getElementById("timer-play-icon");
        const pauseIcon = document.getElementById("timer-pause-icon");
        const stopBtn = document.getElementById("btn-timer-stop");

        if (playIcon) playIcon.style.display = "";
        if (pauseIcon) pauseIcon.style.display = "none";
        if (stopBtn) stopBtn.disabled = true;

        renderTimerView();
      });
    }
  } else {
    // Stopwatch Mode (Standard open-ended count-up)
    document.getElementById("timer-display").textContent =
      state.elapsedFormatted;

    const progress = state.progress || 0;
    const offset = circumference * (1 - Math.min(progress, 1));
    if (ring) {
      ring.style.strokeDashoffset = offset;
      if (progress > 1) {
        ring.style.stroke = "var(--accent-pink)";
      } else {
        ring.style.stroke = "var(--text-primary)";
      }
    }
  }

  const ringWrapper = document.querySelector(".timer-ring-wrapper");
  if (ringWrapper) {
    if (state.running && !state.paused) {
      ringWrapper.classList.add("running");
    } else {
      ringWrapper.classList.remove("running");
    }
  }

  // Update estimate bar
  if (state.estimateMinutes && timerMode !== "pomodoro") {
    const fill = document.getElementById("timer-estimate-fill");
    if (fill)
      fill.style.width = `${Math.min((state.progress || 0) * 100, 100)}%`;
  }

  // Update dashboard timer
  const dashboardTimer = document.getElementById("dashboard-active-timer");
  if (dashboardTimer && state.running) {
    dashboardTimer.style.display = "flex";
    document.getElementById("dashboard-timer-task").textContent =
      state.taskName;
    document.getElementById("dashboard-timer-display").textContent =
      timerMode === "pomodoro"
        ? document.getElementById("timer-display").textContent
        : state.elapsedFormatted;
  }

  // Update fullscreen display if it is visible
  const fsOverlay = document.getElementById("fullscreen-timer-overlay");
  if (fsOverlay && fsOverlay.style.display !== "none") {
    const fsDisplay = document.getElementById("fullscreen-timer-display");
    const fsTask = document.getElementById("fullscreen-task-name");
    if (fsDisplay)
      fsDisplay.textContent =
        timerMode === "pomodoro"
          ? document.getElementById("timer-display").textContent
          : state.elapsedFormatted;
    if (fsTask) fsTask.textContent = state.taskName;
  }
}

/**
 * Enter fullscreen timer mode.
 */
export function enterFullscreenTimer() {
  const overlay = document.getElementById("fullscreen-timer-overlay");
  if (!overlay) return;

  window.tracker
    .getTimerState()
    .then((state) => {
      if (state && state.running) {
        const nameEl = document.getElementById("fullscreen-task-name");
        const dispEl = document.getElementById("fullscreen-timer-display");
        if (nameEl) nameEl.textContent = state.taskName || "Untitled Task";
        if (dispEl) {
          dispEl.textContent =
            timerMode === "pomodoro"
              ? document.getElementById("timer-display").textContent
              : state.elapsedFormatted || "00:00:00";
        }
        overlay.style.display = "flex";

        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.warn("Could not enter fullscreen mode:", err);
          });
        }
      }
    })
    .catch((err) => {
      console.error("Error entering fullscreen timer:", err);
    });
}

/**
 * Exit fullscreen timer mode.
 */
export function exitFullscreenTimer() {
  const overlay = document.getElementById("fullscreen-timer-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  if (document.fullscreenElement) {
    document.exitFullscreen().catch((err) => {
      console.warn("Could not exit fullscreen mode:", err);
    });
  }
}

function refreshIdleTimerDisplay() {
  const ring = document.querySelector(".timer-ring-progress");
  if (timerMode === "pomodoro") {
    let targetMins = pomodoroFocusMins;
    if (pomodoroPhase === "shortBreak") {
      targetMins = pomodoroBreakMins;
    } else if (pomodoroPhase === "longBreak") {
      targetMins = 15;
    }
    const countdownStr = `${String(targetMins).padStart(2, "0")}:00`;
    document.getElementById("timer-display").textContent = countdownStr;
    if (ring) {
      ring.style.strokeDashoffset = "0";
      if (pomodoroPhase === "shortBreak") {
        ring.style.stroke = "var(--accent-green, #34d399)";
      } else if (pomodoroPhase === "longBreak") {
        ring.style.stroke = "var(--accent-pink, #f43f5e)";
      } else {
        ring.style.stroke = "var(--accent-blue, #38bdf8)";
      }
    }
  } else {
    document.getElementById("timer-display").textContent = "00:00:00";
    if (ring) {
      ring.style.strokeDashoffset = "565.48";
      ring.style.stroke = "var(--text-primary)";
    }
  }
}

/**
 * Render the main timer view.
 */
export async function renderTimerView() {
  updateStreakCount();
  const timerState = await window.tracker.getTimerState();

  // Update buttons based on state
  if (timerState.running) {
    document.getElementById("btn-timer-stop").disabled = false;
    document.getElementById("timer-task-name").textContent =
      timerState.taskName;
    document.getElementById("timer-display").textContent =
      timerState.elapsedFormatted;

    // Auto-select the currently active/paused task in the list
    setSelectedTimerTask({
      id: timerState.taskId,
      name: timerState.taskName,
      estimate: timerState.estimateMinutes,
    });

    if (timerState.paused) {
      document.getElementById("timer-play-icon").style.display = "";
      document.getElementById("timer-pause-icon").style.display = "none";
    } else {
      document.getElementById("timer-play-icon").style.display = "none";
      document.getElementById("timer-pause-icon").style.display = "";
    }

    if (timerState.estimateMinutes) {
      document.getElementById("timer-estimate-bar").style.display = "block";
      document.getElementById("timer-estimate-label").textContent =
        `Est: ${formatDuration(timerState.estimateMinutes)}`;
    }
  } else {
    // Reset view to idle if nothing is running
    document.getElementById("btn-timer-stop").disabled = true;
    if (selectedTimerTask && trackedTasks[selectedTimerTask.id]?.completed) {
      setSelectedTimerTask(null);
    }
    document.getElementById("timer-task-name").textContent = selectedTimerTask
      ? selectedTimerTask.name
      : "No task selected";
    document.getElementById("timer-play-icon").style.display = "";
    document.getElementById("timer-pause-icon").style.display = "none";
    document.getElementById("timer-estimate-bar").style.display = "none";
    refreshIdleTimerDisplay();
  }

  // Update task notes card
  updateTimerNotesDisplay();

  // Task selector
  renderTimerTaskList();
}

/**
 * Render the task list for the timer's task selector.
 */
function renderTimerTaskList() {
  const listEl = document.getElementById("timer-task-list");

  const merged = getCombinedEvents(calendarEvents, trackedTasks);
  const incompleteTasks = merged
    .map((e) => {
      const task = trackedTasks[e.id] || {};
      return {
        id: e.id,
        name: e.summary,
        estimate: task.estimateMinutes || e.durationMinutes || null,
        calendarColor: e.calendarColor || "#38bdf8",
        completed: task.completed || false,
      };
    })
    .filter((t) => !t.completed);

  // Deduplicate in case there are overlapping IDs
  const seen = new Set();
  const unique = incompleteTasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (unique.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state small"><p>No tasks available</p></div>';
    return;
  }

  // Sort unique tasks using taskOrder
  if (taskOrder && taskOrder.length > 0) {
    const orderMap = {};
    taskOrder.forEach((id, i) => (orderMap[id] = i));
    unique.sort((a, b) => {
      const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
      const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
      return oa - ob;
    });
  }

  listEl.innerHTML = "";
  unique.slice(0, 8).forEach((task) => {
    const taskObj = trackedTasks[task.id] || {};
    const totalEst = task.estimate;
    const tracked = taskObj.totalTrackedMinutes || 0;
    const remainingEst =
      totalEst !== null && totalEst > 0
        ? Math.max(0, totalEst - tracked)
        : null;
    const displayEst = remainingEst !== null ? remainingEst : totalEst;

    const opt = document.createElement("div");
    opt.className = `timer-task-option${selectedTimerTask?.id === task.id ? " selected" : ""}`;
    opt.dataset.taskId = task.id;
    opt.setAttribute("role", "button");
    opt.setAttribute("tabindex", "0");
    opt.innerHTML = `
      <div class="task-color-dot" style="background: ${task.calendarColor || "#38bdf8"}; height: 24px;"></div>
      <span style="flex:1; text-align:left;">${escapeHtml(task.name)}</span>
      ${displayEst ? `<span class="task-badge estimate">${formatDuration(displayEst)}${tracked > 0 ? " left" : ""}</span>` : ""}
    `;
    opt.addEventListener("click", () => {
      setSelectedTimerTask({
        id: task.id,
        name: task.name,
        estimate: displayEst,
        totalEstimate: totalEst,
      });
      document.getElementById("timer-task-name").textContent = task.name;
      if (displayEst && timerMode !== "pomodoro") {
        document.getElementById("timer-estimate-bar").style.display = "block";
        document.getElementById("timer-estimate-label").textContent =
          `Est: ${formatDuration(displayEst)}`;
      } else {
        document.getElementById("timer-estimate-bar").style.display = "none";
      }
      document
        .querySelectorAll(".timer-task-option")
        .forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");

      updateTimerNotesDisplay();

      window.tracker.getTimerState().then((tState) => {
        if (!tState || !tState.running) {
          pomodoroPhase = "focus";
          pomodoroBlockCount = 1;
          updatePomodoroPhaseBadge();
          refreshIdleTimerDisplay();
        }
      });
    });
    listEl.appendChild(opt);
  });

  // Initialize drag-and-drop on the task list
  initDragAndDrop(listEl);
}

