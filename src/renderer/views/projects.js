/* ========================================
   VIEW — Projects
   ======================================== */

import { escapeHtml } from '../utils.js';
import {
  calendarEvents, trackedTasks, customProjects,
  expandedProjects, projectOrder,
  setTrackedTasks, setCustomProjects,
  setProjectOrder,
} from '../state.js';
import { createTaskItem } from '../components/task-item.js';
import { initProjectModal, openEditProjectModal } from '../components/modals.js';
import { showConfirmDialog } from '../components/confirm-dialog.js';

/**
 * Initialize the projects view (modals, reset button).
 */
export function initProjects() {
  initProjectModal();

  const resetProjBtn = document.getElementById('btn-reset-projects');
  if (resetProjBtn) {
    resetProjBtn.addEventListener('click', () => showConfirmDialog());
  }
}

/**
 * Render the full projects view.
 */
export async function renderProjects() {
  const projectsStack = document.getElementById('projects-list-stack');
  const unassignedPool = document.getElementById('unassigned-tasks-pool');
  const unassignedCountBadge = document.getElementById('unassigned-tasks-count');

  if (!projectsStack || !unassignedPool) return;

  projectsStack.innerHTML = '';
  unassignedPool.innerHTML = '';

  let timerState = null;
  try {
    timerState = await window.tracker.getTimerState();
  } catch (e) {}

  const projects = Object.values(customProjects);
  // Sort projects according to projectOrder configuration
  projects.sort((a, b) => {
    const idxA = projectOrder.indexOf(a.id);
    const idxB = projectOrder.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const projectTasks = {};
  projects.forEach(p => {
    projectTasks[p.id] = [];
  });

  // Combine calendar events and manual tasks
  const allEvents = [...calendarEvents];

  // Add manual tasks from the store
  Object.values(trackedTasks).forEach(task => {
    if (task.isManual) {
      const exists = allEvents.some(item => item.id === task.id);
      if (!exists) {
        allEvents.push({
          id: task.id,
          summary: task.name || 'Untitled Task',
          start: task.start || new Date().toISOString(),
          end: task.end || null,
          durationMinutes: task.estimateMinutes || 60,
          calendarColor: '#7c6ef0',
          calendarName: 'Manual',
          isManual: true,
        });
      }
    }
  });

  const unassignedEvents = [];

  allEvents.forEach(event => {
    const task = trackedTasks[event.id] || {};
    if (task.projectId && customProjects[task.projectId]) {
      projectTasks[task.projectId].push(event);
    } else {
      unassignedEvents.push(event);
    }
  });

  if (projects.length === 0) {
    const emptyBoard = document.createElement('div');
    emptyBoard.className = 'empty-state';
    emptyBoard.style.flex = '1';
    emptyBoard.style.height = '100%';
    emptyBoard.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <p>No projects created yet</p>
      <span>Click "Create Project" above to start grouping your tasks</span>
    `;
    projectsStack.appendChild(emptyBoard);
  } else {
    projects.forEach(project => {
      const card = document.createElement('div');
      const isExpanded = expandedProjects[project.id] === true;
      card.className = `project-card ${isExpanded ? 'expanded' : ''}`;
      card.dataset.projectId = project.id;

      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-drag-handle" title="Drag to reorder projects">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>
          <div class="project-chevron">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
          <div class="project-card-info">
            <div class="project-color-dot" style="background: ${project.color};"></div>
            <span class="project-title">${escapeHtml(project.name)}</span>
            <span class="project-task-count">${projectTasks[project.id].length} tasks</span>
          </div>
          <button class="btn-edit-project" data-project-id="${project.id}" title="Rename project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-delete-project" data-project-id="${project.id}" title="Delete project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div class="project-card-body">
          <div class="project-task-list" data-project-id="${project.id}">
            <!-- Assigned tasks -->
          </div>
        </div>
      `;

      const listContainer = card.querySelector('.project-task-list');
      const events = projectTasks[project.id];
      if (events.length === 0) {
        const emptyCol = document.createElement('div');
        emptyCol.className = 'empty-state small';
        emptyCol.style.padding = 'var(--space-md) 0';
        emptyCol.innerHTML = `<p style="font-size:12px;">Drag tasks here</p>`;
        listContainer.appendChild(emptyCol);
      } else {
        events.forEach(event => {
          const cardEl = createTaskItem(event, false, timerState);
          cardEl.setAttribute('draggable', 'true');
          listContainer.appendChild(cardEl);
        });
      }

      card.querySelector('.project-card-header').addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-project') || e.target.closest('.btn-edit-project') || e.target.closest('.project-drag-handle')) return;
        const expanded = card.classList.toggle('expanded');
        expandedProjects[project.id] = expanded;
      });

      card.querySelector('.btn-edit-project').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditProjectModal(project);
      });

      card.querySelector('.btn-delete-project').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete project "${project.name}"? Tasks in it will return to Unassigned.`)) {
          await window.tracker.deleteProject(project.id);
          delete expandedProjects[project.id];
          setCustomProjects(await window.tracker.getProjects());
          setTrackedTasks(await window.tracker.getTasks());
          renderProjects();
        }
      });

      projectsStack.appendChild(card);
    });
  }

  unassignedCountBadge.textContent = unassignedEvents.length;
  if (unassignedEvents.length === 0) {
    unassignedPool.innerHTML = `
      <div class="empty-state small" style="margin-top:var(--space-xl);">
        <p>All tasks assigned!</p>
      </div>
    `;
  } else {
    unassignedEvents.forEach(event => {
      const card = createTaskItem(event, false, timerState);
      card.setAttribute('draggable', 'true');
      unassignedPool.appendChild(card);
    });
  }

  initProjectsDragAndDrop();
  initProjectsListDragAndDrop(projectsStack);
}

/**
 * Initialize drag-and-drop for assigning tasks to projects.
 */
function initProjectsDragAndDrop() {
  const draggables = document.querySelectorAll('#view-projects .task-item[draggable="true"]');
  const projectCards = document.querySelectorAll('#view-projects .project-card');
  const unassignedPool = document.getElementById('unassigned-tasks-pool');

  draggables.forEach(draggable => {
    draggable.addEventListener('dragstart', (e) => {
      draggable.classList.add('dragging');
      e.dataTransfer.setData('text/plain', draggable.dataset.taskId);
      e.dataTransfer.effectAllowed = 'move';
    });

    draggable.addEventListener('dragend', () => {
      draggable.classList.remove('dragging');
    });
  });

  projectCards.forEach(card => {
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const projectId = card.dataset.projectId;

      if (taskId) {
        await window.tracker.assignTaskToProject(taskId, projectId);
        setTrackedTasks(await window.tracker.getTasks());
        renderProjects();
      }
    });
  });

  if (unassignedPool) {
    unassignedPool.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      unassignedPool.classList.add('drag-over');
    });

    unassignedPool.addEventListener('dragleave', () => {
      unassignedPool.classList.remove('drag-over');
    });

    unassignedPool.addEventListener('drop', async (e) => {
      e.preventDefault();
      unassignedPool.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');

      if (taskId) {
        await window.tracker.assignTaskToProject(taskId, null);
        setTrackedTasks(await window.tracker.getTasks());
        renderProjects();
      }
    });
  }
}

/**
 * Initialize drag-and-drop for reordering project cards.
 */
function initProjectsListDragAndDrop(listEl) {
  if (listEl.dataset.dragInitDone === 'true') return;
  listEl.dataset.dragInitDone = 'true';

  let draggedItem = null;
  let placeholder = null;
  let offsetY = 0;
  let isDragging = false;

  function getVisualChildren() {
    return [...listEl.children].filter(el =>
      el !== draggedItem &&
      !el.classList.contains('drag-placeholder') &&
      el.classList.contains('project-card')
    );
  }

  function onMouseDown(e) {
    const handle = e.target.closest('.project-drag-handle');
    if (!handle) return;

    const item = handle.closest('.project-card');
    if (!item) return;

    e.preventDefault();
    draggedItem = item;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    placeholder = document.createElement('div');
    placeholder.className = 'project-card drag-placeholder';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.marginBottom = 'var(--space-md)';

    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.width = rect.width + 'px';
    item.style.top = rect.top + 'px';
    item.style.left = rect.left + 'px';
    item.style.zIndex = '1000';
    item.style.pointerEvents = 'none';

    item.parentNode.insertBefore(placeholder, item);

    isDragging = true;
    document.body.style.cursor = 'grabbing';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging || !draggedItem) return;
    draggedItem.style.top = (e.clientY - offsetY) + 'px';

    const elements = getVisualChildren();
    let target = null;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        target = el;
        break;
      }
    }

    if (placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    if (target) {
      target.parentNode.insertBefore(placeholder, target);
    } else {
      listEl.appendChild(placeholder);
    }
  }

  function onMouseUp() {
    if (!isDragging || !draggedItem) return;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';

    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedItem, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    }

    draggedItem.classList.remove('dragging');
    draggedItem.style.position = '';
    draggedItem.style.width = '';
    draggedItem.style.top = '';
    draggedItem.style.left = '';
    draggedItem.style.zIndex = '';
    draggedItem.style.pointerEvents = '';

    saveCurrentProjectOrder(listEl);

    draggedItem = null;
    placeholder = null;
    isDragging = false;
  }

  listEl.addEventListener('mousedown', onMouseDown);
}

/**
 * Persist the current visual order of project cards.
 */
async function saveCurrentProjectOrder(listEl) {
  const items = listEl.querySelectorAll('.project-card[data-project-id]');
  const orderedIds = [...items].map(el => el.dataset.projectId);
  setProjectOrder(orderedIds);
  await window.tracker.saveProjectOrder(orderedIds);
}
