/* ========================================
   COMPONENT — Drag & Drop (Schedule task reordering)
   ======================================== */

import { taskOrder, setTaskOrder } from '../state.js';

/**
 * Initialize mouse-based drag-and-drop on a task list element.
 * Used by the schedule view for task reordering.
 */
export function initDragAndDrop(listEl) {
  if (listEl.dataset.dragInitDone === 'true') return;
  listEl.dataset.dragInitDone = 'true';

  let draggedItem = null;
  let placeholder = null;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let hasDragged = false;

  function getVisualChildren() {
    return [...listEl.children].filter(el =>
      el !== draggedItem &&
      !el.classList.contains('drag-placeholder') &&
      !el.classList.contains('dragging')
    );
  }

  function onMouseDown(e) {
    // Prevent drag initiation when clicking interactive components
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.task-actions') || e.target.closest('.task-checkbox')) {
      return;
    }

    const item = e.target.closest('.task-item, .timer-task-option');
    if (!item) return;

    draggedItem = item;
    startX = e.clientX;
    startY = e.clientY;
    hasDragged = false;
    isDragging = false;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!draggedItem) return;

    if (!isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        isDragging = true;
        hasDragged = true;

        e.preventDefault();

        const rect = draggedItem.getBoundingClientRect();

        // Create placeholder
        placeholder = document.createElement('div');
        const isTimerOption = draggedItem.classList.contains('timer-task-option');
        placeholder.className = isTimerOption ? 'timer-task-option drag-placeholder' : 'task-item drag-placeholder';
        placeholder.style.height = rect.height + 'px';

        // Style the dragged item as floating
        draggedItem.classList.add('dragging');
        draggedItem.style.position = 'fixed';
        draggedItem.style.width = rect.width + 'px';
        draggedItem.style.top = rect.top + 'px';
        draggedItem.style.left = rect.left + 'px';
        draggedItem.style.zIndex = '1000';
        draggedItem.style.pointerEvents = 'none';

        // Insert placeholder where the item was
        draggedItem.parentNode.insertBefore(placeholder, draggedItem);
        document.body.style.cursor = 'grabbing';
      } else {
        return;
      }
    }

    // Move the floating item
    const newTop = e.clientY - offsetY;
    draggedItem.style.top = newTop + 'px';

    // Find which child element we're hovering over
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

    // Remove existing placeholder and re-insert
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    if (target) {
      target.parentNode.insertBefore(placeholder, target);
    } else {
      // After the last child
      listEl.appendChild(placeholder);
    }
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';

    if (isDragging && draggedItem && placeholder) {
      // Place the real item where the placeholder is
      if (placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedItem, placeholder);
        placeholder.parentNode.removeChild(placeholder);
      }

      // Reset styles
      draggedItem.classList.remove('dragging');
      draggedItem.style.position = '';
      draggedItem.style.width = '';
      draggedItem.style.top = '';
      draggedItem.style.left = '';
      draggedItem.style.zIndex = '';
      draggedItem.style.pointerEvents = '';

      // Save the new order
      saveCurrentOrder(listEl);

      // If actual movement occurred, suppress the subsequent click event
      if (hasDragged) {
        const captureClick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          document.removeEventListener('click', captureClick, true);
        };
        document.addEventListener('click', captureClick, true);
        setTimeout(() => {
          document.removeEventListener('click', captureClick, true);
        }, 50);
      }
    }

    draggedItem = null;
    placeholder = null;
    isDragging = false;
    hasDragged = false;
  }

  listEl.addEventListener('mousedown', onMouseDown);
}

/**
 * Persist the current visual order of task items.
 */
export async function saveCurrentOrder(listEl) {
  const items = listEl.querySelectorAll('.task-item[data-task-id], .timer-task-option[data-task-id]');
  const orderedIds = [...items].map(el => el.dataset.taskId);
  setTaskOrder(orderedIds);
  await window.tracker.saveTaskOrder(orderedIds);
}
