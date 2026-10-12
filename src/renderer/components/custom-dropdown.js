/* ========================================
   COMPONENT — Custom Modern Glassmorphic Dropdowns
   ======================================== */

let activeDropdownPopover = null;
let activeDropdownSelect = null;

/** Close any open custom dropdown popover */
export function closeCustomDropdowns() {
  if (activeDropdownPopover && activeDropdownPopover.parentElement) {
    activeDropdownPopover.parentElement.removeChild(activeDropdownPopover);
  }
  activeDropdownPopover = null;
  activeDropdownSelect = null;
}

/** Initialize custom dropdown listeners */
export function initCustomDropdowns() {
  // Click outside listener
  document.addEventListener("click", (e) => {
    if (!activeDropdownPopover) return;
    const isInsidePopover = activeDropdownPopover.contains(e.target);
    const isSameSelect =
      activeDropdownSelect &&
      (activeDropdownSelect === e.target ||
        activeDropdownSelect.contains(e.target));
    if (!isInsidePopover && !isSameSelect) {
      closeCustomDropdowns();
    }
  });

  // ESC key listener (capture phase)
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) &&
        activeDropdownPopover
      ) {
        e.preventDefault();
        e.stopPropagation();
        closeCustomDropdowns();
      }
    },
    true
  );

  attachCustomDropdowns();
}

/** Attach custom dropdown handlers to select inputs */
export function attachCustomDropdowns() {
  const selects = document.querySelectorAll("select.select-input");
  selects.forEach((select) => setupSelectDropdown(select));
}

function setupSelectDropdown(select) {
  // Skip hidden selects
  if (select.style.display === "none") return;
  if (select.dataset.customDropdownAttached) return;
  select.dataset.customDropdownAttached = "true";

  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle if clicking same select
    if (activeDropdownPopover && activeDropdownSelect === select) {
      closeCustomDropdowns();
      return;
    }

    closeCustomDropdowns();
    openDropdownPopover(select);
  };

  select.addEventListener("mousedown", handleOpen);
  select.addEventListener("click", (e) => e.preventDefault());

  select.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
      if (activeDropdownPopover) {
        e.preventDefault();
        e.stopPropagation();
        closeCustomDropdowns();
      }
    }
  });
}

function openDropdownPopover(select) {
  const popover = document.createElement("div");
  popover.className = "custom-dropdown-popover";
  popover.dataset.targetId = select.id || "select-input";

  const options = Array.from(select.options);
  const currentValue = select.value;

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.className = "dropdown-option-item";
    if (opt.value === currentValue) {
      item.classList.add("selected");
    }

    const label = document.createElement("span");
    label.textContent = opt.text;
    item.appendChild(label);

    if (opt.value === currentValue) {
      const checkmark = document.createElement("span");
      checkmark.className = "dropdown-checkmark";
      checkmark.textContent = "✓";
      item.appendChild(checkmark);
    }

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      select.value = opt.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomDropdowns();
    });

    popover.appendChild(item);
  });

  document.body.appendChild(popover);

  const rect = select.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();

  let top = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;

  // Prevent right overflow
  if (left + popRect.width > window.innerWidth - 12) {
    left = window.innerWidth - popRect.width - 12;
  }

  // Prevent bottom overflow
  if (top + popRect.height > window.innerHeight + window.scrollY - 12) {
    top = rect.top + window.scrollY - popRect.height - 4;
  }

  popover.style.top = `${Math.max(12, top)}px`;
  popover.style.left = `${Math.max(12, left)}px`;

  activeDropdownSelect = select;
  activeDropdownPopover = popover;
}
