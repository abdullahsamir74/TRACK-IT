const BaseRepository = require("./base-repository");

/** Whole-database export / import and scoped resets. */
class BackupRepository extends BaseRepository {
  async exportDatabaseJson() {
    const [projects, tasks, timeEntries, habits, habitLogs, settings] =
      await Promise.all(
        [
          "projects",
          "tasks",
          "time_entries",
          "habits",
          "habit_logs",
          "settings",
        ].map((t) => this.rows(`SELECT * FROM ${t}`)),
      );
    return {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      data: { projects, tasks, timeEntries, habits, habitLogs, settings },
    };
  }

  async importDatabaseJson(payload) {
    if (!payload?.data || typeof payload.data !== "object") {
      throw new Error("Invalid backup JSON format");
    }
    const d = payload.data;
    const asArray = (value, name) => {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) {
        throw new Error(`Invalid backup: "${name}" must be an array`);
      }
      return value;
    };
    const projects = asArray(d.projects, "projects");
    const tasks = asArray(d.tasks, "tasks");
    const timeEntries = asArray(d.timeEntries, "timeEntries");
    const habits = asArray(d.habits, "habits");
    const habitLogs = asArray(d.habitLogs, "habitLogs");
    const settings = asArray(d.settings, "settings");
    await this.db.transaction(async (tx) => {
      const insert = async (table, cols, records, conflict) => {
        for (const r of records || []) {
          if (typeof r !== "object" || r === null) {
            throw new Error(`Invalid backup: "${table}" contains a non-object record`);
          }
          const values = cols.map((c) => r[c] ?? null);
          await tx.query(
            `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT ${conflict} DO UPDATE SET ${cols
              .filter((c) => !["id", "key"].includes(c))
              .map((c) => c + "=EXCLUDED." + c)
              .join(",")}`,
            values,
          );
        }
      };
      await insert(
        "projects",
        [
          "id",
          "name",
          "color",
          "icon",
          "weekly_target_hours",
          "sort_order",
          "archived",
          "created_at",
          "updated_at",
        ],
        projects,
        "(id)",
      );

      const existingProjectIds = new Set(
        (await tx.query("SELECT id FROM projects")).rows.map((r) => r.id),
      );

      const sanitizedTasks = tasks.map((x) => ({
        ...x,
        notes: x.notes ?? x.description ?? "",
        project_id:
          x.project_id && existingProjectIds.has(x.project_id)
            ? x.project_id
            : null,
      }));

      await insert(
        "tasks",
        [
          "id",
          "name",
          "description",
          "notes",
          "project_id",
          "calendar_event_id",
          "calendar_name",
          "calendar_color",
          "status",
          "priority",
          "estimate_minutes",
          "manual_tracked_minutes",
          "completed_at",
          "due_date",
          "is_all_day",
          "sort_order",
          "deleted_at",
          "created_at",
          "updated_at",
        ],
        sanitizedTasks,
        "(id)",
      );

      const existingTaskIds = new Set(
        (await tx.query("SELECT id FROM tasks")).rows.map((r) => r.id),
      );

      const sanitizedTimeEntries = timeEntries.map((x) => ({
        ...x,
        task_id:
          x.task_id && existingTaskIds.has(x.task_id) ? x.task_id : null,
        project_id:
          x.project_id && existingProjectIds.has(x.project_id)
            ? x.project_id
            : null,
      }));

      await insert(
        "time_entries",
        [
          "id",
          "task_id",
          "project_id",
          "task_name",
          "start_time",
          "end_time",
          "duration_minutes",
          "entry_type",
          "notes",
          "created_at",
          "updated_at",
        ],
        sanitizedTimeEntries,
        "(id)",
      );
      await insert(
        "habits",
        [
          "id",
          "name",
          "color",
          "frequency_target",
          "sort_order",
          "archived",
          "created_at",
          "updated_at",
        ],
        habits,
        "(id)",
      );
      for (const h of habitLogs) {
        const status = h.status || (h.completed ? "success" : "fail");
        await tx.query(
          "INSERT INTO habit_logs (id,habit_id,date,completed,status,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(habit_id,date) DO UPDATE SET completed=EXCLUDED.completed,status=EXCLUDED.status",
          [
            h.id || `hl_${h.habit_id}_${h.date}`,
            h.habit_id,
            h.date,
            h.completed ?? (status === "success" ? 1 : 0),
            status,
            h.created_at || new Date().toISOString(),
          ],
        );
      }
      await insert(
        "settings",
        ["key", "value", "updated_at"],
        settings,
        "(key)",
      );
    });
    return true;
  }

  async resetData(scope = "all") {
    const allowedScopes = [
      "all",
      "sessions_only",
      "tasks_only",
      "habits_only",
      "projects_only",
    ];
    if (!allowedScopes.includes(scope)) {
      throw new Error(`Unknown reset scope "${scope}"`);
    }
    await this.db.transaction(async (tx) => {
      if (scope === "sessions_only" || scope === "all")
        await tx.query("DELETE FROM time_entries");
      if (scope === "tasks_only" || scope === "all") {
        await tx.query("DELETE FROM tasks");
        await tx.query("DELETE FROM settings WHERE key='task_order'");
      }
      if (scope === "habits_only" || scope === "all")
        await tx.query("DELETE FROM habits");
      if (scope === "projects_only" || scope === "all") {
        await tx.query("DELETE FROM projects");
        await tx.query("UPDATE tasks SET project_id=NULL");
        await tx.query("DELETE FROM settings WHERE key='project_order'");
      }
      if (scope === "all") await tx.query("DELETE FROM settings");
    });
    return true;
  }
}

module.exports = BackupRepository;
