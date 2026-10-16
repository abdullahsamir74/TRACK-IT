const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  dialog,
  nativeImage,
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
let dbManager = null;
let repository = null;
let analyticsService = null;
let calendarService = null;
let timerService = null;
let defaultAppIcon = null;
let shutdownComplete = false;

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
  });
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

    // Relay service manager events to renderer
    serviceManager.onEvent((serviceName, eventName, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`${serviceName}-${eventName}`, data);
      }
    });

    // Watch GNOME calendar changes
    calendarService.watchForChanges((events) => {
      serviceManager.notify("calendar", "updated", events);
    });

    registerIpcHandlers(serviceManager);
    createWindow();
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
        return await serviceManager.invoke(serviceName, methodName, ...args);
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
