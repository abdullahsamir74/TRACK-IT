/* ========================================
   COMPONENT — Task Item Element
   ======================================== */

import { formatDuration, escapeHtml } from '../utils.js';
import {
  trackedTasks, customProjects, setTrackedTasks,
  selectedTimerTask, setSelectedTimerTask,
} from '../state.js';
import { switchView, renderCurrentView } from '../state.js';
import { openEstimateModal } from './modals.js';

/**
 * Create a single task-item DOM element.
 * Used by dashboard, schedule, timer, and projects views.
 */
export function createTaskItem(event, draggable = false, timerState = null) {
  const task = trackedTasks[event.id] || {};
  const isCompleted = task.completed || false;

  const item = document.createElement('div');
  item.className = `task-item${isCompleted ? ' completed' : ''}`;
  item.dataset.taskId = event.id;

  const startTime = new Date(event.start);
  const timeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const estimate = task.estimateMinutes || event.durationMinutes || null;
  const tracked = task.totalTrackedMinutes || 0;

  const isCurrentTaskTiming = timerState && timerState.running && timerState.taskId === event.id && !timerState.paused;

  const project = task.projectId ? customProjects[task.projectId] : null;
  const projectBadge = project ? `<span class="task-project-badge" style="color: ${project.color}; border-color: ${project.color};">${escapeHtml(project.name)}</span>` : '';

  item.innerHTML = `
    ${draggable ? `<div class="drag-handle" title="Drag to reorder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
    </div>` : ''}
    <div class="task-color-dot" style="background: ${event.calendarColor || '#7c6ef0'};"></div>
    <button class="task-checkbox ${isCompleted ? 'checked' : ''}" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}"></button>
    <div class="task-info">
      <div class="task-name">${escapeHtml(event.summary)}</div>
      <div class="task-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${timeStr}
        ${event.calendarName ? ` · ${escapeHtml(event.calendarName)}` : ''}
      </div>
    </div>
    ${projectBadge}
    ${estimate ? `<span class="task-badge estimate">${formatDuration(estimate)}</span>` : ''}
    ${tracked > 0 ? `<span class="task-badge tracked">${formatDuration(tracked)} tracked</span>` : ''}
    <div class="task-actions">
      <button class="task-action-btn" title="Set estimate" data-action="estimate" data-task-id="${event.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="task-action-btn ${isCompleted ? 'disabled' : ''}" title="${isCompleted ? 'Task completed' : (isCurrentTaskTiming ? 'Pause timer' : 'Start timer')}" data-action="start-timer" data-task-id="${event.id}" data-task-name="${escapeHtml(event.summary)}" data-estimate="${estimate || ''}" ${isCompleted ? 'disabled' : ''}>
        ${isCurrentTaskTiming ?
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>` :
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        }
      </button>
    </div>
  `;

  // Checkbox handler
  const checkbox = item.querySelector('.task-checkbox');
  checkbox.addEventListener('click', async () => {
    const taskId = checkbox.dataset.taskId;
    const taskName = checkbox.dataset.taskName;

    if (isCompleted) {
      await window.tracker.markTaskIncomplete(taskId);
    } else {
      await window.tracker.markTaskComplete(taskId);
      // Also save the task name for reference
      await window.tracker.saveTask({ id: taskId, name: taskName });
    }

    // Reload data and re-render
    setTrackedTasks(await window.tracker.getTasks());
    renderCurrentView();
  });

  // Action buttons
  item.querySelectorAll('.task-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'estimate') {
        openEstimateModal(btn.dataset.taskId, estimate);
      } else if (action === 'start-timer' && !isCompleted) {
        // Check if timer is already running for this task
        const currentTimerState = await window.tracker.getTimerState();
        if (currentTimerState.running && currentTimerState.taskId === btn.dataset.taskId) {
          // Already timing this task — pause it
          if (!currentTimerState.paused) {
            await window.tracker.pauseTimer();
          } else {
            await window.tracker.resumeTimer();
          }
          switchView('timer');
        } else {
          // Start new timer for this task
          setSelectedTimerTask({
            id: btn.dataset.taskId,
            name: btn.dataset.taskName,
            estimate: btn.dataset.estimate ? parseInt(btn.dataset.estimate) : null,
          });
          switchView('timer');
          // Dynamically import to avoid circular deps
          const { startTimerForTask } = await import('../views/timer.js');
          startTimerForTask();
        }
      }
    });
  });

  return item;
}
