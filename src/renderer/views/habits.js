/* ========================================
   VIEW — Habits Tracker
   ======================================== */

import { escapeHtml, getLocalDateString } from "../utils.js";
import { habits, setHabits, renderCurrentView } from "../state.js";
import { showConfirmDialog } from "../components/confirm-dialog.js";

// Selected calendar view state (defaults to current year/month)
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth(); // 0-indexed

/**
 * Initialize the habits view (event listeners for modals, navigation, resets).
 */
export function initHabits() {
  const newHabitBtn = document.getElementById("btn-new-habit");
  const habitModalOverlay = document.getElementById("habit-modal-overlay");
  const closeHabitBtn = document.getElementById("btn-habit-close");
  const cancelHabitBtn = document.getElementById("btn-habit-cancel");
  const formHabit = document.getElementById("form-habit");

  // Month navigation
  const prevMonthBtn = document.getElementById("btn-prev-month");
  const nextMonthBtn = document.getElementById("btn-next-month");

  if (newHabitBtn) {
    newHabitBtn.addEventListener("click", () => {
      document.getElementById("habit-modal-title").textContent = "Create Habit";
      document.getElementById("habit-id").value = "";
      document.getElementById("habit-name").value = "";
      habitModalOverlay.style.display = "flex";

      setTimeout(() => {
        const input = document.getElementById("habit-name");
        if (input) {
          input.focus();
        }
      }, 50);
    });
  }

  const closeHabitModal = () => {
    habitModalOverlay.style.display = "none";
  };

  if (closeHabitBtn) closeHabitBtn.addEventListener("click", closeHabitModal);
  if (cancelHabitBtn) cancelHabitBtn.addEventListener("click", closeHabitModal);
  if (habitModalOverlay) {
    habitModalOverlay.addEventListener("click", (e) => {
      if (e.target === habitModalOverlay) closeHabitModal();
    });
  }

  // Handle form submission for create/edit
  if (formHabit) {
    formHabit.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("habit-id").value;
      const name = document.getElementById("habit-name").value.trim();

      if (!name) return;

      const habit = { name };
      if (id) {
        habit.id = id;
      } else {
        habit.history = {};
      }

      await window.tracker.saveHabit(habit);

      // Reload habits
      setHabits(await window.tracker.getHabits());
      closeHabitModal();
      renderCurrentView();
    });
  }

  // Month navigation actions
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      selectedMonth--;
      if (selectedMonth < 0) {
        selectedMonth = 11;
        selectedYear--;
      }
      renderCurrentView();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      selectedMonth++;
      if (selectedMonth > 11) {
        selectedMonth = 0;
        selectedYear++;
      }
      renderCurrentView();
    });
  }
}

/**
 * Open habit modal in Edit mode.
 */
function openEditHabitModal(habit) {
  const habitModalOverlay = document.getElementById("habit-modal-overlay");
  document.getElementById("habit-modal-title").textContent = "Edit Habit";
  document.getElementById("habit-id").value = habit.id;
  document.getElementById("habit-name").value = habit.name;

  habitModalOverlay.style.display = "flex";
  setTimeout(() => {
    const input = document.getElementById("habit-name");
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

/**
 * Calculate the success streak ending at today (or selected month's end date if past).
 */
function calculateStreak(habit, year, month) {
  const now = new Date();
  const todayStr = getLocalDateString(now);

  let startDate;

  const selectedDate = new Date(year, month, 1);
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

  if (selectedDate.getTime() > currentMonthDate.getTime()) {
    // Selected month is in the future
    return 0;
  } else if (
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth()
  ) {
    // Selected month is current month
    startDate = new Date(now);
  } else {
    // Selected month is in the past: start from the last day of that month
    startDate = new Date(year, month + 1, 0);
  }

  let tempDate = new Date(startDate);
  let streak = 0;

  const isSuccess = (d) => {
    if (!habit.history) return false;
    const val = habit.history[getLocalDateString(d)];
    return val === "success" || val === true || val === 1;
  };

  // If starting today, check if today is success. If not, check yesterday.
  // If yesterday is success, start walking back from yesterday. If neither, streak is 0.
  if (getLocalDateString(tempDate) === todayStr) {
    if (!isSuccess(tempDate)) {
      const yesterday = new Date(tempDate);
      yesterday.setDate(yesterday.getDate() - 1);
      if (isSuccess(yesterday)) {
        tempDate = yesterday;
      } else {
        return 0;
      }
    }
  }

  while (isSuccess(tempDate)) {
    streak++;
    tempDate.setDate(tempDate.getDate() - 1);
  }

  return streak;
}

/**
 * Render the full habits view.
 */
export async function renderHabitsView() {
  const container = document.getElementById("habits-container");
  const monthLabel = document.getElementById("habits-current-month");

  if (!container || !monthLabel) return;

  // Load latest data
  const habitsData = await window.tracker.getHabits();
  setHabits(habitsData || {});

  // Update Month Navigation title
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  monthLabel.textContent = `${monthNames[selectedMonth]} ${selectedYear}`;

  container.innerHTML = "";

  const habitList = Object.values(habits);

  if (habitList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v8"/>
          <path d="M8 12h8"/>
        </svg>
        <p>No habits created yet</p>
        <span>Click "Create Habit" above to start tracking your daily progress</span>
      </div>
    `;
    return;
  }

  // Calculate days in the selected month
  const numDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  habitList.forEach((habit) => {
    habit.history = habit.history || {};

    // Stats calculations
    let successCount = 0;
    let failCount = 0;

    for (let day = 1; day <= numDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const val = habit.history[dateStr];
      if (val === "success" || val === true || val === 1) successCount++;
      if (val === "fail" || val === false || val === 0) failCount++;
    }

    const completionRate =
      numDays > 0 ? Math.round((successCount / numDays) * 100) : 0;
    const currentStreak = calculateStreak(habit, selectedYear, selectedMonth);

    // Calculate the weekday offset for the first of the month (Sunday-indexed)
    const firstDayDate = new Date(selectedYear, selectedMonth, 1);
    let startOffset = firstDayDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // Create habit card element
    const card = document.createElement("div");
    card.className = "habit-card glass";

    card.innerHTML = `
      <div class="habit-card-info">
        <div class="habit-card-title-row">
          <span class="habit-title">${escapeHtml(habit.name)}</span>
          <div class="habit-actions">
            <button class="habit-action-btn edit" title="Edit Habit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="habit-action-btn delete" title="Delete Habit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="habit-stats-panel">
          <div class="habit-rate-section">
            <div class="habit-rate-big">${completionRate}%</div>
            <div class="habit-rate-label">Completion Rate</div>
            <div class="habit-progress-bar-bg">
              <div class="habit-progress-bar-fill" style="width: ${completionRate}%;"></div>
            </div>
          </div>
          
          <div class="habit-badges-grid">
            <div class="habit-badge-item success" title="Success days in ${monthNames[selectedMonth]}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 2px;"><polyline points="20 6 9 17 4 12"/></svg>
              <span class="habit-badge-val">${successCount}</span>
              <span class="habit-badge-lbl">Done</span>
            </div>
            <div class="habit-badge-item failure" title="Failed days in ${monthNames[selectedMonth]}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span class="habit-badge-val">${failCount}</span>
              <span class="habit-badge-lbl">Failed</span>
            </div>
            <div class="habit-badge-item streak" title="Current consecutive streak of success days">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 2px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span class="habit-badge-val">${currentStreak}d</span>
              <span class="habit-badge-lbl">Streak</span>
            </div>
          </div>
        </div>
      </div>

      <div class="habit-card-calendar">
        <div class="habit-calendar-title">${monthNames[selectedMonth]} Progress</div>
        <div class="habit-days-grid">
          <!-- Calendar cells are dynamically appended -->
        </div>
      </div>
    `;

    const grid = card.querySelector(".habit-days-grid");

    // Add weekday headers (S, M, T, W, T, F, S)
    const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
    weekdays.forEach((day) => {
      const headerCell = document.createElement("div");
      headerCell.className = "habit-grid-header-cell";
      headerCell.textContent = day;
      grid.appendChild(headerCell);
    });

    // Add empty placeholders for day of the week offset
    for (let i = 0; i < startOffset; i++) {
      const placeholder = document.createElement("div");
      placeholder.className = "habit-day-placeholder";
      grid.appendChild(placeholder);
    }

    // Build day circles
    for (let day = 1; day <= numDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const rawVal = habit.history[dateStr];
      let status = "unset";
      if (rawVal === "success" || rawVal === true || rawVal === 1) {
        status = "success";
      } else if (rawVal === "fail" || rawVal === false || rawVal === 0) {
        status = "fail";
      }

      const circle = document.createElement("div");
      circle.className = "habit-day-circle";
      if (status === "success") circle.classList.add("state-success");
      if (status === "fail") circle.classList.add("state-fail");

      circle.textContent = day;

      // Human-readable date string for title/tooltip
      const tempDate = new Date(selectedYear, selectedMonth, day);
      const dayOptions = {
        weekday: "long",
        year: "numeric",
        month: "short",
        day: "numeric",
      };
      const humanDate = tempDate.toLocaleDateString("en-US", dayOptions);
      circle.setAttribute(
        "title",
        `${humanDate}\nClick to toggle: Unset → Done → Failed`,
      );

      // Day click event listener to cycle state
      circle.addEventListener("click", async () => {
        let newStatus;
        if (status === "unset") {
          newStatus = "success";
        } else if (status === "success") {
          newStatus = "fail";
        } else {
          newStatus = "unset";
        }

        // Optimistic UI update
        circle.classList.remove("state-success", "state-fail");
        if (newStatus === "success") {
          circle.classList.add("state-success");
        } else if (newStatus === "fail") {
          circle.classList.add("state-fail");
        }

        if (newStatus === "unset") {
          delete habit.history[dateStr];
        } else {
          habit.history[dateStr] = newStatus;
        }

        await window.tracker.saveHabit(habit);
        // Refresh view
        renderCurrentView();
      });

      grid.appendChild(circle);
    }

    // Attach actions
    card.querySelector(".edit").addEventListener("click", () => {
      openEditHabitModal(habit);
    });

    card.querySelector(".delete").addEventListener("click", () => {
      showConfirmDialog({
        title: "Delete Habit?",
        message: `Are you sure you want to permanently delete the habit "${habit.name}" and all its history?`,
        confirmText: "Delete Habit",
        onConfirm: async () => {
          await window.tracker.deleteHabit(habit.id);
          setHabits(await window.tracker.getHabits());
          renderCurrentView();
        },
      });
    });

    container.appendChild(card);
  });

  // Render a little legend helper at the bottom
  const legend = document.createElement("div");
  legend.className = "habits-legend";
  legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-dot"></div>
      <span>Unset / Gray</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot success"></div>
      <span>Went Well / Green (Click once)</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot fail"></div>
      <span>Did Not Go Well / Red (Click twice)</span>
    </div>
  `;
  container.appendChild(legend);
}
