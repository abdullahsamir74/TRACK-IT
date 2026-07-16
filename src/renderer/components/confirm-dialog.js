/* ========================================
   COMPONENT — Confirm Dialog
   ======================================== */

import {
  setTrackedTasks, setTaskOrder,
  renderCurrentView,
} from '../state.js';

/**
 * Show a confirmation dialog.
 */
export function showConfirmDialog({ title, message, confirmText, onConfirm } = {}) {
  // Remove existing dialog if any
  const existing = document.querySelector('.confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>${title || 'Reset All Data?'}</h3>
      <p>${message || 'This will permanently delete all tracked sessions, estimates, task completions, and custom ordering. Calendar events from GNOME will remain untouched.'}</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
        <button class="btn btn-danger" id="confirm-reset">${confirmText || 'Reset Everything'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('confirm-reset').addEventListener('click', async () => {
    if (onConfirm) {
      await onConfirm();
    } else {
      // Backwards compatible default action
      await window.tracker.resetAll();
      setTrackedTasks({});
      setTaskOrder([]);
    }
    overlay.remove();
    renderCurrentView();
  });
}

export function initResetButtons() {
  // Reset for Dashboard / Schedule (Removes tasks, estimates, completions, sessions, custom ordering)
  const taskResetIds = ['btn-reset-dashboard', 'btn-reset-schedule'];
  taskResetIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        showConfirmDialog({
          title: 'Reset Tasks & Tracking?',
          message: 'This will permanently delete all tasks, manual tasks, estimates, completions, tracked sessions, and custom ordering. Calendar events from GNOME will remain untouched.',
          confirmText: 'Reset Tasks & Tracking',
          onConfirm: async () => {
            await window.tracker.resetTrackingData();
            setTrackedTasks({});
            setTaskOrder([]);
          }
        });
      });
    }
  });

  // Reset for Timer / Analytics (Removes sessions, resets time processed/analytics, keeps tasks intact)
  const sessionResetIds = ['btn-reset-timer', 'btn-reset-analytics'];
  sessionResetIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        showConfirmDialog({
          title: 'Reset Tracked Sessions?',
          message: 'This will permanently delete all tracked session history and reset tracked time/analytics, but will keep your tasks, manual tasks, estimates, completions, and custom ordering.',
          confirmText: 'Reset Sessions Only',
          onConfirm: async () => {
            await window.tracker.resetSessions();
            const tasks = await window.tracker.getTasks();
            setTrackedTasks(tasks || {});
          }
        });
      });
    }
  });
}
