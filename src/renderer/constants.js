/* ========================================
   SHARED CONSTANTS & COMPARATORS
   ======================================== */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const PRIORITY_MAP = { high: 3, medium: 2, low: 1 };

/**
 * Comparator: all-day events first, then by start time.
 */
export function compareByDate(a, b) {
  const aAllDay = Boolean(a.isAllDay);
  const bAllDay = Boolean(b.isAllDay);
  if (aAllDay && !bAllDay) return -1;
  if (!aAllDay && bAllDay) return 1;
  return new Date(a.start) - new Date(b.start);
}

/**
 * Comparator: priority (high → low), then by start time.
 * Reads priority from a lookup map: { [taskId]: { priority } }
 */
export function compareByPriority(taskMap) {
  return (a, b) => {
    const taskA = taskMap[a.id] || {};
    const taskB = taskMap[b.id] || {};
    const pa = PRIORITY_MAP[taskA.priority] || 0;
    const pb = PRIORITY_MAP[taskB.priority] || 0;
    if (pa !== pb) return pb - pa;
    return new Date(a.start) - new Date(b.start);
  };
}

/**
 * Comparator: manual drag order, then by start time.
 * Reads order from an array of task IDs: [taskId, ...]
 */
export function compareByManualOrder(taskOrder) {
  const orderMap = {};
  taskOrder.forEach((id, i) => (orderMap[id] = i));
  return (a, b) => {
    const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
    const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
    if (oa !== ob) return oa - ob;
    return new Date(a.start) - new Date(b.start);
  };
}

/**
 * Sort an array of events in-place based on the current sort mode and state.
 * @param {Array} events - Array of event objects (mutated in place)
 * @param {Object} state - Must contain taskSortMode, taskOrder, trackedTasks
 */
export function sortEvents(events, state) {
  if (state.taskSortMode === "manual") {
    if (state.taskOrder && state.taskOrder.length > 0) {
      events.sort(compareByManualOrder(state.taskOrder));
    } else {
      events.sort((a, b) => new Date(a.start) - new Date(b.start));
    }
  } else if (state.taskSortMode === "date") {
    events.sort((a, b) => {
      const aAllDay = Boolean(state.trackedTasks[a.id]?.isAllDay || a.isAllDay);
      const bAllDay = Boolean(state.trackedTasks[b.id]?.isAllDay || b.isAllDay);
      if (aAllDay && !bAllDay) return -1;
      if (!aAllDay && bAllDay) return 1;
      return new Date(a.start) - new Date(b.start);
    });
  } else if (state.taskSortMode === "priority") {
    events.sort(compareByPriority(state.trackedTasks));
  }
}
