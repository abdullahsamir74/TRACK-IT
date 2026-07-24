const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron");
const path = require("path");
const CalendarService = require("./services/calendar-service");
const TrackingService = require("./services/tracking-service");
const TimerService = require("./services/timer-service");
const TrackerFacade = require("./services/tracker-facade");
const ServiceManager = require("./services/service-manager");

let mainWindow = null;
let trackingService = null;
let timerService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0e1a",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "renderer", "icon.png"),
  });

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

  // Open DevTools in dev mode
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const calendarService = new CalendarService();
    trackingService = new TrackingService();
    timerService = new TimerService();

    const trackerFacade = new TrackerFacade(
      trackingService,
      timerService,
      calendarService,
    );
    const serviceManager = new ServiceManager();

    serviceManager.register("tracker", trackerFacade);
    serviceManager.register("timer", timerService);

    serviceManager.onEvent((serviceName, eventName, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`${serviceName}-${eventName}`, data);
      }
    });

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
      if (session && trackingService) {
        trackingService.saveSession(session);
      }
    } catch (err) {
      console.error("Error saving running timer on shutdown:", err);
    }
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
