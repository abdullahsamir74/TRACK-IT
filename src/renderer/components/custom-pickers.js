/* ========================================
   COMPONENT — Modern Custom Calendar & Time Pickers
   ======================================== */

import { getLocalDateString, getLocalTimeString } from "../utils.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

let activePopover = null;

// ---- Public API ----

/** Close any open picker popover */
export function closeCustomPickers() {
  if (activePopover && activePopover.parentElement) {
    activePopover.parentElement.removeChild(activePopover);
  }
  activePopover = null;
}

/** Initialize custom pickers event listeners */
export function initCustomPickers() {
  // Global click outside listener
  document.addEventListener("click", (e) => {
    if (!activePopover) return;
    const isInsidePopover = activePopover.contains(e.target);
    const isTargetInputWrapper = e.target.closest(".input-wrapper");
    if (!isInsidePopover && !isTargetInputWrapper) {
      closeCustomPickers();
    }
  });

  // Global ESC key listener (capture phase)
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) &&
        activePopover
      ) {
        e.preventDefault();
        e.stopPropagation();
        closeCustomPickers();
      }
    },
    true
  );

  // Attach handlers to current date and time inputs
  attachPickersToInputs();
}

/** Attach pickers to date and time inputs in DOM */
export function attachPickersToInputs() {
  const dateInputs = document.querySelectorAll('input[type="date"]');
  const timeInputs = document.querySelectorAll('input[type="time"]');

  dateInputs.forEach((input) => setupInputPicker(input, "date"));
  timeInputs.forEach((input) => setupInputPicker(input, "time"));
}

// ---- Helpers ----

/** Update input value and dispatch standard DOM events */
function notifyInputChange(input, newValue) {
  input.value = newValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Parse date string "YYYY-MM-DD" safely */
function parseDateValue(val) {
  if (val) {
    const parts = val.split("-");
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

/** Parse time string "HH:MM" safely */
function parseTimeValue(val) {
  const defaultVal = val || getLocalTimeString();
  const [hStr, mStr] = defaultVal.split(":");
  let hours24 = parseInt(hStr, 10);
  let minutes = parseInt(mStr, 10);
  if (isNaN(hours24)) hours24 = 9;
  if (isNaN(minutes)) minutes = 0;
  return { hours24, minutes };
}

/** Format 24-hour hours and minutes into "HH:MM" */
function formatTimeValue(hours24, minutes) {
  const formattedH = String(hours24).padStart(2, "0");
  const formattedM = String(minutes).padStart(2, "0");
  return `${formattedH}:${formattedM}`;
}

// ---- Setup Input Handlers ----

function setupInputPicker(input, type) {
  if (input.dataset.customPickerAttached) return;
  input.dataset.customPickerAttached = "true";

  input.setAttribute("autocomplete", "off");

  // Input keydown listener for Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      if (activePopover) {
        e.preventDefault();
        e.stopPropagation();
        closeCustomPickers();
      }
    }
  });

  const wrapper = input.closest(".input-wrapper") || input.parentElement;

  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle if clicking same input
    if (activePopover && activePopover.dataset.targetId === input.id) {
      closeCustomPickers();
      return;
    }

    closeCustomPickers();

    if (type === "date") {
      openCalendarPicker(input, wrapper);
    } else {
      openTimePicker(input, wrapper);
    }
  };

  input.addEventListener("click", handleOpen);
  if (wrapper) {
    wrapper.addEventListener("click", (e) => {
      if (e.target !== input) {
        handleOpen(e);
      }
    });
  }
}

// ---- Calendar Picker ----

function openCalendarPicker(input, wrapper) {
  const popover = document.createElement("div");
  popover.className = "picker-popover";
  popover.dataset.targetId = input.id || "date-input";

  const initialDate = parseDateValue(input.value);
  let viewYear = initialDate.getFullYear();
  let viewMonth = initialDate.getMonth();

  function render() {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const selectedStr = input.value || todayStr;

    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    popover.innerHTML = `
      <div class="picker-header">
        <button type="button" class="picker-nav-btn btn-prev-month" title="Previous Month">‹</button>
        <span class="picker-title">${MONTH_NAMES[viewMonth]} ${viewYear}</span>
        <button type="button" class="picker-today-btn btn-today">Today</button>
        <button type="button" class="picker-nav-btn btn-next-month" title="Next Month">›</button>
      </div>
      <div class="picker-weekdays">
        ${WEEKDAY_NAMES.map(w => `<div class="picker-weekday">${w}</div>`).join('')}
      </div>
      <div class="picker-days-grid"></div>
    `;

    const grid = popover.querySelector(".picker-days-grid");

    // Previous month padding days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cell = document.createElement("div");
      cell.className = "picker-day-cell other-month";
      cell.textContent = dayNum;
      grid.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(viewMonth + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateVal = `${viewYear}-${mStr}-${dStr}`;

      const cell = document.createElement("div");
      cell.className = "picker-day-cell";
      cell.textContent = day;

      if (dateVal === todayStr) cell.classList.add("today");
      if (dateVal === selectedStr) cell.classList.add("selected");

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        notifyInputChange(input, dateVal);
        closeCustomPickers();
      });

      grid.appendChild(cell);
    }

    // Next month padding days to complete 6 rows (42 cells)
    const totalCellsSoFar = firstDayOfMonth + daysInMonth;
    const remaining = (42 - totalCellsSoFar) % 7;
    for (let i = 1; i <= remaining; i++) {
      const cell = document.createElement("div");
      cell.className = "picker-day-cell other-month";
      cell.textContent = i;
      grid.appendChild(cell);
    }

    // Navigation event listeners
    popover.querySelector(".btn-prev-month").addEventListener("click", (e) => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      render();
    });

    popover.querySelector(".btn-next-month").addEventListener("click", (e) => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      render();
    });

    popover.querySelector(".btn-today").addEventListener("click", (e) => {
      e.stopPropagation();
      const t = new Date();
      viewYear = t.getFullYear();
      viewMonth = t.getMonth();
      notifyInputChange(input, getLocalDateString(t));
      closeCustomPickers();
    });
  }

  render();
  positionPopover(popover, wrapper || input);
  activePopover = popover;
}

// ---- Time Picker ----

function openTimePicker(input, wrapper) {
  const popover = document.createElement("div");
  popover.className = "picker-popover";
  popover.dataset.targetId = input.id || "time-input";

  let { hours24, minutes } = parseTimeValue(input.value);

  function syncValueAndNotify() {
    const formatted = formatTimeValue(hours24, minutes);
    notifyInputChange(input, formatted);
  }

  function render() {
    const isPm = hours24 >= 12;
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;

    const displayH = String(hours12).padStart(2, "0");
    const displayM = String(minutes).padStart(2, "0");
    const period = isPm ? "PM" : "AM";

    popover.innerHTML = `
      <div class="picker-time-display-card">
        <div class="picker-time-digital">${displayH}:${displayM} ${period}</div>
      </div>

      <div class="picker-time-presets">
        <button type="button" class="picker-preset-pill" data-preset="now">Now</button>
        <button type="button" class="picker-preset-pill" data-preset="+15">+15m</button>
        <button type="button" class="picker-preset-pill" data-preset="+30">+30m</button>
        <button type="button" class="picker-preset-pill" data-preset="+60">+1h</button>
        <button type="button" class="picker-preset-pill" data-preset="09:00">09:00 AM</button>
        <button type="button" class="picker-preset-pill" data-preset="14:00">02:00 PM</button>
      </div>

      <div class="picker-ampm-switch">
        <button type="button" class="picker-ampm-btn ${!isPm ? 'active' : ''}" data-ampm="AM">AM</button>
        <button type="button" class="picker-ampm-btn ${isPm ? 'active' : ''}" data-ampm="PM">PM</button>
      </div>

      <div class="picker-section-title">Hour</div>
      <div class="picker-hours-grid">
        ${[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => `
          <div class="picker-unit-pill ${h === hours12 ? 'active' : ''}" data-hour="${h}">${String(h).padStart(2, '0')}</div>
        `).join('')}
      </div>

      <div class="picker-section-title">Minute</div>
      <div class="picker-minutes-grid">
        ${[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => `
          <div class="picker-unit-pill ${m === Math.floor(minutes / 5) * 5 ? 'active' : ''}" data-minute="${m}">${String(m).padStart(2, '0')}</div>
        `).join('')}
      </div>

      <div class="picker-steppers">
        <button type="button" class="picker-stepper-btn btn-min-minus">- 1m</button>
        <button type="button" class="picker-stepper-btn btn-min-plus">+ 1m</button>
      </div>
    `;

    // Presets handler
    popover.querySelectorAll(".picker-preset-pill").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = btn.dataset.preset;
        const now = new Date();

        if (p === "now") {
          hours24 = now.getHours();
          minutes = now.getMinutes();
        } else if (p === "+15") {
          now.setMinutes(now.getMinutes() + 15);
          hours24 = now.getHours();
          minutes = now.getMinutes();
        } else if (p === "+30") {
          now.setMinutes(now.getMinutes() + 30);
          hours24 = now.getHours();
          minutes = now.getMinutes();
        } else if (p === "+60") {
          now.setHours(now.getHours() + 1);
          hours24 = now.getHours();
          minutes = now.getMinutes();
        } else {
          const [h, m] = p.split(":");
          hours24 = parseInt(h, 10);
          minutes = parseInt(m, 10);
        }
        syncValueAndNotify();
        render();
      });
    });

    // AM / PM Switch handler
    popover.querySelectorAll(".picker-ampm-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetPm = btn.dataset.ampm === "PM";
        if (targetPm && hours24 < 12) {
          hours24 += 12;
        } else if (!targetPm && hours24 >= 12) {
          hours24 -= 12;
        }
        syncValueAndNotify();
        render();
      });
    });

    // Hours Grid handler
    popover.querySelectorAll("[data-hour]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedH12 = parseInt(btn.dataset.hour, 10);
        const currentPm = hours24 >= 12;
        if (currentPm) {
          hours24 = selectedH12 === 12 ? 12 : selectedH12 + 12;
        } else {
          hours24 = selectedH12 === 12 ? 0 : selectedH12;
        }
        syncValueAndNotify();
        render();
      });
    });

    // Minutes Grid handler
    popover.querySelectorAll("[data-minute]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        minutes = parseInt(btn.dataset.minute, 10);
        syncValueAndNotify();
        render();
      });
    });

    // Steppers handler
    popover.querySelector(".btn-min-minus").addEventListener("click", (e) => {
      e.stopPropagation();
      minutes = (minutes - 1 + 60) % 60;
      syncValueAndNotify();
      render();
    });

    popover.querySelector(".btn-min-plus").addEventListener("click", (e) => {
      e.stopPropagation();
      minutes = (minutes + 1) % 60;
      syncValueAndNotify();
      render();
    });
  }

  render();
  positionPopover(popover, wrapper || input);
  activePopover = popover;
}

// ---- Positioning ----

function positionPopover(popover, targetElement) {
  document.body.appendChild(popover);
  const rect = targetElement.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();

  let top = rect.bottom + window.scrollY + 6;
  let left = rect.left + window.scrollX;

  // Constrain to right viewport edge
  if (left + popRect.width > window.innerWidth - 12) {
    left = window.innerWidth - popRect.width - 12;
  }

  // Constrain to bottom viewport edge
  if (top + popRect.height > window.innerHeight + window.scrollY - 12) {
    top = rect.top + window.scrollY - popRect.height - 6;
  }

  popover.style.top = `${Math.max(12, top)}px`;
  popover.style.left = `${Math.max(12, left)}px`;
}
