const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const CalendarService = require('./services/calendar-service');
const TrackingService = require('./services/tracking-service');
const TimerService = require('./services/timer-service');
const TrackerFacade = require('./services/tracker-facade');
const ServiceManager = require('./services/service-manager');

let mainWindow;
let calendarService;
let trackingService;
let timerService;
let serviceManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e1a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'renderer', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  nativeTheme.themeSource = 'dark';

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Initialize core services
  calendarService = new CalendarService();
  trackingService = new TrackingService();
  timerService = new TimerService();

  // Initialize facade & manager
  const trackerFacade = new TrackerFacade(trackingService, timerService, calendarService);
  serviceManager = new ServiceManager();
  
  // Register services
  serviceManager.register('tracker', trackerFacade);
  serviceManager.register('timer', timerService);

  // Hook up dynamic event forwarding
  serviceManager.onEvent((serviceName, eventName, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`${serviceName}-${eventName}`, data);
    }
  });

  // Watch calendar for changes
  calendarService.watchForChanges((events) => {
    serviceManager.notify('calendar', 'updated', events);
  });

  // Register IPC handlers
  registerIpcHandlers();

  createWindow();
});

app.on('window-all-closed', () => {
  // Auto-save any running timer
  if (timerService.isRunning()) {
    const session = timerService.stop();
    if (session) {
      trackingService.saveSession(session);
    }
  }
  app.quit();
});

function registerIpcHandlers() {
  // Window controls (shell/OS tasks)
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.close());

  // Unified dynamic service call router
  ipcMain.handle('service-invoke', async (event, serviceName, methodName, ...args) => {
    try {
      return await serviceManager.invoke(serviceName, methodName, ...args);
    } catch (err) {
      console.error(`Error in IPC service call: ${serviceName}.${methodName}:`, err);
      throw err;
    }
  });
}
