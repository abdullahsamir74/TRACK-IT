/* ========================================
   VIEW — Schedule
   ======================================== */

import { calendarEvents, trackedTasks, taskOrder, taskSortMode, setTaskSortMode } from "../state.js";
import { createTaskItem } from "../components/task-item.js";
import { openAddTaskModal } from "../components/modals.js";
import { initDragAndDrop } from "../components/drag-drop.js";
import { getLocalDateString, getCombinedEvents } from "../utils.js";

/**
 * Render the schedule view (filters + event list).
 */
export async function renderSchedule() {
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
    sortSelect.value = taskSortMode;
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
  const taskListEl = document.getElementById("schedule-task-list");
  const todayStr = getLocalDateString();
  const now = new Date();

  // Combine calendar events and manual tasks
  let allItems = getCombinedEvents(calendarEvents, trackedTasks);

  // Apply filter
  if (filter === "today") {
    allItems = allItems.filter((e) => getLocalDateString(e.start) === todayStr);
  } else if (filter === "upcoming") {
    allItems = allItems.filter((e) => new Date(e.start) >= now);
  } else if (filter === "past") {
    allItems = allItems.filter((e) => new Date(e.start) < now);
  }

  // Sort chronologically by default
  allItems.sort((a, b) => new Date(a.start) - new Date(b.start));

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

  // Sort inside each date group based on taskSortMode
  if (taskSortMode === "manual") {
    if (taskOrder.length > 0) {
      const orderMap = {};
      taskOrder.forEach((id, i) => (orderMap[id] = i));
      for (const dateKey of Object.keys(groups)) {
        groups[dateKey].sort((a, b) => {
          const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
          const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
          if (oa !== ob) return oa - ob;
          return new Date(a.start) - new Date(b.start);
        });
      }
    } else {
      for (const dateKey of Object.keys(groups)) {
        groups[dateKey].sort((a, b) => new Date(a.start) - new Date(b.start));
      }
    }
  } else if (taskSortMode === "date") {
    for (const dateKey of Object.keys(groups)) {
      groups[dateKey].sort((a, b) => new Date(a.start) - new Date(b.start));
    }
  } else if (taskSortMode === "priority") {
    const priorityMap = { high: 3, medium: 2, low: 1 };
    for (const dateKey of Object.keys(groups)) {
      groups[dateKey].sort((a, b) => {
        const taskA = trackedTasks[a.id] || {};
        const taskB = trackedTasks[b.id] || {};
        const pa = priorityMap[taskA.priority] || 0;
        const pb = priorityMap[taskB.priority] || 0;
        if (pa !== pb) {
          return pb - pa;
        }
        return new Date(a.start) - new Date(b.start);
      });
    }
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

    const isDraggable = taskSortMode === "manual";
    items.forEach((item) => {
      taskListEl.appendChild(createTaskItem(item, isDraggable, timerState));
    });
  }

  // Initialize drag-and-drop on the task list
  if (taskSortMode === "manual") {
    initDragAndDrop(taskListEl);
  }
}
