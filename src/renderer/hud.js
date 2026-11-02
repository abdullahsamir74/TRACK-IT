/* ========================================
   FOCUS HUD — Always-on-top Momentum window
   ======================================== */

import { formatDuration, escapeHtml } from "./utils.js";

const RING_CIRCUMFERENCE = 2 * Math.PI * 30;
const FOCUS_LIMIT = 3;

const state = {
  expanded: false,
  theme: "dark",
  tasks: {},
  calendarEvents: [],
  focus3: [],
  goalHours: 4,
  summary: null,
  timer: null,
};

const $ = (id) => document.getElementById(id);

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseFocus3(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).slice(0, FOCUS_LIMIT);
  } catch {
    // ignore malformed values
  }
  return [];
}

function findTask(id) {
  const task = state.tasks[id];
  if (task) {
    return {
      id,
      name: task.name || "Untitled Task",
      completed: Boolean(task.completed),
      estimateMinutes: task.estimateMinutes || null,
      start: task.start || null,
      notes: task.notes || task.description || "",
    };
  }

  const event = state.calendarEvents.find((item) => item.id === id);
  if (event) {
    return {
      id,
      name: event.summary || "Untitled Task",
      completed: false,
      estimateMinutes: event.durationMinutes || null,
      start: event.start || null,
      notes: event.description || "",
    };
  }

  return null;
}

function getFocusTasks() {
  return state.focus3.map(findTask).filter(Boolean);
}

function nextFocusTask() {
  return getFocusTasks().find((task) => !task.completed) || null;
}

function defaultTaskName() {
  return nextFocusTask()?.name || "No focus session";
}

/* ---- Data ---- */

async function refreshAll() {
  const todayKey = getTodayKey();

  try {
    const [tasks, timer, summary, focusRaw, goalRaw, calendarEvents] =
      await Promise.all([
        window.hud.invoke("getTasks"),
        window.hud.invoke("getTimerState"),
        window.hud.invoke("getTodaySummary"),
        window.hud.invoke("getSetting", `focus3_${todayKey}`, "[]"),
        window.hud.invoke("getSetting", "daily_focus_goal_hours", "4"),
        window.hud.invoke("getCalendarEvents").catch(() => []),
      ]);

    state.tasks = tasks || {};
    state.timer = timer || null;
    state.summary = summary || null;
    state.calendarEvents = calendarEvents || [];
    state.focus3 = parseFocus3(focusRaw);

    const goal = parseFloat(goalRaw);
    state.goalHours = Number.isFinite(goal) && goal >= 0 ? goal : 4;

    render();
  } catch (err) {
    console.error("Could not refresh Focus HUD:", err);
  }
}

/* ---- Rendering ---- */

function render() {
  renderTimer();
  renderGoal();
  renderFocus3();
}

function renderTimer() {
  const timer = state.timer;
  const running = Boolean(timer?.running);
  const paused = Boolean(timer?.paused);
  const time = running ? timer.elapsedFormatted : "00:00:00";
  const name = running ? timer.taskName || "Focus session" : defaultTaskName();

  $("hud-pill-task").textContent = name;
  $("hud-pill-time").textContent = time;
  $("hud-task-name").textContent = name;
  $("hud-timer-display").textContent = time;

  const playLabel = $("hud-play-label");
  if (playLabel) {
    playLabel.textContent = running && !paused ? "Pause" : running ? "Resume" : "Start";
  }

  document.querySelectorAll(".hud-play-btn").forEach((btn) => {
    const playIcon = btn.querySelector(".icon-play");
    const pauseIcon = btn.querySelector(".icon-pause");
    if (playIcon) playIcon.style.display = running && !paused ? "none" : "";
    if (pauseIcon) pauseIcon.style.display = running && !paused ? "" : "none";
  });

  document.querySelectorAll(".hud-stop-btn").forEach((btn) => {
    btn.disabled = !running;
  });

  const dot = $("hud-status-dot");
  dot.className = "hud-status-dot";
  if (running) dot.classList.add(paused ? "paused" : "active");
}

function renderGoal() {
  const summary = state.summary;
  const tracked = summary?.trackedMinutes ?? 0;
  const goalMinutes = summary?.goalMinutes ?? Math.round(state.goalHours * 60);
  const progress =
    summary?.goalProgress ??
    (goalMinutes > 0 ? Math.min(1, tracked / goalMinutes) : 0);
  const percent = Math.round(progress * 100);

  const ring = $("hud-ring-progress");
  if (ring) {
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
    ring.classList.toggle("complete", Boolean(summary?.goalMet));
  }

  $("hud-ring-percent").textContent = `${percent}%`;
  $("hud-goal-tracked").textContent = formatDuration(tracked);
  $("hud-goal-total").textContent = `/ ${formatDuration(goalMinutes)}`;

  const sub = $("hud-goal-sub");
  if (summary?.goalMet) {
    sub.textContent = "Goal complete — nice work";
  } else if (tracked > 0) {
    const remaining =
      summary?.remainingMinutes ?? Math.max(0, goalMinutes - tracked);
    sub.textContent = `${formatDuration(remaining)} to go`;
  } else {
    sub.textContent = "Start a session";
  }

  $("hud-streak-count").textContent = String(summary?.streak ?? 0);
}

function renderFocus3() {
  const list = $("hud-focus3-list");
  if (!list) return;

  const entries = state.focus3.map((id) => ({ id, item: findTask(id) }));
  const done = entries.filter((entry) => entry.item?.completed).length;

  $("hud-focus3-count").textContent = `${done}/${state.focus3.length || FOCUS_LIMIT}`;
  list.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hud-focus3-empty";
    empty.textContent =
      "Star up to three tasks in TRACK IT to keep them in view here.";
    list.appendChild(empty);
    return;
  }

  entries.forEach(({ item }) => {
    if (!item) {
      const missing = document.createElement("div");
      missing.className = "hud-focus-row unavailable";
      missing.innerHTML =
        '<span class="hud-focus-name">Task no longer available</span>';
      list.appendChild(missing);
      return;
    }

    const isActive =
      state.timer?.running &&
      state.timer.taskId === item.id &&
      !state.timer.paused;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `hud-focus-row${item.completed ? " completed" : ""}`;
    row.dataset.id = item.id;
    row.title = item.completed
      ? "Mark incomplete"
      : isActive
        ? "Pause this session"
        : "Start a focus session";
    row.innerHTML = `
      <span class="hud-focus-check${item.completed ? " checked" : ""}" data-action="toggle"></span>
      <span class="hud-focus-name">${escapeHtml(item.name)}</span>
      ${item.completed ? "" : `<span class="hud-focus-play" data-action="start">${isActive ? "⏸" : "▶"}</span>`}
    `;

    row.addEventListener("click", async (event) => {
      const actionEl = event.target.closest("[data-action]");
      const action = actionEl?.dataset.action || "start";

      try {
        if (action === "toggle") {
          if (item.completed) {
            await window.hud.invoke("markTaskIncomplete", item.id);
          } else {
            await window.hud.invoke("saveTask", {
              id: item.id,
              name: item.name,
              start: item.start,
              notes: item.notes,
              estimateMinutes: item.estimateMinutes,
            });
            await window.hud.invoke("markTaskComplete", item.id);
          }
        } else if (action === "start" && !item.completed) {
          await startTask(item);
        }
      } catch (err) {
        console.error("HUD action failed:", err);
      }

      await refreshAll();
    });

    list.appendChild(row);
  });
}

/* ---- Actions ---- */

async function startTask(item) {
  const current = state.timer;
  if (current?.running && current.taskId === item.id) {
    if (current.paused) {
      await window.hud.invoke("resumeTimer");
    } else {
      await window.hud.invoke("pauseTimer");
    }
    return;
  }
  await window.hud.invoke(
    "startTimer",
    item.id,
    item.name,
    item.estimateMinutes,
  );
}

async function toggleTimer() {
  const timer = state.timer;

  try {
    if (timer?.running && !timer.paused) {
      await window.hud.invoke("pauseTimer");
    } else if (timer?.running && timer.paused) {
      await window.hud.invoke("resumeTimer");
    } else {
      const next = nextFocusTask();
      if (next) {
        await window.hud.invoke(
          "startTimer",
          next.id,
          next.name,
          next.estimateMinutes,
        );
      } else {
        await window.hud.invoke("startTimer", null, "General Focus", null);
      }
    }
  } catch (err) {
    console.error("HUD timer action failed:", err);
  }

  await refreshAll();
}

async function stopTimer() {
  try {
    await window.hud.invoke("stopTimer");
  } catch (err) {
    console.error("HUD stop failed:", err);
  }
  await refreshAll();
}

function applyExpanded() {
  const hud = $("hud");
  hud.classList.toggle("is-expanded", state.expanded);
  hud.classList.toggle("is-collapsed", !state.expanded);

  const expandBtn = $("hud-expand");
  if (expandBtn) {
    expandBtn.title = state.expanded ? "Collapse HUD" : "Expand HUD";
    expandBtn.setAttribute(
      "aria-label",
      state.expanded ? "Collapse HUD" : "Expand HUD",
    );
  }
}

function toggleExpanded() {
  state.expanded = !state.expanded;
  applyExpanded();
  window.hud.setExpanded(state.expanded);
}

/* ---- Wiring ---- */

function wireEvents() {
  $("hud-close").addEventListener("click", () => window.hud.close());
  $("hud-expand").addEventListener("click", toggleExpanded);

  $("hud-pill-play").addEventListener("click", toggleTimer);
  $("hud-play").addEventListener("click", toggleTimer);
  $("hud-pill-stop").addEventListener("click", stopTimer);
  $("hud-stop").addEventListener("click", stopTimer);

  window.hud.onTimerTick((timer) => {
    state.timer = timer;
    renderTimer();
  });

  window.hud.onDataChanged(() => {
    void refreshAll();
  });
}

let themeFromEvent = false;

async function init() {
  // Register the theme listener before the first await: a theme message sent
  // while the initial state request is in flight must never be dropped.
  window.hud.onTheme((theme) => {
    themeFromEvent = true;
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
  });

  try {
    const hudState = await window.hud.getState();
    state.expanded = Boolean(hudState?.expanded);
    if (!themeFromEvent) {
      state.theme = hudState?.theme === "light" ? "light" : "dark";
    }
  } catch {
    // Defaults are fine.
  }

  document.documentElement.setAttribute("data-theme", state.theme);
  applyExpanded();
  wireEvents();
  await refreshAll();
}

init();
