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
  let isDragging = false;

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

    const item = e.target.closest('.task-item');
    if (!item) return;

    e.preventDefault();
    draggedItem = item;

    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    // Create placeholder
    placeholder = document.createElement('div');
    placeholder.className = 'task-item drag-placeholder';
    placeholder.style.height = rect.height + 'px';

    // Style the dragged item as floating
    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.width = rect.width + 'px';
    item.style.top = rect.top + 'px';
    item.style.left = rect.left + 'px';
    item.style.zIndex = '1000';
    item.style.pointerEvents = 'none';

    // Insert placeholder where the item was
    item.parentNode.insertBefore(placeholder, item);

    isDragging = true;
    document.body.style.cursor = 'grabbing';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging || !draggedItem) return;

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
    if (placeholder.parentNode) {
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
    if (!isDragging || !draggedItem) return;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';

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

    draggedItem = null;
    placeholder = null;
    isDragging = false;
  }

  listEl.addEventListener('mousedown', onMouseDown);
}

/**
 * Persist the current visual order of task items.
 */
export async function saveCurrentOrder(listEl) {
  const items = listEl.querySelectorAll('.task-item[data-task-id]');
  const orderedIds = [...items].map(el => el.dataset.taskId);
  setTaskOrder(orderedIds);
  await window.tracker.saveTaskOrder(orderedIds);
}
