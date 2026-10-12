class Repository {
  constructor(dbManager) {
    this.db = dbManager.getDb();
  }
  async rows(sql, params = []) {
    return (await this.db.query(sql, params)).rows;
  }
  async one(sql, params = []) {
    return (await this.rows(sql, params))[0];
  }
  async run(sql, params = []) {
    return this.db.query(sql, params);
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
    await this.setSetting("task_order", JSON.stringify(ids));
    return true;
  }
  async getTaskOrder() {
    return this.jsonSetting("task_order", []);
  }
  async getTaskSortMode() {
    return this.getSetting("task_sort_mode", "manual");
  }
  async saveTaskSortMode(mode) {
    await this.setSetting("task_sort_mode", String(mode));
    return mode;
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
        await this.saveTask({ id: taskId, name: taskName, projectId });
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
        await this.markTaskComplete(taskId);
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

  async getProjects() {
    const rows = await this.rows(
      "SELECT * FROM projects WHERE archived=0 ORDER BY sort_order,created_at",
    );
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          color: r.color || "#38bdf8",
          icon: r.icon || "folder",
          weeklyTargetHours: Number(r.weekly_target_hours || 0),
          sortOrder: r.sort_order || 0,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
      ]),
    );
  }
  async saveProject(project) {
    const now = new Date().toISOString(),
      id =
        project.id ||
        `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      old = await this.one("SELECT * FROM projects WHERE id=$1", [id]),
      value = (k, db, f) =>
        project[k] !== undefined ? project[k] : old ? old[db] : f;
    await this.run(
      `INSERT INTO projects (id,name,color,icon,weekly_target_hours,sort_order,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color,icon=EXCLUDED.icon,weekly_target_hours=EXCLUDED.weekly_target_hours,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
      [
        id,
        value("name", "name", "New Project"),
        value("color", "color", "#38bdf8"),
        value("icon", "icon", "folder"),
        project.weeklyTargetHours !== undefined
          ? parseFloat(project.weeklyTargetHours) || 0
          : old?.weekly_target_hours || 0,
        value("sortOrder", "sort_order", 0),
        old?.created_at || now,
        now,
      ],
    );
    return (await this.getProjects())[id];
  }
  async deleteProject(id) {
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE tasks SET project_id=NULL,updated_at=$1 WHERE project_id=$2",
        [now, id],
      );
      await tx.query(
        "UPDATE time_entries SET project_id=NULL,updated_at=$1 WHERE project_id=$2",
        [now, id],
      );
      await tx.query("DELETE FROM projects WHERE id=$1", [id]);
    });
    const targets = await this.getWeeklyTargets();
    if (targets[id]) {
      delete targets[id];
      await this.setSetting("weekly_targets", JSON.stringify(targets));
    }
    const order = await this.getProjectOrder();
    if (Array.isArray(order) && order.includes(id)) {
      await this.saveProjectOrder(order.filter((x) => x !== id));
    }
    return true;
  }
  async assignTaskToProject(id, projectId) {
    const task = await this.one("SELECT id FROM tasks WHERE id=$1", [id]);
    if (!task) await this.saveTask({ id, projectId });
    else
      await this.run(
        "UPDATE tasks SET project_id=$1,updated_at=$2 WHERE id=$3",
        [projectId || null, new Date().toISOString(), id],
      );
    return (await this.getTasks())[id];
  }
  async saveProjectOrder(ids) {
    if (!Array.isArray(ids)) return true;
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries())
        await tx.query(
          "UPDATE projects SET sort_order=$1,updated_at=$2 WHERE id=$3",
          [i, now, id],
        );
    });
    await this.setSetting("project_order", JSON.stringify(ids));
    return true;
  }
  async getProjectOrder() {
    return this.jsonSetting("project_order", []);
  }

  async getHabits() {
    const [habits, logs] = await Promise.all([
      this.rows(
        "SELECT * FROM habits WHERE archived=0 ORDER BY sort_order,created_at",
      ),
      this.rows("SELECT * FROM habit_logs"),
    ]);
    const history = {};
    for (const l of logs)
      (history[l.habit_id] ??= {})[l.date] =
        l.status || (l.completed ? "success" : "fail");
    return Object.fromEntries(
      habits.map((h) => [
        h.id,
        {
          id: h.id,
          name: h.name,
          color: h.color || "#34d399",
          frequencyTarget: h.frequency_target || 7,
          sortOrder: h.sort_order || 0,
          history: history[h.id] || {},
          createdAt: h.created_at,
          updatedAt: h.updated_at,
        },
      ]),
    );
  }
  async saveHabit(habit) {
    const now = new Date().toISOString(),
      id =
        habit.id ||
        `hab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      old = await this.one("SELECT * FROM habits WHERE id=$1", [id]),
      val = (k, db, f) =>
        habit[k] !== undefined ? habit[k] : old ? old[db] : f;
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO habits (id,name,color,frequency_target,sort_order,archived,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,0,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,color=EXCLUDED.color,frequency_target=EXCLUDED.frequency_target,sort_order=EXCLUDED.sort_order,updated_at=EXCLUDED.updated_at`,
        [
          id,
          val("name", "name", "New Habit"),
          val("color", "color", "#34d399"),
          habit.frequencyTarget !== undefined
            ? parseInt(habit.frequencyTarget, 10) || 7
            : old?.frequency_target || 7,
          val("sortOrder", "sort_order", 0),
          old?.created_at || now,
          now,
        ],
      );
      if (habit.history && typeof habit.history === "object") {
        await tx.query("DELETE FROM habit_logs WHERE habit_id=$1", [id]);
        for (const [date, statusValue] of Object.entries(habit.history)) {
          if (!statusValue || statusValue === "unset") continue;
          const status =
            typeof statusValue === "string"
              ? statusValue
              : statusValue === true || statusValue === 1
                ? "success"
                : "fail";
          await tx.query(
            "INSERT INTO habit_logs (id,habit_id,date,completed,status,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              `hl_${id}_${date}`,
              id,
              date,
              status === "success" ? 1 : 0,
              status,
              now,
            ],
          );
        }
      }
    });
    return (await this.getHabits())[id];
  }
  async deleteHabit(id) {
    await this.run("DELETE FROM habits WHERE id=$1", [id]);
    return true;
  }

  async getSetting(key, fallback = null) {
    return (
      (await this.one("SELECT value FROM settings WHERE key=$1", [key]))
        ?.value ?? fallback
    );
  }
  async setSetting(key, value) {
    await this.run(
      "INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at",
      [key, String(value), new Date().toISOString()],
    );
    return value;
  }
  async jsonSetting(key, fallback) {
    try {
      return JSON.parse(await this.getSetting(key, JSON.stringify(fallback)));
    } catch {
      return fallback;
    }
  }
  async getWeeklyTargets() {
    return this.jsonSetting("weekly_targets", {});
  }
  async saveWeeklyTarget(key, hours) {
    const targets = await this.getWeeklyTargets(),
      n = parseFloat(hours);
    if (isNaN(n) || n <= 0) delete targets[key];
    else targets[key] = Math.round(n * 10) / 10;
    await this.setSetting("weekly_targets", JSON.stringify(targets));
    return targets;
  }
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
    if (!payload?.data) throw new Error("Invalid backup JSON format");
    const d = payload.data;
    await this.db.transaction(async (tx) => {
      const insert = async (table, cols, records, conflict) => {
        for (const r of records || []) {
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
        d.projects,
        "(id)",
      );

      const existingProjectIds = new Set(
        (await tx.query("SELECT id FROM projects")).rows.map((r) => r.id),
      );

      const sanitizedTasks = (d.tasks || []).map((x) => ({
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

      const sanitizedTimeEntries = (d.timeEntries || []).map((x) => ({
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
        d.habits,
        "(id)",
      );
      for (const h of d.habitLogs || []) {
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
        d.settings,
        "(key)",
      );
    });
    return true;
  }
  async resetData(scope = "all") {
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
module.exports = Repository;
