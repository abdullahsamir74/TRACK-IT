/* ========================================
   VIEW — Daily Journey (quest map)
   ======================================== */

import {
  getState,
  setTrackedTasks,
  setCalendarEvents,
  switchView,
} from "../state.js";
import {
  escapeHtml,
  formatDuration,
  getCombinedEvents,
  getLocalDateString,
  sanitizeColor,
} from "../utils.js";
import { sortEvents } from "../constants.js";
import { openAddTaskModal } from "../components/modals.js";
import { showToast } from "../components/toast.js";
import { startFocusTask } from "../focus.js";

const CHECK_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>`;

const PLAY_ICON = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>`;

const CLOCK_ICON = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>`;

/**
 * Motivational quotes shown between quest nodes.
 * Quotes are picked deterministically per day so the map stays stable
 * while a task is being completed, but feels fresh each day.
 */
const MOTIVATION_QUOTES = [
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  {
    text: "Success is the sum of small efforts repeated day in and day out.",
    author: "Robert Collier",
  },
  {
    text: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson",
  },
  {
    text: "Hard work beats talent when talent doesn't work hard.",
    author: "Tim Notke",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
  },
  {
    text: "Start where you are. Use what you have. Do what you can.",
    author: "Arthur Ashe",
  },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: "Zig Ziglar",
  },
  {
    text: "Great things are done by a series of small things brought together.",
    author: "Vincent van Gogh",
  },
  {
    text: "The future depends on what you do today.",
    author: "Mahatma Gandhi",
  },
  {
    text: "Energy and persistence conquer all things.",
    author: "Benjamin Franklin",
  },
  {
    text: "Do the hard jobs first. The easy jobs will take care of themselves.",
    author: "Dale Carnegie",
  },
  {
    text: "Fall seven times, stand up eight.",
    author: "Japanese Proverb",
  },
  {
    text: "Push yourself, because no one else is going to do it for you.",
    author: "",
  },
];

/** Day-of-year seed so quotes rotate daily. */
function getDaySeed() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

/** Small deterministic hash used to seed the quote shuffle. */
function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG so the same map renders the same quotes. */
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle the quote pool for the current day + exact task lineup.
 * This keeps quotes stable while you complete tasks, but reshuffles them
 * whenever the map itself changes (new task, reorder, delete, new day).
 */
let previousQuoteLineup = null;
let previousFirstQuote = null;

function buildQuotePool(events) {
  const lineupKey = `${getDaySeed()}|${events
    .map((event) => event.id)
    .join("|")}`;
  const random = createSeededRandom(hashString(lineupKey));
  const pool = [...MOTIVATION_QUOTES];

  // Fisher–Yates shuffle with the seeded PRNG.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // When the lineup changes, never repeat the same opening quote.
  if (
    previousQuoteLineup !== null &&
    lineupKey !== previousQuoteLineup &&
    pool[0]?.text === previousFirstQuote
  ) {
    pool.push(pool.shift());
  }

  previousQuoteLineup = lineupKey;
  previousFirstQuote = pool[0]?.text || null;

  return pool;
}

function getProgressState(percent, total) {
  if (total === 0) {
    return {
      rank: "No quests yet",
      hint: "Your map is clear. Add a task to place the first node.",
    };
  }
  if (percent >= 100) {
    return {
      rank: "Quest complete",
      hint: "Every node cleared. Outstanding work — the day is yours.",
    };
  }
  if (percent >= 75) {
    return {
      rank: "Final stretch",
      hint: "The finish line is in sight. Keep the chain moving.",
    };
  }
  if (percent >= 50) {
    return {
      rank: "Momentum",
      hint: "Halfway there. Each cleared node makes the next one easier.",
    };
  }
  if (percent >= 25) {
    return {
      rank: "Finding rhythm",
      hint: "You are building a streak. Clear one more node.",
    };
  }
  if (percent > 0) {
    return {
      rank: "Warming up",
      hint: "Good start. Small steps add up to a cleared map.",
    };
  }
  return {
    rank: "Ready to begin",
    hint: "The first step is the hardest. Choose a node and begin.",
  };
}

function updateHeaderDate() {
  const subtitle = document.getElementById("journey-subtitle");
  if (!subtitle) return;
  const dateText = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  subtitle.textContent = `${dateText} · Your day as a quest map — one node at a time.`;
}

function getTaskTitle(event, task) {
  return (event.summary || task.name || "Untitled Task").trim();
}

function getTaskTimeLabel(event, task) {
  if (task.isAllDay || event.isAllDay) return "All day";
  const start = new Date(event.start);
  if (isNaN(start.getTime())) return "";
  return start.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildMetaHtml(event, task, project) {
  const parts = [];
  const timeLabel = getTaskTimeLabel(event, task);

  if (timeLabel) {
    parts.push(
      `<span class="journey-meta-item">${CLOCK_ICON}${escapeHtml(timeLabel)}</span>`,
    );
  }
  if (project) {
    const color = sanitizeColor(project.color, "#38bdf8");
    parts.push(
      `<span class="journey-meta-item journey-project" style="color: ${color}; border-color: ${color};">${escapeHtml(project.name)}</span>`,
    );
  }

  const estimate = task.estimateMinutes || event.durationMinutes || null;
  if (estimate) {
    parts.push(
      `<span class="journey-meta-item">${formatDuration(estimate)}</span>`,
    );
  }

  const tracked = task.totalTrackedMinutes || 0;
  if (tracked > 0) {
    parts.push(
      `<span class="journey-meta-item">${formatDuration(tracked)} tracked</span>`,
    );
  }

  return parts.join('<span class="journey-meta-dot">·</span>');
}

function renderEmptyMap(mapEl) {
  mapEl.classList.add("is-empty");
  mapEl.innerHTML = `
    <div class="empty-state journey-empty">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
        <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-1.447-.894L15 9m0 8V9m0 0L9 7" />
      </svg>
      <p>No tasks on your map today</p>
      <span>Add a task and it will become the first node of your journey</span>
      <button class="btn btn-accent btn-sm journey-empty-add" id="btn-journey-empty-add">
        Add your first task
      </button>
    </div>
  `;
  const emptyAdd = document.getElementById("btn-journey-empty-add");
  if (emptyAdd) emptyAdd.onclick = () => openAddTaskModal();
}

function renderMap(events, state, currentIndex) {
  const mapEl = document.getElementById("journey-map");
  if (!mapEl) return;

  if (events.length === 0) {
    renderEmptyMap(mapEl);
    return;
  }

  mapEl.classList.remove("is-empty");

  const total = events.length;
  const completedCount = events.filter(
    (event) => state.trackedTasks[event.id]?.completed,
  ).length;
  const fillPercent = total > 0 ? (completedCount / total) * 100 : 0;

  const track = document.createElement("div");
  track.className = "journey-track";
  track.innerHTML = `<span class="journey-track-fill" style="height: ${fillPercent}%;"></span>`;
  mapEl.replaceChildren(track);

  const quotePool = buildQuotePool(events);

  events.forEach((event, index) => {
    const task = state.trackedTasks[event.id] || {};
    const completed = Boolean(task.completed);
    const isCurrent = index === currentIndex;
    const title = getTaskTitle(event, task);
    const project = task.projectId
      ? state.customProjects[task.projectId]
      : null;
    const metaHtml = buildMetaHtml(event, task, project);

    const statusLabel = completed
      ? "Cleared"
      : isCurrent
        ? "Next up"
        : "Queued";
    const statusClass = completed
      ? "cleared"
      : isCurrent
        ? "current"
        : "queued";

    const step = document.createElement("div");
    step.className = `journey-step${completed ? " completed" : ""}${
      isCurrent ? " current" : ""
    }`;
    step.dataset.taskId = event.id;

    step.innerHTML = `
      <div class="journey-step-marker">
        <div class="journey-node">${completed ? CHECK_ICON : index + 1}</div>
      </div>
      <div class="journey-card">
        <div class="journey-card-main">
          <div class="journey-card-title-row">
            <h3 class="journey-task-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
            <span class="journey-status ${statusClass}">${statusLabel}</span>
          </div>
          ${metaHtml ? `<div class="journey-task-meta">${metaHtml}</div>` : ""}
        </div>
        <div class="journey-card-actions">
          ${
            completed
              ? ""
              : `<button class="journey-icon-btn journey-play" type="button" title="Start a focus session for this task" aria-label="Start a focus session for ${escapeHtml(title)}">${PLAY_ICON}</button>`
          }
          <button class="journey-complete-btn${completed ? " done" : ""}" type="button" title="${completed ? "Mark incomplete" : "Mark complete"}">
            ${completed ? `${CHECK_ICON} Completed` : "Complete"}
          </button>
        </div>
      </div>
    `;

    const completeBtn = step.querySelector(".journey-complete-btn");
    if (completeBtn) {
      completeBtn.addEventListener("click", async () => {
        completeBtn.disabled = true;
        try {
          if (completed) {
            await window.tracker.markTaskIncomplete(event.id);
          } else {
            await window.tracker.saveTask({
              id: event.id,
              name: title,
              start: event.start,
              notes: task.notes || task.description || event.description || "",
              estimateMinutes:
                task.estimateMinutes || event.durationMinutes || null,
            });
            await window.tracker.markTaskComplete(event.id);
          }
          setTrackedTasks(await window.tracker.getTasks());
          await renderJourney();
        } catch (err) {
          console.error("Failed to update journey task:", err);
          showToast("Could not update this task.", "error");
          completeBtn.disabled = false;
        }
      });
    }

    const playBtn = step.querySelector(".journey-play");
    if (playBtn) {
      playBtn.addEventListener("click", async () => {
        try {
          const estimate = task.estimateMinutes || event.durationMinutes || null;
          await startFocusTask({ id: event.id, name: title }, estimate);
          switchView("timer");
        } catch (err) {
          console.error("Failed to start focus session from journey:", err);
          showToast("Could not start the focus timer.", "error");
        }
      });
    }

    mapEl.appendChild(step);

    // A motivational quote sits between each pair of tasks.
    if (index < events.length - 1) {
      const quote = quotePool[index % quotePool.length];
      const quoteEl = document.createElement("blockquote");
      quoteEl.className = "journey-quote";
      quoteEl.innerHTML = `
        <p>“${escapeHtml(quote.text)}”</p>
        ${quote.author ? `<cite>— ${escapeHtml(quote.author)}</cite>` : ""}
      `;
      mapEl.appendChild(quoteEl);
    }
  });
}

/**
 * Render today's tasks as a game-style progression map.
 * Task order follows the same sort mode used by the Schedule view.
 */
export async function renderJourney() {
  updateHeaderDate();

  try {
    const tasks = await window.tracker.getTasks();
    setTrackedTasks(tasks || {});
  } catch (err) {
    console.error("Failed to load tasks for journey:", err);
  }

  const state = getState();
  const todayStr = getLocalDateString();
  const todayEvents = getCombinedEvents(
    state.calendarEvents,
    state.trackedTasks,
  ).filter((event) => getLocalDateString(event.start) === todayStr);

  // Match the Schedule view ordering (manual order by default).
  sortEvents(todayEvents, state);

  const total = todayEvents.length;
  const completed = todayEvents.filter(
    (event) => state.trackedTasks[event.id]?.completed,
  ).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const currentIndex = todayEvents.findIndex(
    (event) => !state.trackedTasks[event.id]?.completed,
  );
  const progressState = getProgressState(percent, total);

  const percentEl = document.getElementById("journey-percent");
  if (percentEl) percentEl.textContent = `${percent}%`;

  const countEl = document.getElementById("journey-count");
  if (countEl) {
    countEl.textContent =
      total === 0
        ? "0 of 0 tasks cleared"
        : `${completed} of ${total} task${total === 1 ? "" : "s"} cleared`;
  }

  const rankEl = document.getElementById("journey-rank");
  if (rankEl) rankEl.textContent = progressState.rank;

  const hintEl = document.getElementById("journey-progress-hint");
  if (hintEl) hintEl.textContent = progressState.hint;

  const fillEl = document.getElementById("journey-progress-fill");
  if (fillEl) fillEl.style.width = `${percent}%`;

  const progressEl = document.getElementById("journey-progress");
  if (progressEl) progressEl.setAttribute("aria-valuenow", String(percent));

  renderMap(todayEvents, state, currentIndex);

  const addBtn = document.getElementById("btn-journey-add");
  if (addBtn) addBtn.onclick = () => openAddTaskModal();

  const refreshBtn = document.getElementById("btn-journey-refresh");
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      try {
        setCalendarEvents(await window.tracker.getCalendarEvents());
        await renderJourney();
      } catch (err) {
        console.error("Failed to refresh calendar for journey:", err);
        showToast("Could not refresh the calendar.", "error");
      } finally {
        refreshBtn.disabled = false;
      }
    };
  }
}
