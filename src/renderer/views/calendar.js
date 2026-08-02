/* ========================================
   VIEW — Calendar (Monthly Task Organizer)
   ======================================== */

import { calendarEvents, trackedTasks } from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import { openAddTaskModal } from "../components/modals.js";
import { getLocalDateString, getCombinedEvents } from "../utils.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// View-local state
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedDate = getLocalDateString(); // YYYY-MM-DD

/**
 * Build a map of dateString → array of {event, task} for all tasks.
 */
function buildTaskMap() {
  const allItems = getCombinedEvents(calendarEvents, trackedTasks);
  const map = {}; // "YYYY-MM-DD" → [{event, task}]
  allItems.forEach((item) => {
    const dateKey = getLocalDateString(item.start);
    if (!map[dateKey]) map[dateKey] = [];

    const task = trackedTasks[item.id] || {};
    map[dateKey].push({ event: item, task });
  });

  // Sort each day's tasks by start time
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.event.start) - new Date(b.event.start));
  }

  return map;
}

/**
 * Format a time from an ISO string to a short display like "2:30p"
 */
function formatShortTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  if (m === 0) return `${h}${ampm}`;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

/**
 * Main render — calendar grid + detail panel.
 */
export async function renderCalendar() {
  const titleEl = document.getElementById("cal-month-title");
  const gridEl = document.getElementById("cal-days-grid");
  const prevBtn = document.getElementById("cal-prev-month");
  const nextBtn = document.getElementById("cal-next-month");
  const todayBtn = document.getElementById("cal-today-btn");
  const addTaskBtn = document.getElementById("cal-add-task-btn");

  if (!titleEl || !gridEl) return;

  // Header title
  titleEl.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  // Navigation handlers
  prevBtn.onclick = () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  };
  nextBtn.onclick = () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  };
  todayBtn.onclick = () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selectedDate = getLocalDateString(now);
    renderCalendar();
  };

  // Add task button → open modal pre-filled with selected date
  addTaskBtn.onclick = () => openAddTaskModal(selectedDate);

  // ---- Build grid ----
  const taskMap = buildTaskMap();
  const todayStr = getLocalDateString();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  gridEl.innerHTML = "";

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    gridEl.appendChild(createDayCell(dayNum, dateStr, taskMap, todayStr, true));
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const mStr = String(viewMonth + 1).padStart(2, "0");
    const dStr = String(day).padStart(2, "0");
    const dateStr = `${viewYear}-${mStr}-${dStr}`;
    gridEl.appendChild(createDayCell(day, dateStr, taskMap, todayStr, false));
  }

  // Next month leading days to fill rows
  const totalSoFar = firstDayOfMonth + daysInMonth;
  const rows = totalSoFar <= 35 ? 35 : 42;
  const remaining = rows - totalSoFar;
  for (let i = 1; i <= remaining; i++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    gridEl.appendChild(createDayCell(i, dateStr, taskMap, todayStr, true));
  }

  // Render the detail panel for the selected date
  await renderDetailPanel(taskMap);
}

/**
 * Create a single day cell element with task previews inside.
 */
function createDayCell(dayNum, dateStr, taskMap, todayStr, isOtherMonth) {
  const cell = document.createElement("div");
  cell.className = "cal-day-cell";
  if (isOtherMonth) cell.classList.add("other-month");
  if (dateStr === todayStr) cell.classList.add("today");
  if (dateStr === selectedDate) cell.classList.add("selected");

  // Day number
  const numEl = document.createElement("span");
  numEl.className = "cal-day-num";
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  // Task previews inside the cell
  const tasks = taskMap[dateStr];
  if (tasks && tasks.length > 0) {
    const tasksContainer = document.createElement("div");
    tasksContainer.className = "cal-day-tasks";

    const maxVisible = 3;
    const visibleTasks = tasks.slice(0, maxVisible);

    visibleTasks.forEach((dt) => {
      const preview = document.createElement("div");
      preview.className = "cal-task-preview";

      const priority = dt.task.priority || "medium";
      preview.classList.add(`priority-${priority}`);

      if (dt.task.completed) {
        preview.classList.add("completed");
      }

      // Task name
      const nameEl = document.createElement("span");
      nameEl.className = "cal-task-name";
      nameEl.textContent = dt.event.summary || dt.task.name || "Untitled";
      preview.appendChild(nameEl);

      // Short time
      const timeStr = formatShortTime(dt.event.start);
      if (timeStr) {
        const timeEl = document.createElement("span");
        timeEl.className = "cal-task-time";
        timeEl.textContent = timeStr;
        preview.appendChild(timeEl);
      }

      tasksContainer.appendChild(preview);
    });

    // Overflow indicator
    if (tasks.length > maxVisible) {
      const moreEl = document.createElement("div");
      moreEl.className = "cal-tasks-more";
      moreEl.textContent = `+${tasks.length - maxVisible} more`;
      tasksContainer.appendChild(moreEl);
    }

    cell.appendChild(tasksContainer);
  }

  // Click handler — select this day
  cell.addEventListener("click", () => {
    selectedDate = dateStr;

    // If the clicked day is in another month, navigate to that month
    if (isOtherMonth) {
      const d = new Date(dateStr + "T00:00:00");
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
    }

    renderCalendar();
  });

  return cell;
}

/**
 * Render the detail panel showing tasks for the selected day.
 */
async function renderDetailPanel(taskMap) {
  const dateEl = document.getElementById("cal-detail-date");
  const tasksEl = document.getElementById("cal-detail-tasks");
  if (!dateEl || !tasksEl) return;

  // Format the selected date nicely
  const d = new Date(selectedDate + "T00:00:00");
  const todayStr = getLocalDateString();
  let dateLabel;
  if (selectedDate === todayStr) {
    dateLabel = "Today";
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDate === getLocalDateString(yesterday)) {
      dateLabel = "Yesterday";
    } else if (selectedDate === getLocalDateString(tomorrow)) {
      dateLabel = "Tomorrow";
    } else {
      dateLabel = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  dateEl.textContent = dateLabel;

  // Get tasks for this day
  const dayTasks = taskMap ? taskMap[selectedDate] : null;

  if (!dayTasks || dayTasks.length === 0) {
    tasksEl.innerHTML = `
      <div class="cal-detail-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <rect x="3" y="4" width="18" height="18" rx="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <p>No tasks for this day</p>
      </div>
    `;
    return;
  }

  // Render task items using the existing createTaskItem component
  tasksEl.innerHTML = "";
  const timerState = await window.tracker.getTimerState();

  const sortedEvents = dayTasks
    .map((dt) => dt.event)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  sortedEvents.forEach((item) => {
    tasksEl.appendChild(createTaskItem(item, false, timerState));
  });
}
