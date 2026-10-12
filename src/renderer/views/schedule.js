/* ========================================
   VIEW — Schedule
   ======================================== */

import { getState, setTrackedTasks, setTaskSortMode } from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import { openAddTaskModal } from "../components/modals.js";
import { initDragAndDrop } from "../components/drag-drop.js";
import { getLocalDateString, getCombinedEvents } from "../utils.js";
import { sortEvents } from "../constants.js";

/**
 * Render the schedule view (filters + event list).
 */
export async function renderSchedule() {
  const state = getState();
  try {
    const tasks = await window.tracker.getTasks();
    setTrackedTasks(tasks || {});
  } catch (err) {
    console.error("Failed to load tasks for schedule:", err);
    return;
  }

  const taskListEl = document.getElementById("schedule-task-list");
  const filterBtns = document.querySelectorAll(".filter-btn");

  // Filter click handlers
  filterBtns.forEach((btn) => {
    btn.onclick = async () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await renderScheduleList(btn.dataset.filter);
    };
  });

  const activeFilter =
    document.querySelector(".filter-btn.active")?.dataset.filter || "all";
  await renderScheduleList(activeFilter);

  // Add task button
  document.getElementById("btn-add-task").onclick = () => openAddTaskModal();

  // Sort preference setup
  const sortSelect = document.getElementById("select-schedule-sort");
  if (sortSelect) {
    sortSelect.value = state.taskSortMode;
    sortSelect.onchange = async () => {
      const newMode = sortSelect.value;
      await window.tracker.saveTaskSortMode(newMode);
      setTaskSortMode(newMode);
      renderSchedule();
    };
  }
}

/**
 * Render the filtered & grouped task list for the schedule view.
 */
async function renderScheduleList(filter) {
  const state = getState();
  const taskListEl = document.getElementById("schedule-task-list");
  const todayStr = getLocalDateString();
  const now = new Date();

  // Combine calendar events and manual tasks
  let allItems = getCombinedEvents(state.calendarEvents, state.trackedTasks);

  // Apply filter
  if (filter === "today") {
    allItems = allItems.filter((e) => getLocalDateString(e.start) === todayStr);
  } else if (filter === "upcoming") {
    allItems = allItems.filter((e) => new Date(e.start) >= now);
  } else if (filter === "past") {
    allItems = allItems.filter((e) => new Date(e.start) < now);
  }

  // Sort chronologically by default, placing all-day tasks first within each day
  allItems.sort((a, b) => {
    const dateA = getLocalDateString(a.start);
    const dateB = getLocalDateString(b.start);
    if (dateA !== dateB) return new Date(a.start) - new Date(b.start);
    const aAllDay = Boolean(state.trackedTasks[a.id]?.isAllDay || a.isAllDay);
    const bAllDay = Boolean(state.trackedTasks[b.id]?.isAllDay || b.isAllDay);
    if (aAllDay && !bAllDay) return -1;
    if (!aAllDay && bAllDay) return 1;
    return new Date(a.start) - new Date(b.start);
  });

  if (allItems.length === 0) {
    taskListEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No events found</p>
      </div>
    `;
    return;
  }

  const timerState = await window.tracker.getTimerState();

  // Group by date
  const groups = {};
  allItems.forEach((item) => {
    const dateKey = getLocalDateString(item.start);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });

  // Sort inside each date group based on state.taskSortMode
  for (const dateKey of Object.keys(groups)) {
    sortEvents(groups[dateKey], state);
  }

  taskListEl.innerHTML = "";
  for (const [dateKey, items] of Object.entries(groups)) {
    const header = document.createElement("div");
    header.className = "schedule-date-header";
    const dateObj = new Date(dateKey + "T00:00:00");
    if (dateKey === todayStr) {
      header.textContent = "Today";
    } else {
      header.textContent = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    taskListEl.appendChild(header);

    const isDraggable = state.taskSortMode === "manual";
    items.forEach((item) => {
      taskListEl.appendChild(createTaskItem(item, isDraggable, timerState));
    });
  }

  // Initialize drag-and-drop on the task list
  if (state.taskSortMode === "manual") {
    initDragAndDrop(taskListEl);
  }
}
