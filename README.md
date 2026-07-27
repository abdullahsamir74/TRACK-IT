# Track It

> A desktop time-tracking and productivity suite built natively for Linux (GNOME). Integrates with GNOME Calendar via Evolution Data Server to automatically bring your scheduled events into your daily workflow.

---

## Overview

**Track It** combines task scheduling, focus timing, project management, and habit tracking into a unified desktop application. All tracking data remains 100% private and stored locally on your machine.

---

## Features

### Custom Calendar & Time Pickers

- **Dark Glassmorphic UI**: Custom popover controls with blurred backdrops and smooth animations.
- **Current Time Default**: Task start times automatically default to your current local time.
- **Interactive Controls**: Month navigation, single-click `Today` shortcut, digital clock display, 12-hour/minute grid selectors, presets (`Now`, `+15m`, `+30m`, `+1h`), and minute steppers.

### Global Keyboard Shortcuts

Control your workspace effortlessly without leaving your keyboard:

| Shortcut                                                       | Command          | Function                                                                    |
| :------------------------------------------------------------- | :--------------- | :-------------------------------------------------------------------------- |
| <kbd>Ctrl</kbd> + <kbd>N</kbd> / <kbd>Cmd</kbd> + <kbd>N</kbd> | Quick Add Task   | Open task creation modal from anywhere                                      |
| <kbd>Spacebar</kbd>                                            | Toggle Timer     | Start, pause, or resume the active focus timer                              |
| <kbd>Ctrl</kbd> + <kbd>1</kbd> .. <kbd>6</kbd>                 | Switch Views     | Jump directly to Dashboard, Schedule, Timer, Analytics, Projects, or Habits |
| <kbd>Esc</kbd>                                                 | Dismiss Overlays | Close active date/time pickers or modal windows                             |

### Core Functionality

- **Theme Customization**: Instant toggle between dark and light themes from the titlebar.
- **Dashboard Overview**: Daily schedule summary, active timer status, tracked minutes, and productivity stats at a glance.
- **Schedule & Drag-and-Drop**: Sort tasks by start date, priority level, or custom manual drag-and-drop reordering.
- **Timer & Pomodoro Focus Mode**: Dual mode timer supporting traditional Stopwatch tracking and Pomodoro Interval mode (`25m/5m`, `50m/10m`, `15m/3m`) with phase status badges (Focus, Short Break, Long Break), depleting countdown ring animations, completion chime alerts, and fullscreen focus mode.
- **Analytics & Heatmap**: Weekly distribution charts, project breakdowns, and yearly activity heatmaps.
- **Projects Board**: Organize tasks into color-coded project categories with custom weekly target hours.
- **Habits Tracker**: Monitor daily habits on a monthly grid with streak metrics and success rates.

---

## Privacy & Local Architecture

- **100% Local Data**: No cloud synchronization, remote API dependencies, or telemetry tracking.
- **Real-Time Calendar Sync**: Syncs with GNOME Calendar via Evolution Data Server (`eds-service`).
- **Crash Recovery**: Active timer sessions automatically save if the application closes unexpectedly.

---

## Getting Started

### Prerequisites

- **Node.js** `>= v24.18.0`
- **npm** `>= v11.16.0`
- **GNOME Desktop Environment** with Evolution Data Server.

### Installation

```bash
# Clone repository
git clone https://github.com/abdullahsamir74/TRACK-IT.git

# Navigate into directory
cd TRACK-IT

# Install dependencies
npm install
```

### Running the Application

```bash
# Run desktop application
npm start

# Run in development mode (with DevTools)
npm run dev
```

---

## Desktop Integration (GNOME Dock)

1. Register the application desktop entry:
   ```bash
   npm run install-desktop
   ```
2. Open **Activities** (press <kbd>Super</kbd>), search for **TRACK IT**, right-click the icon, and select **Add to Favorites**.

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
