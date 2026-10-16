const BaseRepository = require("./base-repository");

/** Logged time entries / focus sessions. */
class SessionsRepository extends BaseRepository {
  constructor(db, tasks) {
    super(db);
    this.tasks = tasks;
  }

  async getAllSessions(options = {}) {
    const clauses = [],
      values = [];
    const add = (sql, value) => {
      values.push(value);
      clauses.push(sql.replace("?", "$" + values.length));
    };
    if (options.taskId) add("te.task_id = ?", options.taskId);
    if (options.projectId)
      add("COALESCE(te.project_id, t.project_id) = ?", options.projectId);
    if (options.startDate) add("te.start_time >= ?", options.startDate);
    if (options.endDate) add("te.start_time <= ?", options.endDate);
    const rows = await this.rows(
      `SELECT te.*,
              COALESCE(te.project_id, t.project_id) AS effective_project_id,
              t.name AS task_name_joined,
              p.name AS project_name_joined,
              p.color AS project_color_joined
       FROM time_entries te
       LEFT JOIN tasks t ON te.task_id = t.id
       LEFT JOIN projects p ON COALESCE(te.project_id, t.project_id) = p.id
       ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""}
       ORDER BY te.start_time DESC`,
      values,
    );
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      projectId: r.effective_project_id || r.project_id || null,
      taskName: r.task_name || r.task_name_joined || "Untitled Task",
      projectName: r.project_name_joined || null,
      projectColor: r.project_color_joined || null,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMinutes: Math.round(Number(r.duration_minutes || 0) * 10) / 10,
      durationMs: Math.round(Number(r.duration_minutes || 0) * 60000),
      entryType: r.entry_type || "timer",
      notes: r.notes || "",
      savedAt: r.created_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getSessions(id) {
    return this.getAllSessions(id ? { taskId: id } : {});
  }

  async saveSession(session) {
    const now = new Date().toISOString(),
      id =
        session.id ||
        `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      startTime = session.startTime || now,
      durationMinutes =
        typeof session.durationMinutes === "number" &&
        session.durationMinutes >= 0
          ? session.durationMinutes
          : session.durationMs
            ? Math.round((session.durationMs / 60000) * 10) / 10
            : 0,
      endTime =
        session.endTime ||
        new Date(
          new Date(startTime).getTime() + durationMinutes * 60000,
        ).toISOString();
    const taskId = session.taskId || null;
    let projectId = session.projectId || null,
      taskName = session.taskName || "Untitled Task";
    if (taskId) {
      const task = await this.one("SELECT * FROM tasks WHERE id=$1", [taskId]);
      if (task) {
        projectId ||= task.project_id;
        if (!session.taskName) taskName = task.name;
      } else {
        await this.tasks.saveTask({ id: taskId, name: taskName, projectId });
      }
    }
    const entryType =
        session.entryType || (session.completionSession ? "manual" : "timer"),
      notes = session.notes || "";
    await this.run(
      `INSERT INTO time_entries (id,task_id,project_id,task_name,start_time,end_time,duration_minutes,entry_type,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET task_id=EXCLUDED.task_id,project_id=EXCLUDED.project_id,task_name=EXCLUDED.task_name,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,duration_minutes=EXCLUDED.duration_minutes,entry_type=EXCLUDED.entry_type,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at`,
      [
        id,
        taskId,
        projectId,
        taskName,
        startTime,
        endTime,
        durationMinutes,
        entryType,
        notes,
        session.createdAt || now,
        now,
      ],
    );
    if (taskId && session.estimateMinutes > 0) {
      const total = await this.one(
        "SELECT COALESCE(SUM(duration_minutes),0) total FROM time_entries WHERE task_id=$1",
        [taskId],
      );
      if (Number(total.total) >= session.estimateMinutes)
        await this.tasks.markTaskComplete(taskId);
    }
    return {
      id,
      taskId,
      projectId,
      taskName,
      startTime,
      endTime,
      durationMinutes,
      entryType,
      notes,
      savedAt: now,
    };
  }

  async deleteSession(id) {
    if (!id) return false;
    return (
      (
        await this.run(
          "DELETE FROM time_entries WHERE id=$1 OR start_time=$1 OR created_at=$1",
          [id],
        )
      ).rowCount > 0
    );
  }

  async deleteCompletionSession(id) {
    if (!id) return false;
    return (
      (
        await this.run(
          "DELETE FROM time_entries WHERE task_id=$1 AND id LIKE 'session_comp_%'",
          [id],
        )
      ).rowCount > 0
    );
  }
}

module.exports = SessionsRepository;
