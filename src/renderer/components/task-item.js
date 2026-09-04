/* ========================================
   COMPONENT — Task Item Element
   ======================================== */

import { formatDuration, escapeHtml } from "../utils.js";
import {
  trackedTasks,
  customProjects,
  setTrackedTasks,
  selectedTimerTask,
  setSelectedTimerTask,
} from "../state.js";
import { switchView, renderCurrentView } from "../state.js";
import {
  openEstimateModal,
  openEditTaskModal,
  openTaskNotesModal,
} from "./modals.js";
import { showConfirmDialog } from "./confirm-dialog.js";

/**
 * Create a single task-item DOM element.
 * Used by dashboard, schedule, timer, and projects views.
 */
export function createTaskItem(event, draggable = false, timerState = null) {
  const task = trackedTasks[event.id] || {};
  const isCompleted = task.completed || false;
  const notes = task.notes || task.description || event.description || "";
  const hasNotes = Boolean(notes && notes.trim().length > 0);

  const item = document.createElement("div");
  item.className = `task-item${isCompleted ? " completed" : ""}`;
  item.dataset.taskId = event.id;

  const startTime = new Date(event.start);
  const timeStr = !isNaN(startTime.getTime())
    ? startTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
  const estimate = task.estimateMinutes || event.durationMinutes || null;
  const tracked = task.totalTrackedMinutes || 0;

  const isCurrentTaskTiming =
    timerState &&
    timerState.running &&
    timerState.taskId === event.id &&
    !timerState.paused;

  const project = task.projectId ? customProjects[task.projectId] : null;
  const projectBadge = project
    ? `<span class="task-project-badge" style="color: ${project.color}; border-color: ${project.color};">${escapeHtml(project.name)}</span>`
    : "";

  let priorityBadge = "";
  if (task.priority) {
    const p = task.priority.toLowerCase();
    let label = "Medium";
    if (p === "high") label = "High";
    if (p === "low") label = "Low";
    priorityBadge = `<span class="task-badge priority-${p}">${label}</span>`;
  }

  const notesBadge = hasNotes
    ? `<span class="task-badge task-notes-badge" title="${escapeHtml(notes)}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        Note
      </span>`
    : "";  const isManual = Boolean(
    event.isManual ||
    task.isManual ||
    !task.calendarEventId ||
    (event.id && String(event.id).startsWith("manual-"))
  );

  item.innerHTML = `
    ${
      draggable
        ? `<div class="drag-handle" title="Drag to reorder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
    </div>`
        : ""
    }
    <div class="task-color-dot" style="background: ${event.calendarColor || "#38bdf8"};"></div>
    <button class="task-checkbox ${isCompleted ? "checked" : ""}" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}"></button>
    <div class="task-info">
      <div class="task-name">${escapeHtml(event.summary)}</div>
      <div class="task-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${timeStr}
        ${event.calendarName ? ` · ${escapeHtml(event.calendarName)}` : ""}
      </div>
    </div>
    ${projectBadge}
    ${priorityBadge}
    ${notesBadge}
    ${estimate ? `<span class="task-badge estimate">${formatDuration(estimate)}</span>` : ""}
    ${tracked > 0 ? `<span class="task-badge tracked">${formatDuration(tracked)} tracked</span>` : ""}
    <div class="task-actions">
      <button class="task-action-btn ${hasNotes ? "has-notes" : ""}" title="${hasNotes ? "View/Edit notes" : "Add notes"}" data-action="notes" data-task-id="${event.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
      </button>
      <button class="task-action-btn" title="Set estimate" data-action="estimate" data-task-id="${event.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="task-action-btn" title="Edit task" data-action="edit" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}" data-task-start="${event.start || ""}" data-task-estimate="${estimate || ""}" data-task-priority="${task.priority || "medium"}" data-task-manual="${isManual}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="task-action-btn task-action-btn-danger" title="Delete task" data-action="delete" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
      <button class="task-action-btn ${isCompleted ? "disabled" : ""}" title="${isCompleted ? "Task completed" : isCurrentTaskTiming ? "Pause timer" : "Start timer"}" data-action="start-timer" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}" data-estimate="${estimate || ""}" ${isCompleted ? "disabled" : ""}>
        ${
          isCurrentTaskTiming
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        }
      </button>
    </div>
  `;

  // Checkbox handler
  const checkbox = item.querySelector(".task-checkbox");
  checkbox.addEventListener("click", async () => {
    const taskId = checkbox.dataset.taskId;
    const taskName = checkbox.dataset.taskName;

    // Optimistic UI toggle
    checkbox.classList.toggle("checked");
    item.classList.toggle("completed");

    if (isCompleted) {
      await window.tracker.markTaskIncomplete(taskId);
    } else {
      // Save the task name, start date, notes, and estimate first so the completion session
      // can reference the correct estimate and day
      await window.tracker.saveTask({
        id: taskId,
        name: taskName,
        start: event.start,
        notes: notes,
        estimateMinutes: estimate,
      });
      await window.tracker.markTaskComplete(taskId);
    }

    // Reload data and re-render
    setTrackedTasks(await window.tracker.getTasks());
    renderCurrentView();
  });

  // Action buttons
  item.querySelectorAll(".task-action-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "notes") {
        openTaskNotesModal({
          id: event.id,
          name: event.summary,
          notes: notes,
        });
      } else if (action === "estimate") {
        openEstimateModal(btn.dataset.taskId, estimate);
      } else if (action === "edit") {
        openEditTaskModal({
          id: btn.dataset.taskId,
          name: btn.dataset.taskName,
          start: btn.dataset.taskStart,
          estimate: btn.dataset.taskEstimate
            ? parseInt(btn.dataset.taskEstimate)
            : null,
          isManual: btn.dataset.taskManual === "true" || isManual,
          priority: btn.dataset.taskPriority || "medium",
          notes: notes,
          description: notes,
        });
      } else if (action === "delete") {
        const taskName = btn.dataset.taskName || "this task";
        showConfirmDialog({
          title: "Delete Task?",
          message: `Are you sure you want to delete "<strong>${taskName}</strong>"? This will hide it from your schedule and lists, but its tracked progress and history will be preserved in Analytics.`,
          confirmText: "Delete Task",
          onConfirm: async () => {
            await window.tracker.deleteTask(btn.dataset.taskId);
            setTrackedTasks(await window.tracker.getTasks());
          },
        });
      } else if (action === "start-timer" && !isCompleted) {
        // Check if timer is already running for this task
        const currentTimerState = await window.tracker.getTimerState();
        if (
          currentTimerState.running &&
          currentTimerState.taskId === btn.dataset.taskId
        ) {
          // Already timing this task — pause it
          if (!currentTimerState.paused) {
            await window.tracker.pauseTimer();
          } else {
            await window.tracker.resumeTimer();
          }
          switchView("timer");
        } else {
          // Start new timer for this task with remaining estimate calculation
          const taskId = btn.dataset.taskId;
          const taskObj = trackedTasks[taskId] || {};
          const totalEst = btn.dataset.estimate
            ? parseInt(btn.dataset.estimate)
            : taskObj.estimateMinutes || null;
          const tracked = taskObj.totalTrackedMinutes || 0;
          const remainingEst =
            totalEst !== null && totalEst > 0
              ? Math.max(0, totalEst - tracked)
              : null;

          setSelectedTimerTask({
            id: taskId,
            name: btn.dataset.taskName,
            estimate: remainingEst,
            totalEstimate: totalEst,
          });
          switchView("timer");
          // Dynamically import to avoid circular deps
          const { startTimerForTask } = await import("../views/timer.js");
          startTimerForTask();
        }
      }
    });
  });

  return item;
}
