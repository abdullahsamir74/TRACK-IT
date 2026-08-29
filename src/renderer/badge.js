/* ========================================
   BADGE — Real-Time Today's Task Counter & Icon Badge Engine
   ======================================== */

import { getLocalDateString, getCombinedEvents } from "./utils.js";
import { calendarEvents, trackedTasks } from "./state.js";

let baseIconImage = null;
let baseIconLoaded = false;
let isRendering = false;
let lastRenderedCount = -1;
let lastRenderedMode = "";

/**
 * Preload the base application icon for canvas overlay badging.
 */
function preloadBaseIcon() {
  if (baseIconLoaded) return Promise.resolve(baseIconImage);

  return new Promise((resolve) => {
    baseIconImage = new Image();
    baseIconImage.onload = () => {
      baseIconLoaded = true;
      resolve(baseIconImage);
    };
    baseIconImage.onerror = () => {
      console.warn("Could not load base icon for badging.");
      resolve(null);
    };
    baseIconImage.src = "icon.png";
  });
}

/**
 * Render a dynamic badged icon onto an offscreen canvas.
 * @param {number} count
 * @returns {string|null} Data URL of the badged PNG icon
 */
async function generateBadgedIcon(count) {
  if (count <= 0) return null;

  try {
    const img = await preloadBaseIcon();
    const canvasSize = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw base application icon if available
    if (img && baseIconLoaded) {
      ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
    }

    // Badge configuration
    const countText = count > 99 ? "99+" : String(count);
    const isMultiDigit = countText.length > 1;

    // Position in top-right corner
    const badgeHeight = 190;
    const badgeWidth = isMultiDigit ? Math.max(190, 110 + countText.length * 60) : 190;
    const badgeRadius = badgeHeight / 2;
    const badgeCenterX = canvasSize - badgeWidth / 2 - 16;
    const badgeCenterY = badgeRadius + 16;

    const left = badgeCenterX - badgeWidth / 2;
    const top = badgeCenterY - badgeHeight / 2;

    // Outer protective dark ring/stroke
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left - 12, top - 12, badgeWidth + 24, badgeHeight + 24, badgeRadius + 12);
    ctx.fillStyle = "rgba(10, 14, 26, 0.96)";
    ctx.fill();
    ctx.restore();

    // Badge glowing body
    ctx.save();
    ctx.shadowColor = "rgba(244, 63, 94, 0.65)";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(left, top, badgeWidth, badgeHeight, badgeRadius);

    const grad = ctx.createLinearGradient(left, top, left + badgeWidth, top + badgeHeight);
    grad.addColorStop(0, "#fb7185"); // Rose 400
    grad.addColorStop(0.5, "#f43f5e"); // Rose 500
    grad.addColorStop(1, "#e11d48"); // Rose 600
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle inner highlight ring
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.stroke();
    ctx.restore();

    // Badge text
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${isMultiDigit ? (countText.length > 2 ? "90px" : "105px") : "120px"} "Inter", "Outfit", system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 8;
    ctx.fillText(countText, badgeCenterX, badgeCenterY + 4);
    ctx.restore();

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("Error generating badged icon:", err);
    return null;
  }
}

/**
 * Calculate the number of tasks for today according to user preference.
 * @param {Array} events
 * @param {Object} tasks
 * @param {string} mode "pending" | "all" | "none"
 * @returns {number}
 */
export function calculateTodayTaskCount(events = calendarEvents, tasks = trackedTasks, mode = null) {
  const badgeMode = mode || localStorage.getItem("tracker-badge-mode") || "pending";
  if (badgeMode === "none") return 0;

  const todayStr = getLocalDateString();
  const allCombined = getCombinedEvents(events, tasks);

  const todayEvents = allCombined.filter((e) => {
    const eventDate = getLocalDateString(e.start);
    return eventDate === todayStr;
  });

  if (badgeMode === "all") {
    return todayEvents.length;
  }

  // Default: "pending" (uncompleted today's tasks)
  return todayEvents.filter((e) => {
    const t = tasks[e.id];
    return !t || (!t.completed && t.status !== "completed");
  }).length;
}

/**
 * Synchronize the badge count on the Electron application icon and native dock.
 */
export async function updateAppBadge() {
  if (isRendering) return;
  isRendering = true;

  try {
    const badgeMode = localStorage.getItem("tracker-badge-mode") || "pending";
    const count = calculateTodayTaskCount(calendarEvents, trackedTasks, badgeMode);

    // Update Electron Application Icon & Native Badge
    if (count !== lastRenderedCount || badgeMode !== lastRenderedMode) {
      lastRenderedCount = count;
      lastRenderedMode = badgeMode;

      let iconDataUrl = null;
      if (count > 0 && badgeMode !== "none") {
        iconDataUrl = await generateBadgedIcon(count);
      }

      if (window.tracker && typeof window.tracker.setBadgeCount === "function") {
        await window.tracker.setBadgeCount({ count, iconDataUrl });
      }
    }
  } catch (err) {
    console.error("Failed to update app badge:", err);
  } finally {
    isRendering = false;
  }
}

/**
 * Initialize badge engine and start periodic date change watcher.
 */
let dateCheckInterval = null;
let lastKnownDate = getLocalDateString();

export function initBadgeEngine() {
  preloadBaseIcon();

  if (dateCheckInterval) clearInterval(dateCheckInterval);

  // Periodically check if the date changed (midnight transition)
  dateCheckInterval = setInterval(() => {
    const currentDate = getLocalDateString();
    if (currentDate !== lastKnownDate) {
      lastKnownDate = currentDate;
      updateAppBadge();
    }
  }, 30000); // Check every 30 seconds
}
