/* ========================================
   VIEW — Calendar (Week View - Google Calendar Style)
   ======================================== */

import { getState, setTrackedTasks } from "../state.js";
import { openAddTaskModal } from "../components/modals.js";
import { getLocalDateString, getCombinedEvents } from "../utils.js";

let viewDate = new Date();
let currentWeekDates = [];
let selectedEventEl = null;
let drag = null;

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatTimeLabel(h) {
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12} ${ampm}`;
}

function escapeHtml(text) {
  if (text == null) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function formatShort(dt) {
  let h = dt.getHours();
  const m = dt.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  if (m === 0) return `${h}${ampm}`;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function roundTo15(m) {
  return Math.round(m / 15) * 15;
}

function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function renderCalendar() {
  const weekTitle = document.getElementById("week-title");
  const weekHeaderRow = document.getElementById("week-header-row");
  const timeAxis = document.getElementById("time-axis");
  const weekColumns = document.getElementById("week-columns");
  const prevBtn = document.getElementById("week-prev");
  const nextBtn = document.getElementById("week-next");
  const todayBtn = document.getElementById("week-today");
  const scrollEl = document.getElementById("week-scroll");

  if (!weekTitle || !weekHeaderRow || !timeAxis || !weekColumns) return;

  prevBtn.onclick = () => { viewDate = addDays(viewDate, -7); renderCalendar(); };
  nextBtn.onclick = () => { viewDate = addDays(viewDate, 7); renderCalendar(); };
  todayBtn.onclick = () => { viewDate = new Date(); renderCalendar(); };

  const weekStart = startOfWeek(viewDate);
  const todayStr = getLocalDateString();

  currentWeekDates = [];
  for (let i = 0; i < 7; i++) currentWeekDates.push(addDays(weekStart, i));

  const weekEnd = addDays(weekStart, 6);
  weekTitle.textContent = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Header row
  weekHeaderRow.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = currentWeekDates[i];
    const h = document.createElement("div");
    h.className = "week-day-header";
    if (getLocalDateString(d) === todayStr) h.classList.add("today");
    h.innerHTML = `<div class="week-day-name">${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div><div class="week-day-num">${d.getDate()}</div>`;
    weekHeaderRow.appendChild(h);
  }

  // Time axis
  timeAxis.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const slot = document.createElement("div");
      slot.className = "time-slot-label";
      if (m === 0) slot.textContent = formatTimeLabel(h);
      timeAxis.appendChild(slot);
    }
  }

  // Build grid
  weekColumns.innerHTML = "";
  const state = getState();
  const allItems = getCombinedEvents(state.calendarEvents, state.trackedTasks);

  const byDate = {};
  allItems.forEach((it) => {
    const k = getLocalDateString(it.start);
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(it);
  });

  for (let i = 0; i < 7; i++) {
    const d = currentWeekDates[i];
    const dStr = getLocalDateString(d);
    const col = document.createElement("div");
    col.className = "week-day-col";
    col.dataset.dayIndex = String(i);

    // Grid lines
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const line = document.createElement("div");
        line.className = "time-grid-line";
        line.dataset.mins = String(h * 60 + m);
        col.appendChild(line);
      }
    }

    // Events
    const dayEvents = byDate[dStr] || [];
    dayEvents.forEach((ev) => {
      const evEl = document.createElement("div");
      const start = new Date(ev.start);
      const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + (ev.durationMinutes || 60) * 60000);
      const sMins = start.getHours() * 60 + start.getMinutes();
      const eMins = end.getHours() * 60 + end.getMinutes();
      const height = Math.max(8, eMins - sMins);

      const readOnly = !ev.isManual && ev.calendarEventId;
      evEl.className = "week-event" + (readOnly ? " readonly" : " draggable");
      evEl.style.top = `${(sMins / 15) * 20}px`;
      evEl.style.height = `${(height / 15) * 20}px`;

      const name = ev.summary || state.trackedTasks[ev.id]?.name || "Untitled";
      const timeText = ev.isAllDay ? "All Day" : `${formatShort(start)} – ${formatShort(end)}`;
      const isCompleted = state.trackedTasks[ev.id]?.completed || state.trackedTasks[ev.id]?.status === "completed";

      evEl.innerHTML = `
        <div class="event-checkbox" title="Toggle completed"></div>
        <div class="event-content">
          <div class="event-name">${escapeHtml(name)}</div>
          <div class="event-time">${escapeHtml(timeText)}</div>
        </div>
        <div class="event-resize-handle"></div>
      `;

      if (isCompleted) evEl.classList.add("completed");
      if (!readOnly) evEl.dataset.eventId = ev.id;

      col.appendChild(evEl);
    });

    // Selection overlay
    const sel = document.createElement("div");
    sel.className = "week-selection";
    sel.style.display = "none";
    col.appendChild(sel);

    // Current time indicator (only on today's column)
    if (dStr === todayStr) {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const timeLine = document.createElement("div");
      timeLine.className = "current-time-line";
      timeLine.style.top = `${(nowMins / 15) * 20}px`;
      col.appendChild(timeLine);
    }

    weekColumns.appendChild(col);
  }

  if (scrollEl) {
    const savedScroll = scrollEl.dataset.savedScrollTop;
    scrollEl.scrollTop = savedScroll ? parseInt(savedScroll) : (8 * 60 / 15) * 20;
  }
}

// Update current time line position every minute
function updateCurrentTimeLine() {
  const line = document.querySelector(".current-time-line");
  if (!line) return;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  line.style.top = `${(nowMins / 15) * 20}px`;
}
setInterval(updateCurrentTimeLine, 60000);

// ========================================
// Persistent event handlers using pointer events + setPointerCapture
// ========================================

function getEventMins(el) {
  const top = parseFloat(el.style.top);
  const h = parseFloat(el.style.height);
  return {
    sMins: Math.round((top / 20) * 15),
    eMins: Math.round(((top + h) / 20) * 15),
  };
}

function getDayIndexFromX(clientX) {
  const cols = document.querySelectorAll(".week-day-col");
  for (let i = 0; i < cols.length; i++) {
    const rect = cols[i].getBoundingClientRect();
    if (clientX >= rect.left && clientX < rect.right) return i;
  }
  // Fallback: find closest
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const rect = cols[i].getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(clientX - center);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function onPointerDown(e) {
  // 0) Checkbox click — toggle completed state
  const checkbox = e.target.closest(".event-checkbox");
  if (checkbox) {
    e.preventDefault();
    e.stopPropagation();
    const eventEl = checkbox.closest(".week-event");
    if (eventEl && eventEl.dataset.eventId) {
      const state = getState();
      const task = state.trackedTasks[eventEl.dataset.eventId];
      if (task) {
        task.completed = !task.completed;
        task.status = task.completed ? "completed" : "todo";
        task.completedAt = task.completed ? new Date().toISOString() : null;
        window.tracker.saveTask(task).then(() => {
          const nt = { ...getState().trackedTasks };
          nt[task.id] = task;
          setTrackedTasks(nt);
          renderCalendar();
        });
      }
    }
    return;
  }

  // 1) Event click/drag
  const eventEl = e.target.closest(".week-event.draggable");
  if (eventEl) {
    e.preventDefault();
    if (selectedEventEl) selectedEventEl.classList.remove("selected");
    selectedEventEl = eventEl;
    eventEl.classList.add("selected");

    const { sMins, eMins } = getEventMins(eventEl);
    const col = eventEl.closest(".week-day-col");
    const dayIdx = col ? parseInt(col.dataset.dayIndex) : 0;
    const isResize = e.target.classList.contains("event-resize-handle");

    drag = {
      type: isResize ? "resize" : "move",
      el: eventEl,
      id: eventEl.dataset.eventId,
      startPointerY: e.clientY,
      startMins: sMins,
      startEMins: eMins,
      dayIdx,
    };

    eventEl.setPointerCapture(e.pointerId);
    eventEl.style.zIndex = "20";
    eventEl.style.opacity = isResize ? "1" : "0.7";
    return;
  }

  // 2) Empty grid — create drag
  const gridLine = e.target.closest(".time-grid-line");
  if (gridLine) {
    e.preventDefault();
    const col = gridLine.closest(".week-day-col");
    if (!col) return;

    const dayIdx = parseInt(col.dataset.dayIndex);
    const rounded = roundTo15(parseInt(gridLine.dataset.mins));
    const sel = col.querySelector(".week-selection");

    drag = { type: "create", startDayIdx: dayIdx, startMins: rounded, endMins: rounded + 15, sel };

    if (sel) {
      sel.style.top = `${(rounded / 15) * 20}px`;
      sel.style.height = "20px";
      sel.style.display = "block";
    }
  }
}

function onPointerMove(e) {
  if (!drag) return;

  if (drag.type === "move") {
    const deltaMins = roundTo15(((e.clientY - drag.startPointerY) / 20) * 15);
    const newS = Math.max(0, Math.min(1439, drag.startMins + deltaMins));
    drag.el.style.top = `${(newS / 15) * 20}px`;
    drag.dayIdx = getDayIndexFromX(e.clientX);
    return;
  }

  if (drag.type === "resize") {
    const deltaMins = roundTo15(((e.clientY - drag.startPointerY) / 20) * 15);
    const newE = Math.max(drag.startMins + 15, Math.min(1440, drag.startEMins + deltaMins));
    drag.el.style.height = `${((newE - drag.startMins) / 15) * 20}px`;
    return;
  }

  if (drag.type === "create" && drag.sel) {
    const col = drag.sel.closest(".week-day-col");
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const mins = Math.max(0, Math.min(1440, roundTo15((relY / 20) * 15) + 15));
    drag.endMins = mins;
    const s = Math.min(drag.startMins, mins);
    const en = Math.max(drag.startMins, mins);
    drag.sel.style.top = `${(s / 15) * 20}px`;
    drag.sel.style.height = `${((en - s) / 15) * 20}px`;
  }
}

async function onPointerUp(e) {
  if (!drag) return;

  if (drag.type === "move") {
    const { sMins, eMins } = getEventMins(drag.el);
    const newDate = currentWeekDates[drag.dayIdx];
    const ns = new Date(newDate); ns.setHours(Math.floor(sMins / 60), sMins % 60, 0, 0);
    const ne = new Date(newDate); ne.setHours(Math.floor(eMins / 60), eMins % 60, 0, 0);

    const state = getState();
    const task = state.trackedTasks[drag.id];
    if (task) {
      task.start = ns.toISOString();
      task.end = ne.toISOString();
      // Persist the new start: the repository stores the task time in due_date
      // and saveTask prefers `due` over `start`, so both must be updated here.
      task.due = ns.toISOString();
      task.isAllDay = false;
      await window.tracker.saveTask(task);
      const nt = { ...state.trackedTasks }; nt[drag.id] = task;
      setTrackedTasks(nt);
      const scrollEl = document.getElementById("week-scroll");
      const savedScroll = scrollEl?.scrollTop || 0;
      await renderCalendar();
      if (scrollEl) scrollEl.scrollTop = savedScroll;
    }
  }

  if (drag.type === "resize") {
    const { sMins, eMins } = getEventMins(drag.el);
    const col = drag.el.closest(".week-day-col");
    const dayIdx = col ? parseInt(col.dataset.dayIndex) : 0;
    const newDate = currentWeekDates[dayIdx];
    const ne = new Date(newDate); ne.setHours(Math.floor(eMins / 60), eMins % 60, 0, 0);

    const state = getState();
    const task = state.trackedTasks[drag.id];
    if (task) {
      task.end = ne.toISOString();
      const dur = Math.round((ne - new Date(task.start)) / 60000);
      task.estimateMinutes = dur > 0 ? dur : task.estimateMinutes;
      await window.tracker.saveTask(task);
      const nt = { ...state.trackedTasks }; nt[drag.id] = task;
      setTrackedTasks(nt);
      const scrollEl = document.getElementById("week-scroll");
      const savedScroll = scrollEl?.scrollTop || 0;
      renderCalendar();
      if (scrollEl) scrollEl.scrollTop = savedScroll;
    }
  }

  if (drag.type === "create") {
    let s = drag.startMins, en = drag.endMins;
    if (en < s) [s, en] = [en, s];
    if (en - s < 15) en = s + 15;
    if (drag.sel) drag.sel.style.display = "none";
    openAddTaskModal(getLocalDateString(currentWeekDates[drag.startDayIdx]), null, { startTime: minutesToTime(s), endTime: minutesToTime(en) });
  }

  if (selectedEventEl) { selectedEventEl.style.cursor = ""; selectedEventEl.style.opacity = ""; selectedEventEl.style.zIndex = ""; }
  drag = null;
}

function onKeyDown(e) {
  if (e.key === "Escape" && selectedEventEl) { selectedEventEl.classList.remove("selected"); selectedEventEl = null; }
}

document.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("keydown", onKeyDown);