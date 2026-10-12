const path = require("path");
const { Pool } = require("pg");

// Load local development/desktop configuration before reading DATABASE_URL.
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const schema = `
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#38bdf8', icon TEXT DEFAULT 'folder', weekly_target_hours DOUBLE PRECISION DEFAULT 0, sort_order INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', notes TEXT DEFAULT '', project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, calendar_event_id TEXT, calendar_name TEXT, calendar_color TEXT, status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', estimate_minutes INTEGER, manual_tracked_minutes INTEGER DEFAULT 0, completed_at TEXT, due_date TEXT, is_all_day INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS time_entries (id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, task_name TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, duration_minutes DOUBLE PRECISION NOT NULL, entry_type TEXT DEFAULT 'timer', notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#34d399', frequency_target INTEGER DEFAULT 7, sort_order INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS habit_logs (id TEXT PRIMARY KEY, habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE, date TEXT NOT NULL, completed INTEGER DEFAULT 1, status TEXT DEFAULT 'success', created_at TEXT NOT NULL, UNIQUE(habit_id, date));
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
  CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
`;

/** PostgreSQL connection and schema lifecycle. DATABASE_URL is intentionally required. */
class DatabaseManager {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString)
      throw new Error(
        "DATABASE_URL is required. Example: postgresql://trackit:password@localhost:5432/trackit",
      );
    this.pool = new Pool({
      connectionString,
      ssl:
        process.env.PGSSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  static async create(connectionString) {
    const manager = new DatabaseManager(connectionString);
    await manager.init();
    return manager;
  }
  async init() {
    await this.pool.query(schema);
    await this.pool.query(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''",
    );
    await this.pool.query(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_all_day INTEGER DEFAULT 0",
    );
    await this.pool.query(
      "ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'success'",
    );
    await this.pool.query(
      "UPDATE habit_logs SET status = 'success' WHERE status IS NULL OR status = ''",
    );
  }
  async query(text, values = []) {
    return this.pool.query(text, values);
  }
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        query: (text, values = []) => client.query(text, values),
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  getDb() {
    return this;
  }
  async close() {
    await this.pool.end();
  }
}
module.exports = DatabaseManager;
