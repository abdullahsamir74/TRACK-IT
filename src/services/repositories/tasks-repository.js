const BaseRepository = require("./base-repository");

/** Tasks, their completion state, estimates, and manual ordering. */
class TasksRepository extends BaseRepository {
  constructor(db, settings) {
    super(db);
    this.settings = settings;
  }

  async getTasks() {
    const rows = await this
      .rows(`SELECT t.*, COALESCE(t.manual_tracked_minutes, 0) + COALESCE(te.total_tracked, 0) AS "totalTrackedMinutes"
      FROM tasks t LEFT JOIN (SELECT task_id, SUM(duration_minutes) AS total_tracked FROM time_entries WHERE task_id IS NOT NULL GROUP BY task_id) te ON t.id = te.task_id
      WHERE t.deleted_at IS NULL ORDER BY t.sort_order ASC, t.created_at DESC`);
    return Object.fromEntries(
      rows.map((r) => {
        const isManual = !r.calendar_event_id || r.id.startsWith("manual-");
        return [
          r.id,
          {
            id: r.id,
            name: r.name,
            description: r.description || "",
            notes: r.notes ?? r.description ?? "",
            projectId: r.project_id || null,
            calendarEventId: r.calendar_event_id || null,
            calendarName: r.calendar_name || (isManual ? "Manual" : null),
            calendarColor: r.calendar_color || (isManual ? "#38bdf8" : null),
            completed: r.status === "completed",
            status: r.status || "todo",
            priority: r.priority || "medium",
            estimateMinutes: r.estimate_minutes || null,
            totalTrackedMinutes:
              Math.round(Number(r.totalTrackedMinutes || 0) * 10) / 10,
            manualTrackedMinutes: r.manual_tracked_minutes || 0,
            completedAt: r.completed_at || null,
            due: r.due_date || null,
            start: r.due_date || null,
            isAllDay: Boolean(r.is_all_day),
            sortOrder: r.sort_order || 0,
            isManual,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
        ];
      }),
    );
  }

  async saveTask(task) {
    const now = new Date().toISOString(),
      id =
        task.id ||
        `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const old = await this.one("SELECT * FROM tasks WHERE id = $1", [id]);
    const value = (key, dbKey, fallback = null) =>
      task[key] !== undefined ? task[key] : old ? old[dbKey] : fallback;
    let status =
      task.completed !== undefined
        ? task.completed
          ? "completed"
          : "todo"
        : value("status", "status", "todo");
    const notes =
      task.notes !== undefined
        ? task.notes
        : task.description !== undefined
          ? task.description
          : old
            ? old.notes || old.description || ""
            : "";
    let completedAt =
      task.completedAt !== undefined
        ? task.completedAt
        : old?.completed_at || null;
    if (status === "completed" && !completedAt) completedAt = now;
    if (status !== "completed") completedAt = null;
    const values = [
      id,
      value("name", "name", "Untitled Task"),
      value("description", "description", notes),
      notes,
      value("projectId", "project_id"),
      value("calendarEventId", "calendar_event_id"),
      value("calendarName", "calendar_name"),
      value("calendarColor", "calendar_color"),
      status,
      value("priority", "priority", "medium"),
      value("estimateMinutes", "estimate_minutes"),
      value("manualTrackedMinutes", "manual_tracked_minutes", 0),
      completedAt,
      task.due !== undefined
        ? task.due
        : task.start !== undefined
          ? task.start
          : old?.due_date || null,
      task.isAllDay !== undefined
        ? task.isAllDay
          ? 1
          : 0
        : old?.is_all_day || 0,
      value("sortOrder", "sort_order", 0),
      old?.created_at || task.createdAt || now,
      now,
    ];
    await this.run(
      `INSERT INTO tasks (id,name,description,notes,project_id,calendar_event_id,calendar_name,calendar_color,status,priority,estimate_minutes,manual_tracked_minutes,completed_at,due_date,is_all_day,sort_order,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,notes=EXCLUDED.notes,project_id=EXCLUDED.project_id,calendar_event_id=COALESCE(EXCLUDED.calendar_event_id,tasks.calendar_event_id),calendar_name=COALESCE(EXCLUDED.calendar_name,tasks.calendar_name),calendar_color=COALESCE(EXCLUDED.calendar_color,tasks.calendar_color),status=EXCLUDED.status,priority=EXCLUDED.priority,estimate_minutes=EXCLUDED.estimate_minutes,manual_tracked_minutes=EXCLUDED.manual_tracked_minutes,completed_at=EXCLUDED.completed_at,due_date=EXCLUDED.due_date,is_all_day=EXCLUDED.is_all_day,sort_order=EXCLUDED.sort_order,deleted_at=NULL,updated_at=EXCLUDED.updated_at`,
      values,
    );
    return (await this.getTasks())[id];
  }

  async saveTaskNotes(id, notes, name) {
    const old = await this.one("SELECT id FROM tasks WHERE id=$1", [id]);
    if (!old)
      return this.saveTask({
        id,
        notes: typeof notes === "string" ? notes : "",
        name: name || "Untitled Task",
      });
    await this.run("UPDATE tasks SET notes=$1, updated_at=$2 WHERE id=$3", [
      typeof notes === "string" ? notes : "",
      new Date().toISOString(),
      id,
    ]);
    return (await this.getTasks())[id];
  }

  async deleteTask(id) {
    const now = new Date().toISOString();
    await this.run(
      "UPDATE tasks SET deleted_at=$1, updated_at=$1 WHERE id=$2",
      [now, id],
    );
    return true;
  }

  async setEstimate(id, estimateMinutes) {
    const exists = await this.one("SELECT id FROM tasks WHERE id=$1", [id]);
    if (!exists) return this.saveTask({ id, estimateMinutes });
    const n =
      typeof estimateMinutes === "number" && estimateMinutes > 0
        ? estimateMinutes
        : null;
    await this.run(
      "UPDATE tasks SET estimate_minutes=$1,updated_at=$2 WHERE id=$3",
      [n, new Date().toISOString(), id],
    );
    return (await this.getTasks())[id];
  }

  async markTaskComplete(id) {
    const now = new Date().toISOString();
    const exists = await this.one("SELECT id FROM tasks WHERE id=$1", [id]);
    if (!exists)
      return this.saveTask({ id, completed: true, completedAt: now });
    await this.run(
      "UPDATE tasks SET status='completed',completed_at=COALESCE(completed_at,$1),updated_at=$1 WHERE id=$2",
      [now, id],
    );
    return (await this.getTasks())[id];
  }

  async markTaskIncomplete(id) {
    await this.run(
      "UPDATE tasks SET status='todo',completed_at=NULL,updated_at=$1 WHERE id=$2",
      [new Date().toISOString(), id],
    );
    return (await this.getTasks())[id];
  }

  async saveTaskOrder(ids) {
    if (!Array.isArray(ids)) return true;
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries())
        await tx.query(
          "UPDATE tasks SET sort_order=$1,updated_at=$2 WHERE id=$3",
          [i, now, id],
        );
    });
    await this.settings.setSetting("task_order", JSON.stringify(ids));
    return true;
  }

  async getTaskOrder() {
    return this.settings.jsonSetting("task_order", []);
  }

  async getTaskSortMode() {
    return this.settings.getSetting("task_sort_mode", "manual");
  }

  async saveTaskSortMode(mode) {
    await this.settings.setSetting("task_sort_mode", String(mode));
    return mode;
  }
}

module.exports = TasksRepository;
