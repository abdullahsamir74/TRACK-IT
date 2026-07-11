/* ========================================
   COMPONENT — Confirm Dialog
   ======================================== */

import {
  setTrackedTasks, setTaskOrder,
  renderCurrentView,
} from '../state.js';

/**
 * Show a confirmation dialog for resetting all data.
 */
export function showConfirmDialog() {
  // Remove existing dialog if any
  const existing = document.querySelector('.confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>Reset All Data?</h3>
      <p>This will permanently delete all tracked sessions, estimates, task completions, and custom ordering. Calendar events from GNOME will remain untouched.</p>
      <div class="confirm-actions">
        <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
        <button class="btn btn-danger" id="confirm-reset">Reset Everything</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('confirm-reset').addEventListener('click', async () => {
    await window.tracker.resetAll();
    setTrackedTasks({});
    setTaskOrder([]);
    overlay.remove();
    renderCurrentView();
  });
}

/**
 * Wire up all reset buttons across views.
 */
export function initResetButtons() {
  const resetIds = ['btn-reset-dashboard', 'btn-reset-schedule', 'btn-reset-timer', 'btn-reset-analytics'];
  resetIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => showConfirmDialog());
    }
  });
}
