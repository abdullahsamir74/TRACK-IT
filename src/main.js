const { app, BrowserWindow, ipcMain, nativeTheme, dialog, nativeImage } = require("electron");
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

function createWindow() {
  const iconPath = path.join(__dirname, "renderer", "icon.png");
  const appIcon = nativeImage.createFromPath(iconPath);

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
    },
    icon: appIcon,
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

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

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
    dbManager = new DatabaseManager();
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
  }
});

app.on("window-all-closed", () => {
  if (timerService && timerService.isRunning()) {
    try {
      const session = timerService.stop();
      if (session && repository) {
        repository.saveSession(session);
      }
    } catch (err) {
      console.error("Error saving running timer on shutdown:", err);
    }
  }
  if (calendarService) {
    calendarService.stopWatching();
  }
  if (dbManager) {
    dbManager.close();
  }
  app.quit();
});

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
