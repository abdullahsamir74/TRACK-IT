/* ========================================
   COMPONENT — Modern Custom Calendar & Time Pickers
   ======================================== */

import { getLocalDateString, getLocalTimeString } from "../utils.js";

let activePopover = null;

/** Close any open picker popover */
export function closeCustomPickers() {
  if (activePopover && activePopover.parentElement) {
    activePopover.parentElement.removeChild(activePopover);
  }
  activePopover = null;
}

/** Initialize custom pickers on all date & time inputs */
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

  // Attach handlers to date and time inputs
  attachPickersToInputs();
}

/** Attach pickers to inputs */
export function attachPickersToInputs() {
  const dateInputs = document.querySelectorAll('input[type="date"]');
  const timeInputs = document.querySelectorAll('input[type="time"]');

  dateInputs.forEach((input) => setupInputPicker(input, "date"));
  timeInputs.forEach((input) => setupInputPicker(input, "time"));
}

function setupInputPicker(input, type) {
  if (input.dataset.customPickerAttached) return;
  input.dataset.customPickerAttached = "true";

  // Prevent default native browser popup where possible
  input.setAttribute("autocomplete", "off");

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

/* ========================================
   CALENDAR PICKER
   ======================================== */
function openCalendarPicker(input, wrapper) {
  const popover = document.createElement("div");
  popover.className = "picker-popover";
  popover.dataset.targetId = input.id || "date-input";

  let currentDate = new Date();
  if (input.value) {
    const parts = input.value.split("-");
    if (parts.length === 3) {
      currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }

  let viewYear = currentDate.getFullYear();
  let viewMonth = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

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
        <span class="picker-title">${monthNames[viewMonth]} ${viewYear}</span>
        <button type="button" class="picker-today-btn btn-today">Today</button>
        <button type="button" class="picker-nav-btn btn-next-month" title="Next Month">›</button>
      </div>
      <div class="picker-weekdays">
        <div class="picker-weekday">Su</div>
        <div class="picker-weekday">Mo</div>
        <div class="picker-weekday">Tu</div>
        <div class="picker-weekday">We</div>
        <div class="picker-weekday">Th</div>
        <div class="picker-weekday">Fr</div>
        <div class="picker-weekday">Sa</div>
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

      if (dateVal === todayStr) {
        cell.classList.add("today");
      }
      if (dateVal === selectedStr) {
        cell.classList.add("selected");
      }

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = dateVal;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        closeCustomPickers();
      });

      grid.appendChild(cell);
    }

    // Next month padding days to fill 42 cells (6 rows)
    const totalCellsSoFar = firstDayOfMonth + daysInMonth;
    const remaining = (42 - totalCellsSoFar) % 7;
    for (let i = 1; i <= remaining; i++) {
      const cell = document.createElement("div");
      cell.className = "picker-day-cell other-month";
      cell.textContent = i;
      grid.appendChild(cell);
    }

    // Events
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
      const tStr = getLocalDateString(t);
      input.value = tStr;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomPickers();
    });
  }

  render();
  positionPopover(popover, wrapper || input);
  activePopover = popover;
}

/* ========================================
   TIME PICKER
   ======================================== */
function openTimePicker(input, wrapper) {
  const popover = document.createElement("div");
  popover.className = "picker-popover";
  popover.dataset.targetId = input.id || "time-input";

  let initialVal = input.value || getLocalTimeString();
  let [hStr, mStr] = initialVal.split(":");
  let hours24 = parseInt(hStr || "9", 10);
  let minutes = parseInt(mStr || "0", 10);

  function updateInputValue() {
    const formattedH = String(hours24).padStart(2, "0");
    const formattedM = String(minutes).padStart(2, "0");
    input.value = `${formattedH}:${formattedM}`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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

    // Presets
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
        updateInputValue();
        render();
      });
    });

    // AM / PM Switch
    popover.querySelectorAll(".picker-ampm-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetPm = btn.dataset.ampm === "PM";
        if (targetPm && hours24 < 12) {
          hours24 += 12;
        } else if (!targetPm && hours24 >= 12) {
          hours24 -= 12;
        }
        updateInputValue();
        render();
      });
    });

    // Hours Grid
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
        updateInputValue();
        render();
      });
    });

    // Minutes Grid
    popover.querySelectorAll("[data-minute]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        minutes = parseInt(btn.dataset.minute, 10);
        updateInputValue();
        render();
      });
    });

    // Steppers
    popover.querySelector(".btn-min-minus").addEventListener("click", (e) => {
      e.stopPropagation();
      minutes = (minutes - 1 + 60) % 60;
      updateInputValue();
      render();
    });

    popover.querySelector(".btn-min-plus").addEventListener("click", (e) => {
      e.stopPropagation();
      minutes = (minutes + 1) % 60;
      updateInputValue();
      render();
    });
  }

  render();
  positionPopover(popover, wrapper || input);
  activePopover = popover;
}

/* Position popover near target element */
function positionPopover(popover, targetElement) {
  document.body.appendChild(popover);
  const rect = targetElement.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();

  let top = rect.bottom + window.scrollY + 6;
  let left = rect.left + window.scrollX;

  // Prevent overflowing right edge
  if (left + popRect.width > window.innerWidth - 12) {
    left = window.innerWidth - popRect.width - 12;
  }

  // Prevent overflowing bottom edge
  if (top + popRect.height > window.innerHeight + window.scrollY - 12) {
    top = rect.top + window.scrollY - popRect.height - 6;
  }

  popover.style.top = `${Math.max(12, top)}px`;
  popover.style.left = `${Math.max(12, left)}px`;
}
