/* ========================================
   MODALS — Project (Create / Edit)
   ======================================== */

import { setCustomProjects } from "../../state.js";
import { showToast } from "../toast.js";

let projectModalInitialized = false;

export function initProjectModal() {
  if (projectModalInitialized) return;
  projectModalInitialized = true;

  const newProjBtn = document.getElementById("btn-new-project");
  const projModalOverlay = document.getElementById("project-modal-overlay");
  const closeProjBtn = document.getElementById("btn-project-close");
  const cancelProjBtn = document.getElementById("btn-project-cancel");
  const formProj = document.getElementById("form-project");

  if (newProjBtn) {
    newProjBtn.addEventListener("click", () => {
      document.getElementById("project-modal-title").textContent =
        "Create Project";
      document.getElementById("project-id").value = "";
      document.getElementById("project-name").value = "";

      const radios = document.getElementsByName("project-color");
      if (radios.length > 0) radios[0].checked = true;
      projModalOverlay.style.display = "flex";

      setTimeout(() => {
        const input = document.getElementById("project-name");
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    });
  }

  const closeProjModal = () => {
    projModalOverlay.style.display = "none";
  };

  if (closeProjBtn) closeProjBtn.addEventListener("click", closeProjModal);
  if (cancelProjBtn) cancelProjBtn.addEventListener("click", closeProjModal);
  if (projModalOverlay) {
    projModalOverlay.addEventListener("click", (e) => {
      if (e.target === projModalOverlay) closeProjModal();
    });
  }

  if (formProj) {
    formProj.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("project-id").value;
      const name = document.getElementById("project-name").value;
      const color = document.querySelector(
        'input[name="project-color"]:checked',
      ).value;

      const project = { name, color };
      if (id) project.id = id;

      await window.tracker.saveProject(project);

      setCustomProjects(await window.tracker.getProjects());
      closeProjModal();
      showToast("Project saved! 📁", "success");
      const { renderProjects } = await import("../../views/projects.js");
      renderProjects();
    });
  }
}

/**
 * Open the project modal in edit mode
 */
export async function openEditProjectModal(project) {
  const projModalOverlay = document.getElementById("project-modal-overlay");
  document.getElementById("project-modal-title").textContent = "Edit Project";
  document.getElementById("project-id").value = project.id;
  document.getElementById("project-name").value = project.name;

  const radio = document.querySelector(
    `input[name="project-color"][value="${project.color}"]`,
  );
  if (radio) {
    radio.checked = true;
  }

  projModalOverlay.style.display = "flex";
  setTimeout(() => {
    const input = document.getElementById("project-name");
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}
