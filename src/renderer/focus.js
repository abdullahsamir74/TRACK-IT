/* ========================================
   FOCUS — Daily goal, Today's Focus 3 & celebrations
   ======================================== */

import {
  getState,
  setFocus3,
  setFocus3Date,
  setDailyGoalHours,
  setTodaySummary,
} from "./state.js";
import { getLocalDateString } from "./utils.js";
import {
  getCelebrationsEnabled,
  getSoundsEnabled,
} from "./preferences.js";

const FOCUS_KEY_PREFIX = "focus3_";
const GOAL_KEY = "daily_focus_goal_hours";
const CELEBRATED_PREFIX = "momentum-celebrated-";
export const DEFAULT_GOAL_HOURS = 4;
export const MAX_FOCUS_TASKS = 3;

export function getTodayKey() {
  return getLocalDateString();
}

export function getDailyGoalHours() {
  const hours = parseFloat(getState().dailyGoalHours);
  return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_GOAL_HOURS;
}

export async function setDailyGoal(hours) {
  const num = parseFloat(hours);
  const safe = Number.isFinite(num) && num >= 0 ? num : DEFAULT_GOAL_HOURS;
  await window.tracker.setSetting(GOAL_KEY, safe);
  setDailyGoalHours(safe);
  return safe;
}

/** Today's Focus 3 task IDs. Stale entries from another day are ignored. */
export function getFocus3() {
  const state = getState();
  if (state.focus3Date !== getTodayKey()) return [];
  return Array.isArray(state.focus3) ? state.focus3 : [];
}

export function isFocusTask(taskId) {
  return getFocus3().includes(taskId);
}

export async function saveFocus3(ids) {
  const todayKey = getTodayKey();
  const clean = Array.isArray(ids)
    ? [...new Set(ids.filter(Boolean))].slice(0, MAX_FOCUS_TASKS)
    : [];
  await window.tracker.setSetting(
    `${FOCUS_KEY_PREFIX}${todayKey}`,
    JSON.stringify(clean),
  );
  setFocus3(clean);
  setFocus3Date(todayKey);
  return clean;
}

/**
 * Add or remove a task from Today's Focus 3.
 * @returns {{ added: boolean, full?: boolean, ids: string[] }}
 */
export async function toggleFocusTask(taskId) {
  const current = getFocus3();
  if (current.includes(taskId)) {
    const next = current.filter((id) => id !== taskId);
    await saveFocus3(next);
    return { added: false, ids: next };
  }
  if (current.length >= MAX_FOCUS_TASKS) {
    return { added: false, full: true, ids: current };
  }
  const next = [...current, taskId];
  await saveFocus3(next);
  return { added: true, ids: next };
}

/** Fetch a fresh snapshot of today's progress and cache it in state. */
export async function refreshTodaySummary() {
  const summary = await window.tracker.getTodaySummary();
  setTodaySummary(summary);
  return summary;
}

/**
 * Start (or resume) a focus session for a task without navigating the main app.
 * Used by the HUD and by Focus 3 quick-start buttons.
 */
export async function startFocusTask(task, estimateMinutes = null) {
  const taskId = task?.id || null;
  const name = task?.name || task?.summary || "Focus Session";
  const current = await window.tracker.getTimerState();

  if (current && current.running) {
    if (current.taskId === taskId) {
      if (current.paused) await window.tracker.resumeTimer();
      return window.tracker.getTimerState();
    }
    await window.tracker.stopTimer();
  }

  return window.tracker.startTimer(taskId, name, estimateMinutes);
}

function celebratedKey(kind, date) {
  return `${CELEBRATED_PREFIX}${kind}-${date}`;
}

function hasCelebrated(kind, date) {
  try {
    return localStorage.getItem(celebratedKey(kind, date)) === "true";
  } catch {
    return false;
  }
}

function markCelebrated(kind, date) {
  try {
    localStorage.setItem(celebratedKey(kind, date), "true");
  } catch {
    // Celebrations are cosmetic — never break the app over storage.
  }
}

/**
 * Determine which meaningful moments were reached since the last check.
 * Returns celebration descriptors; flags are marked so each fires once a day.
 */
export function checkCelebrations(summary) {
  if (!summary || !getCelebrationsEnabled()) return [];
  const date = summary.date || getTodayKey();
  const events = [];

  if (summary.goalMet && !hasCelebrated("goal", date)) {
    markCelebrated("goal", date);
    events.push({
      kind: "goal",
      title: "Daily focus goal complete!",
      message: `${formatHours(summary.trackedMinutes)} focused today — that's the goal.`,
    });
  }

  const focus3 = getFocus3();
  if (focus3.length > 0) {
    const tasks = getState().trackedTasks || {};
    const allDone = focus3.every((id) => tasks[id]?.completed);
    if (allDone && !hasCelebrated("focus3", date)) {
      markCelebrated("focus3", date);
      events.push({
        kind: "focus3",
        title: "Focus 3 cleared!",
        message: "Every task that mattered today is done. Excellent work.",
      });
    }
  }

  return events;
}

function formatHours(minutes) {
  const total = Math.round((minutes || 0) * 10) / 10;
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Fire any pending celebrations (confetti + sound). */
export async function runCelebrations(summary) {
  const events = checkCelebrations(summary);
  if (events.length === 0) return events;

  try {
    const [{ celebrate }, sounds] = await Promise.all([
      import("./celebrate.js"),
      import("./sounds.js"),
    ]);
    if (getSoundsEnabled()) sounds.playCelebrationSound();
    events.forEach((event, index) => {
      setTimeout(() => celebrate(event), index * 500);
    });
  } catch (err) {
    console.error("Could not run celebration:", err);
  }
  return events;
}
