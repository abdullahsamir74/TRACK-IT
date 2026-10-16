/* ========================================
   PREFERENCES — single source of truth for renderer-local settings
   ========================================
   All `localStorage` access for user preferences lives here so keys,
   defaults, and validation are defined exactly once.
*/

const KEYS = {
  theme: "tracker-theme",
  soundsEnabled: "tracker-sounds-enabled",
  badgeMode: "tracker-badge-mode",
};

export const THEMES = ["dark", "light"];
export const BADGE_MODES = ["pending", "all", "none"];

const DEFAULTS = {
  theme: "dark",
  badgeMode: "pending",
};

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.error(`Failed to read preference "${key}":`, err);
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (err) {
    console.error(`Failed to write preference "${key}":`, err);
    return false;
  }
}

export function getTheme() {
  const theme = read(KEYS.theme);
  return THEMES.includes(theme) ? theme : DEFAULTS.theme;
}

export function setTheme(theme) {
  return write(KEYS.theme, THEMES.includes(theme) ? theme : DEFAULTS.theme);
}

export function getSoundsEnabled() {
  return read(KEYS.soundsEnabled) !== "false";
}

export function setSoundsEnabled(enabled) {
  return write(KEYS.soundsEnabled, enabled ? "true" : "false");
}

export function getBadgeMode() {
  const mode = read(KEYS.badgeMode);
  return BADGE_MODES.includes(mode) ? mode : DEFAULTS.badgeMode;
}

export function setBadgeMode(mode) {
  if (!BADGE_MODES.includes(mode)) {
    console.warn(`Ignoring unknown badge mode "${mode}"`);
    return false;
  }
  return write(KEYS.badgeMode, mode);
}
