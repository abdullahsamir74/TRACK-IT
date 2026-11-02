const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  dialog,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");

// Configure app name and model ID early so GNOME and Linux WMs associate the window & icon instantly
app.name = "track-it";
if (process.platform === "linux") {
  app.setAppUserModelId("track-it");
}

const DatabaseManager = require("./db/database");
const Repository = require("./services/repository");
const AnalyticsService = require("./services/analytics-service");
const CalendarService = require("./services/calendar-service");
const TimerService = require("./services/timer-service");
const TrackerFacade = require("./services/tracker-facade");
const ServiceManager = require("./services/service-manager");

let mainWindow = null;
let hudWindow = null;
let hudWindowCreating = false;
let dbManager = null;
let repository = null;
let analyticsService = null;
let calendarService = null;
let timerService = null;
let defaultAppIcon = null;
let shutdownComplete = false;
let currentHudTheme = "dark";
let currentHudExpanded = false;

const HUD_COLLAPSED = { width: 340, height: 88 };
const HUD_EXPANDED = { width: 360, height: 500 };

// Wayland compositors control window placement, so Electron reports 0,0 for
// every window. Persisting that would pin the HUD to the top-left corner on a
// later X11 session, so bounds are neither read nor written there.
const HUD_POSITION_SUPPORTED =
  process.platform !== "linux" ||
  (!process.env.WAYLAND_DISPLAY &&
    process.env.XDG_SESSION_TYPE !== "wayland");

// Calls that change persisted data — used to tell the *other* window to refresh.
const MUTATING_TRACKER_METHODS = new Set([
  "saveTask",
  "saveTaskNotes",
  "deleteTask",
  "setEstimate",
  "markTaskComplete",
  "markTaskIncomplete",
  "saveTaskOrder",
  "saveTaskSortMode",
  "saveSession",
  "deleteSession",
  "saveProject",
  "deleteProject",
  "assignTaskToProject",
  "saveProjectOrder",
  "saveHabit",
  "deleteHabit",
  "saveWeeklyTarget",
  "setSetting",
  "startTimer",
  "pauseTimer",
  "resumeTimer",
  "stopTimer",
  "importBackup",
  "resetData",
]);

// Never let an unexpected error take down the app silently — surface it in the
// terminal and keep the window usable.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection in main process:", reason);
});

// Only one instance may own the database connection and the dock badge.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

function createWindow() {
  const iconPath = path.join(__dirname, "renderer", "icon.png");
  defaultAppIcon = nativeImage.createFromPath(iconPath);
  const appIcon = defaultAppIcon;

  mainWindow = new BrowserWindow({
    title: "TRACK IT",
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0e1a",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: appIcon,
  });

  // Defense in depth: the app is a single local SPA, so nothing should ever
  // navigate away from, or open a new window outside of, the bundled renderer.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (process.platform === "linux" && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.maximize();

  mainWindow.on("maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-maximized-change", true);
    }
  });

  mainWindow.on("unmaximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-maximized-change", false);
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html")).catch((err) => {
    console.error("Failed to load renderer:", err);
    dialog.showErrorBox(
      "Failed to Load TRACK IT",
      `The application window could not be rendered.\n\nError: ${err.message}`,
    );
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return; // -3 is an aborted load, which is expected on teardown
    console.error(`Renderer failed to load (${code}): ${description}`);
  });

  nativeTheme.themeSource = "dark";

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    // The HUD must never keep the app alive after the main window is gone.
    closeHudWindows();
  });
}

// ---- Focus HUD window ----
function sendToWindow(target, channel, payload) {
  if (target && !target.isDestroyed()) {
    target.webContents.send(channel, payload);
  }
}

function notifyHudVisibility(visible) {
  sendToWindow(mainWindow, "hud-visibility-changed", Boolean(visible));
}

/** Close every HUD window, including any duplicate that slipped through. */
function closeHudWindows() {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.destroy();
  }
  hudWindow = null;

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win === mainWindow || win.isDestroyed()) continue;
    let url = "";
    try {
      url = win.webContents.getURL();
    } catch {
      continue;
    }
    if (url.endsWith("/hud.html")) {
      win.destroy();
    }
  }
}

function clampHudBounds(bounds, expanded) {
  const size = expanded ? HUD_EXPANDED : HUD_COLLAPSED;
  const width = size.width;
  const height = size.height;

  const stored = HUD_POSITION_SUPPORTED ? bounds : null;
  let x = Number.isFinite(stored?.x) ? stored.x : null;
  let y = Number.isFinite(stored?.y) ? stored.y : null;

  if (x === null || y === null) {
    const area = screen.getPrimaryDisplay().workArea;
    x = area.x + area.width - width - 24;
    y = area.y + 24;
  }

  const display = screen.getDisplayMatching({ x, y, width, height });
  const area = display.workArea;

  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
  };
}

async function readHudSettings() {
  const settings = { expanded: false, bounds: null };
  if (!repository) return settings;

  try {
    settings.expanded =
      (await repository.settings.getSetting("hud_expanded", "false")) === "true";
  } catch (err) {
    console.warn("Could not read HUD expanded state:", err);
  }

  try {
    const raw = await repository.settings.getSetting("hud_bounds", null);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        settings.bounds = parsed;
      }
    }
  } catch (err) {
    console.warn("Could not read HUD bounds:", err);
  }

  return settings;
}

async function saveHudBounds() {
  if (!HUD_POSITION_SUPPORTED) return;
  if (!repository || !hudWindow || hudWindow.isDestroyed()) return;
  try {
    await repository.settings.setSetting(
      "hud_bounds",
      JSON.stringify(hudWindow.getBounds()),
    );
  } catch (err) {
    console.warn("Could not save HUD bounds:", err);
  }
}

async function createHudWindow() {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.showInactive();
    return hudWindow;
  }
  // A rapid double-click must not create two HUD windows.
  if (hudWindowCreating) return hudWindow;
  hudWindowCreating = true;

  try {
    const settings = await readHudSettings();
    currentHudExpanded = settings.expanded;
    const bounds = clampHudBounds(settings.bounds, currentHudExpanded);

    hudWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      title: "TRACK IT — Momentum",
      webPreferences: {
        preload: path.join(__dirname, "hud-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    hudWindow.setAlwaysOnTop(true, "floating");

    if (
      process.platform !== "darwin" &&
      typeof hudWindow.setVisibleOnAllWorkspaces === "function"
    ) {
      hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    hudWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    hudWindow.webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });

    const revealHud = () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      if (!hudWindow.isVisible()) hudWindow.showInactive();
      hudWindow.webContents.send("hud-theme", currentHudTheme);
    };

    hudWindow.once("ready-to-show", revealHud);
    hudWindow.webContents.on("did-finish-load", revealHud);

    hudWindow.on("moved", () => {
      void saveHudBounds();
    });

    hudWindow.on("closed", () => {
      hudWindow = null;
    });

    await hudWindow.loadFile(path.join(__dirname, "renderer", "hud.html"));
    return hudWindow;
  } finally {
    hudWindowCreating = false;
  }
}

async function setHudExpanded(expanded) {
  currentHudExpanded = Boolean(expanded);

  if (repository) {
    try {
      await repository.settings.setSetting(
        "hud_expanded",
        currentHudExpanded ? "true" : "false",
      );
    } catch (err) {
      console.warn("Could not persist HUD expanded state:", err);
    }
  }

  if (!hudWindow || hudWindow.isDestroyed()) return;
  hudWindow.setBounds(
    clampHudBounds(hudWindow.getBounds(), currentHudExpanded),
    true,
  );
  await saveHudBounds();
}

async function toggleHud(force) {
  const isOpen = Boolean(hudWindow && !hudWindow.isDestroyed());
  const shouldOpen = typeof force === "boolean" ? force : !isOpen;

  if (shouldOpen) {
    await createHudWindow();
    if (repository) {
      try {
        await repository.settings.setSetting("hud_visible", "true");
      } catch (err) {
        console.warn("Could not persist HUD visibility:", err);
      }
    }
    notifyHudVisibility(true);
    return true;
  }

  closeHudWindows();
  if (repository) {
    try {
      await repository.settings.setSetting("hud_visible", "false");
    } catch (err) {
      console.warn("Could not persist HUD visibility:", err);
    }
  }
  notifyHudVisibility(false);
  return false;
}

app.whenReady().then(async () => {
  try {
    dbManager = await DatabaseManager.create();
    repository = new Repository(dbManager);
    analyticsService = new AnalyticsService(repository);
    calendarService = new CalendarService();
    timerService = new TimerService();

    const trackerFacade = new TrackerFacade(
      repository,
      analyticsService,
      timerService,
      calendarService,
    );
    const serviceManager = new ServiceManager();

    serviceManager.register("tracker", trackerFacade);
    serviceManager.register("timer", timerService);

    // Relay service manager events to both the app and the Focus HUD
    serviceManager.onEvent((serviceName, eventName, data) => {
      const channel = `${serviceName}-${eventName}`;
      sendToWindow(mainWindow, channel, data);
      sendToWindow(hudWindow, channel, data);
    });

    // Watch GNOME calendar changes
    calendarService.watchForChanges((events) => {
      serviceManager.notify("calendar", "updated", events);
    });

    registerIpcHandlers(serviceManager);
    createWindow();

    // Restore the HUD if it was open when the app last closed.
    try {
      const hudVisible =
        (await repository.settings.getSetting("hud_visible", "false")) ===
        "true";
      if (hudVisible) {
        await createHudWindow();
        notifyHudVisibility(true);
      }
    } catch (err) {
      console.warn("Could not restore Focus HUD:", err);
    }
  } catch (err) {
    console.error("Failed to initialize application services:", err);
    dialog.showErrorBox(
      "Failed to Initialize Database",
      `TRACK IT was unable to initialize the database connection.\n\nPlease verify your PostgreSQL server is running and DATABASE_URL is set correctly in your .env file.\n\nError: ${err.message}`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

// Focus the existing window when a second launch is attempted.
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  shutdownComplete = true;
  void shutdown().finally(() => app.quit());
});

async function shutdown() {
  if (timerService && timerService.isRunning()) {
    try {
      const session = timerService.stop();
      if (session && repository) {
        await repository.sessions.saveSession(session);
      }
    } catch (err) {
      console.error("Error saving running timer on shutdown:", err);
    }
  }
  if (calendarService) {
    calendarService.stopWatching();
  }
  if (dbManager) {
    try {
      await dbManager.close();
    } catch (err) {
      console.error("Error closing database pool on shutdown:", err);
    }
  }
}

function registerIpcHandlers(serviceManager) {
  ipcMain.on("window-minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on("window-close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle("window-is-maximized", () => {
    return mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.isMaximized()
      : false;
  });

  // ---- Focus HUD ----
  ipcMain.handle("hud-toggle", async (event, force) => toggleHud(force));
  ipcMain.handle("hud-is-open", () =>
    Boolean(hudWindow && !hudWindow.isDestroyed()),
  );
  ipcMain.handle("hud-get-state", () => ({
    expanded: currentHudExpanded,
    theme: currentHudTheme,
  }));
  ipcMain.on("hud-close", () => {
    void toggleHud(false);
  });
  ipcMain.on("hud-set-expanded", (event, expanded) => {
    void setHudExpanded(expanded);
  });
  ipcMain.on("hud-set-theme", (event, theme) => {
    currentHudTheme = theme === "light" ? "light" : "dark";
    sendToWindow(hudWindow, "hud-theme", currentHudTheme);
  });

  // Save dialog helper for export backup
  ipcMain.handle("dialog-save-file", async (event, options) => {
    if (!mainWindow) return null;
    return await dialog.showSaveDialog(mainWindow, options);
  });

  // Open dialog helper for import backup
  ipcMain.handle("dialog-open-file", async (event, options) => {
    if (!mainWindow) return null;
    return await dialog.showOpenDialog(mainWindow, options);
  });

  // Set badge count, window icon, and title
  ipcMain.handle(
    "app-set-badge",
    async (event, { count, iconDataUrl } = {}) => {
      const numCount = typeof count === "number" && !isNaN(count) ? count : 0;

      // 1. Native dock/launcher badge count (GNOME Dash to Dock, Ubuntu Dock, Unity, macOS)
      if (typeof app.setBadgeCount === "function") {
        try {
          app.setBadgeCount(numCount);
        } catch (err) {
          console.warn("setBadgeCount failed:", err);
        }
      }

      // 2. Window Icon with dynamic canvas overlay & Window Title
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          if (numCount > 0 && iconDataUrl) {
            const badgedImg = nativeImage.createFromDataURL(iconDataUrl);
            if (!badgedImg.isEmpty()) {
              mainWindow.setIcon(badgedImg);
            }
          } else if (defaultAppIcon && !defaultAppIcon.isEmpty()) {
            mainWindow.setIcon(defaultAppIcon);
          }

          const title = numCount > 0 ? `(${numCount}) TRACK IT` : "TRACK IT";
          mainWindow.setTitle(title);
        } catch (err) {
          console.warn("Error updating window icon or title:", err);
        }
      }

      return true;
    },
  );

  ipcMain.handle(
    "service-invoke",
    async (event, serviceName, methodName, ...args) => {
      try {
        const result = await serviceManager.invoke(
          serviceName,
          methodName,
          ...args,
        );

        // Tell the *other* window about data changes so the app and HUD stay
        // in sync without echoing the change back to the caller.
        if (
          serviceName === "tracker" &&
          MUTATING_TRACKER_METHODS.has(methodName)
        ) {
          const senderIsHud =
            hudWindow &&
            !hudWindow.isDestroyed() &&
            event.sender === hudWindow.webContents;
          sendToWindow(
            senderIsHud ? mainWindow : hudWindow,
            "tracker-data-changed",
            { method: methodName },
          );
        }

        return result;
      } catch (err) {
        console.error(
          `Error in IPC service call ${serviceName}.${methodName}:`,
          err,
        );
        throw err;
      }
    },
  );
}
