# Track It

Track It is a premium desktop time-tracking and productivity suite built natively for Linux (GNOME). It integrates with GNOME Calendar via Evolution Data Server so your schedule events automatically appear as trackable tasks. All tracking data is kept locally and privately on your machine.

---

## Features

### Theme Customization
Toggle between dark and light themes instantly from the titlebar to match your workspace lighting.

### Dashboard Overview
Check today's schedule, total tracked time, session counts, and daily progress stats at a glance.

### Schedule and Sorting
Organize all your GNOME Calendar events and manually created tasks. You can sort tasks by start time, priority levels, or manually drag and drop them to fit your day.

### Timer and Focus Mode
Start tracking any task with an active timer, including a fullscreen focus mode to help you work without distractions.

### Analytics and Heatmap
View weekly charts and a yearly activity heatmap to visualize your productivity patterns and keep track of your weekly targets.

### Projects Board
Group tasks under different projects to keep your workspace organized, with a dedicated section for unassigned tasks.

### Habits Tracker
Track your daily habits on a monthly calendar grid. Includes a stats section to monitor streaks, success rates, and overall progress.

---

## Privacy and Architecture

- **Local Storage**: All data is stored locally. There are no remote servers, no cloud sync, and no tracking telemetry.
- **Calendar Integration**: Syncs in real-time with GNOME Calendar.
- **Crash Protection**: Active timer sessions are saved automatically if the application closes unexpectedly.

---

## Getting Started

### Prerequisites

* **Node.js** >= v24.18.0
* **npm** >= v11.16.0
* **GNOME Desktop** with Evolution Data Server (`eds-service` pre-installed on Ubuntu, Fedora, Debian, Pop!_OS, Arch, and most GNOME distributions).

### Installation

```bash
git clone https://github.com/abdullahsamir74/TRACK-IT.git
cd TRACK-IT
npm install
```

### Running the App

```bash
# Start standard desktop mode
npm start

# Start development mode
npm run dev
```

---

## GNOME Dock Shortcut

1. Install the GNOME desktop launcher:
   ```bash
   npm run install-desktop
   ```
2. Press **Super**, search for **"TRACK IT"**, right-click the icon, and select **Add to Favorites** or **Pin to Dash**.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.
