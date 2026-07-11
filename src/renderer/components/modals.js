/* ========================================
   COMPONENT — Modals (Add Task, Estimate, Project)
   ======================================== */

import { setTrackedTasks, setCustomProjects, renderCurrentView } from '../state.js';

// ---- Init ----
export function initModals() {
  // Add task modal
  document.getElementById('btn-modal-close').addEventListener('click', closeModals);
  document.getElementById('btn-cancel-task').addEventListener('click', closeModals);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModals();
  });

  // Estimate modal
  document.getElementById('btn-estimate-close').addEventListener('click', closeModals);
  document.getElementById('btn-estimate-cancel').addEventListener('click', closeModals);
  document.getElementById('estimate-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('estimate-modal-overlay')) closeModals();
  });

  // Form submissions
  document.getElementById('form-add-task').addEventListener('submit', handleAddTask);
  document.getElementById('form-estimate').addEventListener('submit', handleSetEstimate);
}

// ---- Add Task Modal ----
export function openAddTaskModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('task-date').value = today;
  document.getElementById('task-time').value = '09:00';
  document.getElementById('task-name').value = '';
  document.getElementById('task-estimate').value = '';
  document.getElementById('modal-overlay').style.display = 'flex';
}

// ---- Estimate Modal ----
export function openEstimateModal(taskId, currentEstimate) {
  document.getElementById('estimate-task-id').value = taskId;
  document.getElementById('estimate-minutes').value = currentEstimate || '';
  document.getElementById('estimate-modal-overlay').style.display = 'flex';
}

// ---- Close All Modals ----
export function closeModals() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('estimate-modal-overlay').style.display = 'none';
}

// ---- Handlers ----
async function handleAddTask(e) {
  e.preventDefault();

  const name = document.getElementById('task-name').value.trim();
  const date = document.getElementById('task-date').value;
  const time = document.getElementById('task-time').value;
  const estimate = parseInt(document.getElementById('task-estimate').value) || 60;

  if (!name || !date || !time) return;

  const startDate = new Date(`${date}T${time}`);
  const endDate = new Date(startDate.getTime() + estimate * 60000);

  const task = {
    id: `manual-${Date.now()}`,
    name,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    estimateMinutes: estimate,
    isManual: true,
    createdAt: new Date().toISOString(),
  };

  await window.tracker.saveTask(task);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  renderCurrentView();
}

async function handleSetEstimate(e) {
  e.preventDefault();

  const taskId = document.getElementById('estimate-task-id').value;
  const minutes = parseInt(document.getElementById('estimate-minutes').value);

  if (!taskId || !minutes) return;

  await window.tracker.setEstimate(taskId, minutes);
  setTrackedTasks(await window.tracker.getTasks());

  closeModals();
  renderCurrentView();
}

// ---- Project Modal (init is handled by views/projects.js) ----
export function initProjectModal() {
  const newProjBtn = document.getElementById('btn-new-project');
  const projModalOverlay = document.getElementById('project-modal-overlay');
  const closeProjBtn = document.getElementById('btn-project-close');
  const cancelProjBtn = document.getElementById('btn-project-cancel');
  const formProj = document.getElementById('form-project');

  if (newProjBtn) {
    newProjBtn.addEventListener('click', () => {
      document.getElementById('project-modal-title').textContent = 'Create Project';
      document.getElementById('project-id').value = '';
      document.getElementById('project-name').value = '';
      const radios = document.getElementsByName('project-color');
      if (radios.length > 0) radios[0].checked = true;
      projModalOverlay.style.display = 'flex';

      // Force input focus in Electron
      setTimeout(() => {
        const input = document.getElementById('project-name');
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    });
  }

  const closeProjModal = () => {
    projModalOverlay.style.display = 'none';
  };

  if (closeProjBtn) closeProjBtn.addEventListener('click', closeProjModal);
  if (cancelProjBtn) cancelProjBtn.addEventListener('click', closeProjModal);
  if (projModalOverlay) {
    projModalOverlay.addEventListener('click', (e) => {
      if (e.target === projModalOverlay) closeProjModal();
    });
  }

  if (formProj) {
    formProj.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('project-id').value;
      const name = document.getElementById('project-name').value;
      const color = document.querySelector('input[name="project-color"]:checked').value;

      const project = { name, color };
      if (id) project.id = id;

      await window.tracker.saveProject(project);
      setCustomProjects(await window.tracker.getProjects());
      closeProjModal();
      // Dynamically import to avoid circular deps
      const { renderProjects } = await import('../views/projects.js');
      renderProjects();
    });
  }
}

/**
 * Open the project modal in edit mode populated with the given project details.
 */
export function openEditProjectModal(project) {
  const projModalOverlay = document.getElementById('project-modal-overlay');
  document.getElementById('project-modal-title').textContent = 'Edit Project';
  document.getElementById('project-id').value = project.id;
  document.getElementById('project-name').value = project.name;
  
  const radio = document.querySelector(`input[name="project-color"][value="${project.color}"]`);
  if (radio) {
    radio.checked = true;
  }
  
  projModalOverlay.style.display = 'flex';
  setTimeout(() => {
    const input = document.getElementById('project-name');
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

