/* ========================================
   COMPONENT — Global Keyboard Shortcuts
   ======================================== */

import { openAddTaskModal } from "./modals.js";
import { switchView } from "../state.js";

const VIEW_MAP = [
  "dashboard", // Ctrl + 1
  "schedule",  // Ctrl + 2
  "timer",     // Ctrl + 3
  "analytics", // Ctrl + 4
  "projects",  // Ctrl + 5
  "habits",    // Ctrl + 6
];

/** Check if the active element is a text input, textarea, select, or editable element */
function isInputElement(el) {
  if (!el) return false;
  const tagName = el.tagName ? el.tagName.toLowerCase() : "";
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    el.isContentEditable
  );
}

/** Check if any modal overlay is currently open */
function isAnyModalOpen() {
  const overlays = [
    "modal-overlay",
    "edit-task-modal-overlay",
    "estimate-modal-overlay",
    "global-target-modal-overlay",
  ];
  return overlays.some((id) => {
    const el = document.getElementById(id);
    return el && el.style.display === "flex";
  });
}

/** Initialize global keyboard shortcuts listener */
export function initKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    const key = e.key ? e.key.toLowerCase() : "";

    // 1. Ctrl + N / Cmd + N -> Quick Add Task Modal
    if (isCmdOrCtrl && key === "n") {
      e.preventDefault();
      openAddTaskModal();
      return;
    }

    // 2. Ctrl + 1..6 / Cmd + 1..6 -> Switch Views
    if (isCmdOrCtrl && e.key >= "1" && e.key <= "6") {
      const idx = parseInt(e.key, 10) - 1;
      if (VIEW_MAP[idx]) {
        e.preventDefault();
        switchView(VIEW_MAP[idx]);
        return;
      }
    }

    // 3. Spacebar -> Start / Pause / Resume Active Timer
    if (
      (e.code === "Space" || e.key === " ") &&
      !isInputElement(document.activeElement) &&
      !isAnyModalOpen()
    ) {
      const timerStartBtn = document.getElementById("btn-timer-start");
      if (timerStartBtn) {
        e.preventDefault();
        timerStartBtn.click();
      }
    }
  });
}
