/* ========================================
   CELEBRATE — Confetti & win banners
   ======================================== */

import { escapeHtml } from "./utils.js";

const CONFETTI_COLORS = [
  "#38bdf8",
  "#34d399",
  "#f43f5e",
  "#fb923c",
  "#a855f7",
  "#facc15",
];

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Celebrate a meaningful moment with a banner and a short confetti burst.
 * @param {{ title: string, message?: string, icon?: string }} options
 */
export function celebrate({ title, message = "", icon = "✨" } = {}) {
  if (!title) return;
  showBanner(title, message, icon);
  fireConfetti();
}

function showBanner(title, message, icon) {
  document
    .querySelectorAll(".celebration-banner")
    .forEach((el) => el.remove());

  const banner = document.createElement("div");
  banner.className = "celebration-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <span class="celebration-banner-icon">${escapeHtml(icon)}</span>
    <div class="celebration-banner-text">
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    </div>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("visible"));

  setTimeout(() => {
    banner.classList.remove("visible");
    setTimeout(() => banner.remove(), 400);
  }, 4500);
}

function fireConfetti(count = 110) {
  if (prefersReducedMotion()) return;

  const canvas = document.createElement("canvas");
  canvas.className = "celebration-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const originX = canvas.width / 2;
  const originY = canvas.height * 0.3;

  const particles = Array.from({ length: count }, () => ({
    x: originX + (Math.random() - 0.5) * 120,
    y: originY + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 9 - 3,
    gravity: 0.22 + Math.random() * 0.08,
    width: 5 + Math.random() * 6,
    height: 8 + Math.random() * 7,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.28,
    color:
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }));

  const startedAt = performance.now();
  const lifetime = 2400;

  function frame(now) {
    const elapsed = now - startedAt;
    const fade = Math.max(0, 1 - elapsed / lifetime);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
    }

    if (elapsed < lifetime) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(frame);
}
