/* ========================================
   COMPONENT — Global Keyboard Shortcuts
   ======================================== */

import { openAddTaskModal } from "./modals.js";
import { switchView } from "../state.js";



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
  const openModal = document.querySelector('.modal-overlay:not([style*="display: none"])');
  return !!openModal && openModal.style.display === "flex";
}

/** Initialize global keyboard shortcuts listener */
export function initKeyboardShortcuts() {
  // Dynamically annotate sidebar buttons with shortcut tooltips (Ctrl+1 .. Ctrl+9)
  const navButtons = document.querySelectorAll("#sidebar .sidebar-nav .nav-btn");
  navButtons.forEach((btn, idx) => {
    const num = idx + 1;
    if (num <= 9) {
      const label = btn.querySelector("span")?.textContent || btn.dataset.view || "";
      btn.setAttribute("title", `${label} (Ctrl+${num})`);
    }
  });

  window.addEventListener("keydown", (e) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    const key = e.key ? e.key.toLowerCase() : "";

    // 1. Ctrl + N / Cmd + N -> Quick Add Task Modal
    if (isCmdOrCtrl && key === "n") {
      e.preventDefault();
      openAddTaskModal();
      return;
    }

    // 2. Ctrl + 1..9 / Cmd + 1..9 -> Dynamically switch to N-th sidebar view
    if (isCmdOrCtrl && e.key >= "1" && e.key <= "9") {
      const idx = parseInt(e.key, 10) - 1;
      const currentNavButtons = document.querySelectorAll(
        "#sidebar .sidebar-nav .nav-btn",
      );
      const targetBtn = currentNavButtons[idx];
      if (targetBtn && targetBtn.dataset.view) {
        e.preventDefault();
        switchView(targetBtn.dataset.view);
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
