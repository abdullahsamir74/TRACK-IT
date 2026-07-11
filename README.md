# Progress Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-blue.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-linux-lightgrey.svg)](https://www.gnome.org/)

Progress Tracker is a production-grade, context-isolated desktop time-tracking and productivity dashboard built on Electron, engineered specifically for Linux environments running the GNOME Desktop. It establishes a secure, non-destructive bridge to the system's Evolution Data Server (EDS), allowing users to sync their local calendar schedule, prioritize tasks via a custom pointer-event-based drag-and-drop mechanism, monitor session durations with a precision timer, and evaluate trends via localized analytics.

---

## 🚀 Key Capabilities

*   **Native GNOME Calendar Sync**: Watches local Evolution Data Server calendar stores (read-only) via `fs.watch` and live-reloads events when changed inside the system calendar app.
*   **Custom Drag-and-Drop Engine**: A custom pointer-event-based sorting algorithm built specifically to bypass layout constraints in Chromium WebViews. Allows smooth card-wide vertical reordering with instant database persistence.
*   **Kanban Projects & Accordion Swimlanes**: A custom projects manager that organizes tasks into vertical collapsible accordion cards. Users can assign tasks to projects by dragging and dropping them, and reorder the display sequence of projects using dedicated drag handles (⠿) with instant persistence.
*   **Active Session Manager**: Toggles play/pause state for tasks directly from dashboards. Features auto-save logic that halts active timers and logs task progress if the user switches tasks.
*   **Exit Protection (Auto-Save)**: Intercepts application window close events to automatically stop running timers and save active sessions to the local database, ensuring zero progress loss.
*   **Localized Storage & Security**: Leverages a secure preload context bridge to isolate main process I/O. Custom metadata, time estimates, and session histories are stored in a localized config database (`electron-store`).
*   **Data Visualization**: Weekly and monthly analytical breakdowns utilizing responsive Chart.js components.
*   **Dynamic Desktop Shortcut Installer**: Programmatically registers launcher integrations (`.desktop` shortcuts) mapping node runtime binaries and icons to the active user's environment.

---



## 🛠️ Technical Specifications

### Core Engine
*   **Runtime Shell**: Electron (Secure Sandbox with `contextIsolation` enabled)
*   **Interface**: Semantic HTML5, CSS Custom Properties, Dark Glassmorphic Design System (`backdrop-filter`)
*   **Charts Engine**: Chart.js
*   **Data Serialization**: `node-ical`
*   **Offline Database**: Localized user settings store (`electron-store`)

### Security IPC Protocol
To guarantee application security, the main process exposes a restricted set of APIs to the renderer process through a preload context bridge (`window.tracker`):
*   **Window Management**: `minimize()`, `maximize()`, `close()`
*   **Calendar Sync**: `getCalendarEvents()`, `getCalendars()`, `onCalendarUpdated(callback)`
*   **Task Management**: `getTasks()`, `saveTask(task)`, `deleteTask(taskId)`, `setEstimate(taskId, minutes)`, `markTaskComplete(taskId)`, `markTaskIncomplete(taskId)`
*   **Session Tracking & Analytics**: `getSessions(taskId)`, `getAllSessions()`, `getAnalytics(range)`
*   **Precision Timer**: `startTimer(taskId, taskName, estimateMinutes)`, `pauseTimer()`, `resumeTimer()`, `stopTimer()`, `getTimerState()`, `onTimerTick(callback)`
*   **Project Workspace**: `getProjects()`, `saveProject(project)`, `deleteProject(projectId)`, `assignTaskToProject(taskId, projectId)`, `saveProjectOrder(orderedIds)`, `getProjectOrder()`
*   **Reset & Ordering Controls**: `resetAll()`, `resetTrackingData()`, `resetProjects()`, `saveTaskOrder(orderedIds)`, `getTaskOrder()`

---

## 📥 Installation & Setup

### Prerequisites
*   Node.js >= v18.0.0
*   npm >= v9.0.0
*   Evolution Data Server (typically pre-installed on GNOME distributions)

### Installation Steps

1. **Clone the repository**:
    ```bash
    git clone https://github.com/abdullahsamir74/progress-tracker.git
    cd progress-tracker
    ```

2. **Install dependencies with script execution allowed** (required to run Electron's post-installation setup script):
    ```bash
    npm install --allow-scripts
    ```

---

## 🖥️ Running the Application

*   **Production Execution**:
    ```bash
    npm start
    ```
*   **Developer Sandbox** (starts the app with Chromium DevTools automatically launched):
    ```bash
    npm run dev
    ```

---

## 🏷️ GNOME Desktop Launcher Integration

To ensure the application is easily launchable and pinnable to the GNOME dock for anyone cloning the repository, a dynamic desktop shortcut installer is included:

  1. **Run the desktop installer script**:
    ```bash
    npm run install-desktop
    ```
    This script programmatically retrieves the active user's Node execution binary, resolves all absolute file paths to the local repository structure, generates a valid `progress-tracker.desktop` entry under `~/.local/share/applications/`, and registers the icon.

  2. **Pin to Favorites**:
    *   Press the **Super** key to open GNOME Activities.
    *   Search for **"Progress Tracker"** (you will see the custom gradient timer icon).
    *   Right-click the icon and select **Add to Favorites** (or **Pin to Dash**).

---

## 📁 Project Directory Structure

```
tracker/
├── package.json          # Package manifest & configuration scripts
├── README.md             # Project documentation
├── .gitignore            # Version control exclusions
├── scripts/
│   └── install-desktop.js # Dynamic GNOME shortcut entry generator
└── src/
    ├── main.js           # Electron main process entry point
    ├── preload.js        # IPC context-isolated security bridge
    ├── services/
    │   ├── calendar-service.js  # Linux filesystem / Evolution Data Server reader
    │   ├── tracking-service.js  # Store transaction & analytical calculations
    │   └── timer-service.js     # High-precision timer interval manager
    └── renderer/
        ├── index.html    # Single Page Application structure
        ├── styles.css    # Main stylesheet importing modular styles
        ├── app.js        # Core controller layer binding events & UI view renderers
        ├── state.js      # Global state and active task/timer trackers
        ├── utils.js      # Helper utilities (date formatting, durations, IPC wrappers)
        ├── icon.png      # Application shortcut icon
        ├── components/   # Modular, interactive UI components
        │   ├── confirm-dialog.js
        │   ├── drag-drop.js
        │   ├── modals.js
        │   └── task-item.js
        ├── views/        # View-specific rendering modules
        │   ├── analytics.js
        │   ├── dashboard.js
        │   ├── projects.js
        │   ├── schedule.js
        │   └── timer.js
        └── styles/       # Modular styling definitions (base, layout, themes, etc.)
            ├── base.css
            ├── layout.css
            ├── glass.css
            ├── buttons.css
            ├── modals.css
            ├── task-item.css
            └── ... (view-specific CSS files)
```

---

## 🔍 Troubleshooting

### Calendar Events Not Syncing
The service resolves calendar configurations from Evolution directories by default. If events fail to display:
*   Ensure calendar files (`.ics`) exist at `~/.local/share/evolution/calendar/`.
*   Ensure calendars are active in Evolution or GNOME Calendar settings.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
