const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const CalendarService = require('./services/calendar-service');
const TrackingService = require('./services/tracking-service');
const TimerService = require('./services/timer-service');

let mainWindow;
let calendarService;
let trackingService;
let timerService;

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
  // Initialize services
  calendarService = new CalendarService();
  trackingService = new TrackingService();
  timerService = new TimerService();

  // Register IPC handlers
  registerIpcHandlers();

  createWindow();

  // Watch calendar for changes
  calendarService.watchForChanges((events) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('calendar-updated', events);
    }
  });
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
  // Window controls
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.close());

  // Calendar
  ipcMain.handle('get-calendar-events', async () => {
    try {
      return await calendarService.getEvents();
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      return [];
    }
  });

  ipcMain.handle('get-calendars', async () => {
    try {
      return calendarService.getCalendars();
    } catch (err) {
      console.error('Error fetching calendars:', err);
      return [];
    }
  });

  // Task tracking
  ipcMain.handle('get-tasks', () => {
    return trackingService.getTasks();
  });

  ipcMain.handle('save-task', (event, task) => {
    return trackingService.saveTask(task);
  });

  ipcMain.handle('delete-task', (event, taskId) => {
    return trackingService.deleteTask(taskId);
  });

  ipcMain.handle('set-estimate', (event, taskId, estimateMinutes) => {
    return trackingService.setEstimate(taskId, estimateMinutes);
  });

  ipcMain.handle('get-sessions', (event, taskId) => {
    return trackingService.getSessions(taskId);
  });

  ipcMain.handle('get-all-sessions', () => {
    return trackingService.getAllSessions();
  });

  ipcMain.handle('get-analytics', (event, range) => {
    return trackingService.getAnalytics(range);
  });

  // Timer
  ipcMain.handle('start-timer', (event, taskId, taskName, estimateMinutes) => {
    // If a different task is running, stop it and save the session first
    if (timerService.isRunning()) {
      const state = timerService.getState();
      if (state.taskId !== taskId) {
        const session = timerService.stop();
        if (session) {
          trackingService.saveSession(session);
        }
      }
    }

    const onTick = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-tick', data);
      }
    };
    return timerService.start(taskId, taskName, estimateMinutes, onTick);
  });

  ipcMain.handle('pause-timer', () => {
    return timerService.pause();
  });

  ipcMain.handle('resume-timer', () => {
    const onTick = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-tick', data);
      }
    };
    return timerService.resume(onTick);
  });

  ipcMain.handle('stop-timer', () => {
    const session = timerService.stop();
    if (session) {
      trackingService.saveSession(session);
    }
    return session;
  });

  ipcMain.handle('get-timer-state', () => {
    return timerService.getState();
  });

  // Task status
  ipcMain.handle('mark-task-complete', (event, taskId) => {
    return trackingService.markComplete(taskId);
  });

  ipcMain.handle('mark-task-incomplete', (event, taskId) => {
    return trackingService.markIncomplete(taskId);
  });

  // Reset
  ipcMain.handle('reset-all', () => {
    return trackingService.resetAll();
  });

  // Task order
  ipcMain.handle('save-task-order', (event, orderedIds) => {
    return trackingService.saveTaskOrder(orderedIds);
  });

  ipcMain.handle('get-task-order', () => {
    return trackingService.getTaskOrder();
  });
}
