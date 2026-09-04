const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");

class DatabaseManager {
  constructor(dbPath = null) {
    if (!dbPath) {
      // Determine default data directory
      const baseDir =
        process.env.APPDATA ||
        (process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : path.join(os.homedir(), ".config"));
      const appDataDir = path.join(baseDir, "track-it");
      if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
      }
      this.dbPath = path.join(appDataDir, "tracker.sqlite");
    } else {
      this.dbPath = dbPath;
    }

    this.db = new Database(this.dbPath);
    this.init();
  }

  init() {
    // Enable WAL mode for high performance concurrency and Foreign Keys
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.runMigrations();
    this.migrateLegacyStoreData();
  }

  runMigrations() {
    const schema = `
      -- Projects Table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#38bdf8',
        icon TEXT DEFAULT 'folder',
        weekly_target_hours REAL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Tasks Table
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        calendar_event_id TEXT,
        calendar_name TEXT,
        calendar_color TEXT,
        status TEXT DEFAULT 'todo', -- 'todo', 'in_progress', 'completed'
        priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
        estimate_minutes INTEGER DEFAULT NULL,
        manual_tracked_minutes INTEGER DEFAULT 0,
        completed_at TEXT DEFAULT NULL,
        due_date TEXT DEFAULT NULL,
        sort_order INTEGER DEFAULT 0,
        deleted_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Time Entries / Sessions Table (First-Class Time Logs)
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        task_name TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes REAL NOT NULL,
        entry_type TEXT DEFAULT 'timer', -- 'timer', 'pomodoro', 'manual'
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Habits Table
      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#34d399',
        frequency_target INTEGER DEFAULT 7,
        sort_order INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Habit Check-off Logs Table
      CREATE TABLE IF NOT EXISTS habit_logs (
        id TEXT PRIMARY KEY,
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL, -- YYYY-MM-DD
        completed INTEGER DEFAULT 1,
        status TEXT DEFAULT 'success', -- 'success', 'fail'
        created_at TEXT NOT NULL,
        UNIQUE(habit_id, date)
      );

      -- Key-Value Settings & Preferences Table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Indexes for fast query performance
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
      CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
    `;

    this.db.exec(schema);

    // Safe migration: ensure 'notes' column exists on tasks table for existing databases
    try {
      this.db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT DEFAULT ''");
    } catch (err) {
      // Column already exists, safe to ignore
    }

    // Safe migration: ensure 'status' column exists on habit_logs table for existing databases
    try {
      this.db.exec("ALTER TABLE habit_logs ADD COLUMN status TEXT DEFAULT 'success'");
      this.db.exec("UPDATE habit_logs SET status = 'success' WHERE status IS NULL OR status = ''");
    } catch (err) {
      // Column already exists, safe to ignore
    }
  }

  /**
   * Migrate legacy electron-store JSON data if available and DB is new
   */
  migrateLegacyStoreData() {
    try {
      const taskCount = this.db.prepare("SELECT COUNT(*) as count FROM tasks").get().count;
      const sessionCount = this.db.prepare("SELECT COUNT(*) as count FROM time_entries").get().count;

      if (taskCount > 0 || sessionCount > 0) {
        return; // DB already has records
      }

      // Check default electron-store paths
      const baseDir =
        process.env.APPDATA ||
        (process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : path.join(os.homedir(), ".config"));
      const legacyStorePath = path.join(baseDir, "track-it", "tracking-data.json");

      if (!fs.existsSync(legacyStorePath)) return;

      const raw = fs.readFileSync(legacyStorePath, "utf-8");
      const data = JSON.parse(raw);
      if (!data) return;

      const now = new Date().toISOString();

      const insertProject = this.db.prepare(`
        INSERT OR IGNORE INTO projects (id, name, color, icon, weekly_target_hours, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertTask = this.db.prepare(`
        INSERT OR IGNORE INTO tasks (
          id, name, description, notes, project_id, calendar_event_id, calendar_name, calendar_color,
          status, priority, estimate_minutes, manual_tracked_minutes, completed_at, due_date,
          sort_order, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertTimeEntry = this.db.prepare(`
        INSERT OR IGNORE INTO time_entries (
          id, task_id, project_id, task_name, start_time, end_time, duration_minutes, entry_type, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertHabit = this.db.prepare(`
        INSERT OR IGNORE INTO habits (id, name, color, frequency_target, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertHabitLog = this.db.prepare(`
        INSERT OR IGNORE INTO habit_logs (id, habit_id, date, completed, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const setSetting = this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      `);

      const migrationTx = this.db.transaction(() => {
        // 1. Projects
        if (data.projects && typeof data.projects === "object") {
          let pIdx = 0;
          for (const [id, p] of Object.entries(data.projects)) {
            insertProject.run(
              id,
              p.name || "Project",
              p.color || "#38bdf8",
              p.icon || "folder",
              p.weeklyTargetHours || 0,
              pIdx++,
              p.createdAt || now,
              p.updatedAt || now
            );
          }
        }

        // 2. Tasks
        if (data.tasks && typeof data.tasks === "object") {
          let tIdx = 0;
          for (const [id, t] of Object.entries(data.tasks)) {
            const status = t.completed ? "completed" : "todo";
            insertTask.run(
              id,
              t.name || "Task",
              t.description || "",
              t.notes || t.description || "",
              t.projectId || null,
              t.calendarEventId || null,
              t.calendarName || null,
              t.calendarColor || null,
              status,
              t.priority || "medium",
              t.estimateMinutes || null,
              0,
              t.completedAt || (t.completed ? now : null),
              t.due || t.start || null,
              tIdx++,
              t.deleted ? now : null,
              t.createdAt || now,
              t.updatedAt || now
            );
          }
        }

        // 3. Sessions -> Time Entries
        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            const entryId = s.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const startTime = s.startTime || now;
            const endTime = s.endTime || new Date(new Date(startTime).getTime() + (s.durationMinutes || 0) * 60000).toISOString();
            insertTimeEntry.run(
              entryId,
              s.taskId || null,
              s.projectId || null,
              s.taskName || "Task Session",
              startTime,
              endTime,
              s.durationMinutes || 0,
              s.completionSession ? "manual" : "timer",
              s.notes || "",
              s.savedAt || now,
              s.savedAt || now
            );
          }
        }

        // 4. Habits
        if (data.habits && typeof data.habits === "object") {
          let hIdx = 0;
          for (const [id, h] of Object.entries(data.habits)) {
            insertHabit.run(
              id,
              h.name || "Habit",
              h.color || "#34d399",
              h.frequencyTarget || 7,
              hIdx++,
              h.createdAt || now,
              h.updatedAt || now
            );

            if (h.history && typeof h.history === "object") {
              for (const [dateStr, val] of Object.entries(h.history)) {
                if (val) {
                  const status = typeof val === "string" ? val : (val === true || val === 1 ? "success" : "fail");
                  const completed = status === "success" ? 1 : 0;
                  insertHabitLog.run(
                    `hl_${id}_${dateStr}`,
                    id,
                    dateStr,
                    completed,
                    status,
                    now
                  );
                }
              }
            }
          }
        }

        // 5. Weekly Targets & Sort Preferences
        if (data.weeklyTargets && typeof data.weeklyTargets === "object") {
          setSetting.run("weekly_targets", JSON.stringify(data.weeklyTargets), now);
        }
        if (data.taskSortMode) {
          setSetting.run("task_sort_mode", String(data.taskSortMode), now);
        }
      });

      migrationTx();
      console.log("Successfully migrated legacy tracking-data.json into SQLite database.");
    } catch (err) {
      console.error("Warning: Failed legacy store migration:", err);
    }
  }

  getDb() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
