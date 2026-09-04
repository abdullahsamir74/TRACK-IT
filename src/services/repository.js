class Repository {
  constructor(dbManager) {
    this.db = dbManager.getDb();
  }

  // ==========================================
  // TASKS
  // ==========================================

  getTasks() {
    const query = `
      SELECT 
        t.*,
        COALESCE(t.manual_tracked_minutes, 0) + COALESCE(te.total_tracked, 0) AS totalTrackedMinutes
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, SUM(duration_minutes) AS total_tracked
        FROM time_entries
        WHERE task_id IS NOT NULL
        GROUP BY task_id
      ) te ON t.id = te.task_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.sort_order ASC, t.created_at DESC
    `;

    const rows = this.db.prepare(query).all();
    const tasksMap = {};

    for (const r of rows) {
      const isManual = Boolean(!r.calendar_event_id || (r.id && r.id.startsWith("manual-")));
      tasksMap[r.id] = {
        id: r.id,
        name: r.name,
        description: r.description || "",
        notes: r.notes !== null && r.notes !== undefined ? r.notes : (r.description || ""),
        projectId: r.project_id || null,
        calendarEventId: r.calendar_event_id || null,
        calendarName: r.calendar_name || (isManual ? "Manual" : null),
        calendarColor: r.calendar_color || (isManual ? "#38bdf8" : null),
        completed: r.status === "completed",
        status: r.status || "todo",
        priority: r.priority || "medium",
        estimateMinutes: r.estimate_minutes || null,
        totalTrackedMinutes: Math.round((r.totalTrackedMinutes || 0) * 10) / 10,
        manualTrackedMinutes: r.manual_tracked_minutes || 0,
        completedAt: r.completed_at || null,
        due: r.due_date || null,
        start: r.due_date || null,
        sortOrder: r.sort_order || 0,
        isManual: isManual,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    return tasksMap;
  }

  saveTask(task) {
    const now = new Date().toISOString();
    const id =
      task.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const existing = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

    const name = task.name !== undefined ? task.name : existing ? existing.name : "Untitled Task";
    const notes = task.notes !== undefined ? task.notes : task.description !== undefined ? task.description : existing ? (existing.notes || existing.description || "") : "";
    const description = task.description !== undefined ? task.description : notes;
    const projectId = task.projectId !== undefined ? task.projectId : existing ? existing.project_id : null;
    const calendarEventId = task.calendarEventId !== undefined ? task.calendarEventId : existing ? existing.calendar_event_id : null;
    const calendarName = task.calendarName !== undefined ? task.calendarName : existing ? existing.calendar_name : null;
    const calendarColor = task.calendarColor !== undefined ? task.calendarColor : existing ? existing.calendar_color : null;
    
    let status = existing ? existing.status : "todo";
    if (task.completed !== undefined) {
      status = task.completed ? "completed" : "todo";
    } else if (task.status !== undefined) {
      status = task.status;
    }

    const priority = task.priority !== undefined ? task.priority : existing ? existing.priority : "medium";
    const estimateMinutes = task.estimateMinutes !== undefined ? task.estimateMinutes : existing ? existing.estimate_minutes : null;
    const manualTrackedMinutes = task.manualTrackedMinutes !== undefined ? task.manualTrackedMinutes : existing ? existing.manual_tracked_minutes : 0;
    
    let completedAt = existing ? existing.completed_at : null;
    if (task.completedAt !== undefined) {
      completedAt = task.completedAt;
    } else if (status === "completed" && !completedAt) {
      completedAt = now;
    } else if (status !== "completed") {
      completedAt = null;
    }

    const dueDate = task.due !== undefined ? task.due : task.start !== undefined ? task.start : existing ? existing.due_date : null;
    const sortOrder = task.sortOrder !== undefined ? task.sortOrder : existing ? existing.sort_order : 0;
    const createdAt = existing ? existing.created_at : task.createdAt || now;

    const upsertStmt = this.db.prepare(`
      INSERT INTO tasks (
        id, name, description, notes, project_id, calendar_event_id, calendar_name, calendar_color,
        status, priority, estimate_minutes, manual_tracked_minutes, completed_at, due_date,
        sort_order, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        notes = excluded.notes,
        project_id = excluded.project_id,
        calendar_event_id = COALESCE(excluded.calendar_event_id, tasks.calendar_event_id),
        calendar_name = COALESCE(excluded.calendar_name, tasks.calendar_name),
        calendar_color = COALESCE(excluded.calendar_color, tasks.calendar_color),
        status = excluded.status,
        priority = excluded.priority,
        estimate_minutes = excluded.estimate_minutes,
        manual_tracked_minutes = excluded.manual_tracked_minutes,
        completed_at = excluded.completed_at,
        due_date = excluded.due_date,
        sort_order = excluded.sort_order,
        deleted_at = NULL,
        updated_at = excluded.updated_at
    `);

    upsertStmt.run(
      id,
      name,
      description,
      notes,
      projectId,
      calendarEventId,
      calendarName,
      calendarColor,
      status,
      priority,
      estimateMinutes,
      manualTrackedMinutes,
      completedAt,
      dueDate,
      sortOrder,
      createdAt,
      now
    );

    return this.getTasks()[id];
  }

  saveTaskNotes(taskId, notes) {
    const now = new Date().toISOString();
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    const noteText = typeof notes === "string" ? notes : "";
    if (!task) {
      return this.saveTask({ id: taskId, notes: noteText });
    }
    this.db.prepare("UPDATE tasks SET notes = ?, updated_at = ? WHERE id = ?").run(noteText, now, taskId);
    return this.getTasks()[taskId];
  }

  deleteTask(taskId) {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, taskId);
    return true;
  }

  setEstimate(taskId, estimateMinutes) {
    const now = new Date().toISOString();
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) {
      return this.saveTask({ id: taskId, estimateMinutes });
    }

    const est = typeof estimateMinutes === "number" && !isNaN(estimateMinutes) && estimateMinutes > 0
      ? estimateMinutes
      : null;

    this.db.prepare("UPDATE tasks SET estimate_minutes = ?, updated_at = ? WHERE id = ?").run(est, now, taskId);
    return this.getTasks()[taskId];
  }

  markTaskComplete(taskId) {
    const now = new Date().toISOString();
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) {
      return this.saveTask({ id: taskId, completed: true, completedAt: now });
    }

    this.db.prepare(`
      UPDATE tasks 
      SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ? 
      WHERE id = ?
    `).run(now, now, taskId);

    return this.getTasks()[taskId];
  }

  markTaskIncomplete(taskId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE tasks 
      SET status = 'todo', completed_at = NULL, updated_at = ? 
      WHERE id = ?
    `).run(now, taskId);

    return this.getTasks()[taskId];
  }

  saveTaskOrder(orderedIds) {
    if (!Array.isArray(orderedIds)) return true;
    const now = new Date().toISOString();
    const updateOrder = this.db.prepare("UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?");
    
    const tx = this.db.transaction((ids) => {
      ids.forEach((id, idx) => {
        updateOrder.run(idx, now, id);
      });
    });

    tx(orderedIds);
    this.setSetting("task_order", JSON.stringify(orderedIds));
    return true;
  }

  getTaskOrder() {
    const raw = this.getSetting("task_order", "[]");
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  getTaskSortMode() {
    return this.getSetting("task_sort_mode", "manual");
  }

  saveTaskSortMode(mode) {
    this.setSetting("task_sort_mode", String(mode));
    return mode;
  }

  // ==========================================
  // TIME ENTRIES / SESSIONS (First-Class Logs)
  // ==========================================

  getAllSessions(options = {}) {
    let sql = `
      SELECT 
        te.*,
        t.name AS task_name_joined,
        p.name AS project_name_joined,
        p.color AS project_color_joined
      FROM time_entries te
      LEFT JOIN tasks t ON te.task_id = t.id
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (options.taskId) {
      sql += ` AND te.task_id = ?`;
      params.push(options.taskId);
    }
    if (options.projectId) {
      sql += ` AND te.project_id = ?`;
      params.push(options.projectId);
    }
    if (options.startDate) {
      sql += ` AND te.start_time >= ?`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      sql += ` AND te.start_time <= ?`;
      params.push(options.endDate);
    }

    sql += ` ORDER BY te.start_time DESC`;

    const rows = this.db.prepare(sql).all(...params);

    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      projectId: r.project_id,
      taskName: r.task_name || r.task_name_joined || "Untitled Task",
      projectName: r.project_name_joined || null,
      projectColor: r.project_color_joined || null,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMinutes: Math.round((r.duration_minutes || 0) * 10) / 10,
      durationMs: Math.round((r.duration_minutes || 0) * 60000),
      entryType: r.entry_type || "timer",
      notes: r.notes || "",
      savedAt: r.created_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getSessions(taskId) {
    return this.getAllSessions(taskId ? { taskId } : {});
  }

  saveSession(session) {
    const now = new Date().toISOString();
    const id =
      session.id ||
      `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const startTime = session.startTime || now;
    const durationMinutes =
      typeof session.durationMinutes === "number" && session.durationMinutes >= 0
        ? session.durationMinutes
        : session.durationMs
          ? Math.round((session.durationMs / 60000) * 10) / 10
          : 0;

    const endTime =
      session.endTime ||
      new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();

    const taskId = session.taskId || null;
    let projectId = session.projectId || null;
    let taskName = session.taskName || "Untitled Task";

    if (taskId) {
      const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      if (task) {
        if (!projectId && task.project_id) {
          projectId = task.project_id;
        }
        if (!session.taskName && task.name) {
          taskName = task.name;
        }
      } else if (session.taskName) {
        // Auto-create task record if it doesn't exist
        this.saveTask({
          id: taskId,
          name: session.taskName,
          projectId: projectId,
        });
      }
    }

    const entryType = session.entryType || (session.completionSession ? "manual" : "timer");
    const notes = session.notes || "";

    const stmt = this.db.prepare(`
      INSERT INTO time_entries (
        id, task_id, project_id, task_name, start_time, end_time, duration_minutes, entry_type, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        project_id = excluded.project_id,
        task_name = excluded.task_name,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        duration_minutes = excluded.duration_minutes,
        entry_type = excluded.entry_type,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
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
      now
    );

    // Auto-complete task if estimate is reached and not already completed
    if (taskId && session.estimateMinutes && session.estimateMinutes > 0) {
      const allTaskTime = this.db.prepare(`
        SELECT SUM(duration_minutes) as sum_mins FROM time_entries WHERE task_id = ?
      `).get(taskId);
      const total = (allTaskTime && allTaskTime.sum_mins) || 0;
      if (total >= session.estimateMinutes) {
        this.markTaskComplete(taskId);
      }
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

  /**
   * Delete a single session safely without corrupting task state.
   */
  deleteSession(identifier) {
    if (!identifier) return false;
    const stmt = this.db.prepare(`
      DELETE FROM time_entries 
      WHERE id = ? OR start_time = ? OR created_at = ?
    `);
    const result = stmt.run(identifier, identifier, identifier);
    return result.changes > 0;
  }

  /**
   * Delete auto-generated completion session(s) for a task.
   */
  deleteCompletionSession(taskId) {
    if (!taskId) return false;
    const stmt = this.db.prepare(`
      DELETE FROM time_entries 
      WHERE task_id = ? AND id LIKE 'session_comp_%'
    `);
    const result = stmt.run(taskId);
    return result.changes > 0;
  }

  // ==========================================
  // PROJECTS
  // ==========================================

  getProjects() {
    const rows = this.db.prepare(`
      SELECT * FROM projects 
      WHERE archived = 0 
      ORDER BY sort_order ASC, created_at ASC
    `).all();

    const map = {};
    for (const r of rows) {
      map[r.id] = {
        id: r.id,
        name: r.name,
        color: r.color || "#38bdf8",
        icon: r.icon || "folder",
        weeklyTargetHours: r.weekly_target_hours || 0,
        sortOrder: r.sort_order || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return map;
  }

  saveProject(project) {
    const now = new Date().toISOString();
    const id =
      project.id ||
      `proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    const existing = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

    const name = project.name !== undefined ? project.name : existing ? existing.name : "New Project";
    const color = project.color !== undefined ? project.color : existing ? existing.color : "#38bdf8";
    const icon = project.icon !== undefined ? project.icon : existing ? existing.icon : "folder";
    const weeklyTargetHours = project.weeklyTargetHours !== undefined ? parseFloat(project.weeklyTargetHours) || 0 : existing ? existing.weekly_target_hours : 0;
    const sortOrder = project.sortOrder !== undefined ? project.sortOrder : existing ? existing.sort_order : 0;

    const stmt = this.db.prepare(`
      INSERT INTO projects (
        id, name, color, icon, weekly_target_hours, sort_order, archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        icon = excluded.icon,
        weekly_target_hours = excluded.weekly_target_hours,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);

    stmt.run(id, name, color, icon, weeklyTargetHours, sortOrder, existing ? existing.created_at : now, now);
    return this.getProjects()[id];
  }

  deleteProject(projectId) {
    const now = new Date().toISOString();
    // Unassign tasks belonging to this project
    this.db.prepare("UPDATE tasks SET project_id = NULL, updated_at = ? WHERE project_id = ?").run(now, projectId);
    // Delete project
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Also remove from weekly targets if set
    const targets = this.getWeeklyTargets();
    if (targets[projectId]) {
      delete targets[projectId];
      this.setSetting("weekly_targets", JSON.stringify(targets));
    }

    return true;
  }

  assignTaskToProject(taskId, projectId) {
    const now = new Date().toISOString();
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) {
      this.saveTask({ id: taskId, projectId });
    } else {
      this.db.prepare("UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?").run(
        projectId || null,
        now,
        taskId
      );
    }
    return this.getTasks()[taskId];
  }

  saveProjectOrder(orderedIds) {
    if (!Array.isArray(orderedIds)) return true;
    const now = new Date().toISOString();
    const stmt = this.db.prepare("UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?");
    const tx = this.db.transaction((ids) => {
      ids.forEach((id, idx) => {
        stmt.run(idx, now, id);
      });
    });
    tx(orderedIds);
    this.setSetting("project_order", JSON.stringify(orderedIds));
    return true;
  }

  getProjectOrder() {
    const raw = this.getSetting("project_order", "[]");
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  // ==========================================
  // HABITS
  // ==========================================

  getHabits() {
    const habits = this.db.prepare("SELECT * FROM habits WHERE archived = 0 ORDER BY sort_order ASC, created_at ASC").all();
    const habitLogs = this.db.prepare("SELECT * FROM habit_logs").all();

    const historyMap = {};
    for (const log of habitLogs) {
      if (!historyMap[log.habit_id]) {
        historyMap[log.habit_id] = {};
      }
      const status = log.status || (log.completed ? "success" : "fail");
      historyMap[log.habit_id][log.date] = status;
    }

    const resultMap = {};
    for (const h of habits) {
      resultMap[h.id] = {
        id: h.id,
        name: h.name,
        color: h.color || "#34d399",
        frequencyTarget: h.frequency_target || 7,
        sortOrder: h.sort_order || 0,
        history: historyMap[h.id] || {},
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      };
    }
    return resultMap;
  }

  saveHabit(habit) {
    const now = new Date().toISOString();
    const id =
      habit.id ||
      `hab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    const existing = this.db.prepare("SELECT * FROM habits WHERE id = ?").get(id);

    const name = habit.name !== undefined ? habit.name : existing ? existing.name : "New Habit";
    const color = habit.color !== undefined ? habit.color : existing ? existing.color : "#34d399";
    const frequencyTarget = habit.frequencyTarget !== undefined ? parseInt(habit.frequencyTarget, 10) || 7 : existing ? existing.frequency_target : 7;
    const sortOrder = habit.sortOrder !== undefined ? habit.sortOrder : existing ? existing.sort_order : 0;

    const stmt = this.db.prepare(`
      INSERT INTO habits (id, name, color, frequency_target, sort_order, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        frequency_target = excluded.frequency_target,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);

    stmt.run(id, name, color, frequencyTarget, sortOrder, existing ? existing.created_at : now, now);

    // Save history logs if provided
    if (habit.history && typeof habit.history === "object") {
      const existingLogs = this.db.prepare("SELECT date FROM habit_logs WHERE habit_id = ?").all(id);
      const existingDates = new Set(existingLogs.map((l) => l.date));
      const incomingEntries = Object.entries(habit.history);
      const incomingKeys = new Set(incomingEntries.filter(([_, val]) => !!val && val !== "unset").map(([d]) => d));

      const insertOrUpdateLog = this.db.prepare(`
        INSERT INTO habit_logs (id, habit_id, date, completed, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(habit_id, date) DO UPDATE SET
          completed = excluded.completed,
          status = excluded.status
      `);
      const deleteLog = this.db.prepare(`
        DELETE FROM habit_logs WHERE habit_id = ? AND date = ?
      `);

      const logTx = this.db.transaction(() => {
        // Delete any existing dates that are no longer in habit.history or set to unset/falsy
        for (const oldDate of existingDates) {
          if (!incomingKeys.has(oldDate)) {
            deleteLog.run(id, oldDate);
          }
        }

        // Insert or update incoming entries
        for (const [dateStr, val] of incomingEntries) {
          if (!val || val === "unset") {
            deleteLog.run(id, dateStr);
          } else {
            const status = typeof val === "string" ? val : (val === true || val === 1 ? "success" : "fail");
            const completed = status === "success" ? 1 : 0;
            insertOrUpdateLog.run(`hl_${id}_${dateStr}`, id, dateStr, completed, status, now);
          }
        }
      });
      logTx();
    }

    return this.getHabits()[id];
  }

  deleteHabit(habitId) {
    this.db.prepare("DELETE FROM habits WHERE id = ?").run(habitId);
    return true;
  }

  // ==========================================
  // SETTINGS & TARGETS & BACKUP
  // ==========================================

  getSetting(key, defaultVal = null) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : defaultVal;
  }

  setSetting(key, value) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value), now);
    return value;
  }

  getWeeklyTargets() {
    const raw = this.getSetting("weekly_targets", "{}");
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  saveWeeklyTarget(targetKey, hours) {
    const targets = this.getWeeklyTargets();
    const val = parseFloat(hours);
    if (isNaN(val) || val <= 0) {
      delete targets[targetKey];
    } else {
      targets[targetKey] = Math.round(val * 10) / 10;
    }
    this.setSetting("weekly_targets", JSON.stringify(targets));
    return targets;
  }

  /**
   * Export all database tables to structured JSON for backup
   */
  exportDatabaseJson() {
    const projects = this.db.prepare("SELECT * FROM projects").all();
    const tasks = this.db.prepare("SELECT * FROM tasks").all();
    const timeEntries = this.db.prepare("SELECT * FROM time_entries").all();
    const habits = this.db.prepare("SELECT * FROM habits").all();
    const habitLogs = this.db.prepare("SELECT * FROM habit_logs").all();
    const settings = this.db.prepare("SELECT * FROM settings").all();

    return {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      data: {
        projects,
        tasks,
        timeEntries,
        habits,
        habitLogs,
        settings,
      },
    };
  }

  /**
   * Import structured JSON backup
   */
  importDatabaseJson(payload) {
    if (!payload || !payload.data) throw new Error("Invalid backup JSON format");
    const { projects, tasks, timeEntries, habits, habitLogs, settings } = payload.data;

    const importTx = this.db.transaction(() => {
      if (Array.isArray(projects)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO projects (id, name, color, icon, weekly_target_hours, sort_order, archived, created_at, updated_at)
          VALUES (@id, @name, @color, @icon, @weekly_target_hours, @sort_order, @archived, @created_at, @updated_at)
        `);
        projects.forEach((p) => stmt.run(p));
      }

      if (Array.isArray(tasks)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO tasks (
            id, name, description, notes, project_id, calendar_event_id, calendar_name, calendar_color,
            status, priority, estimate_minutes, manual_tracked_minutes, completed_at, due_date,
            sort_order, deleted_at, created_at, updated_at
          ) VALUES (
            @id, @name, @description, @notes, @project_id, @calendar_event_id, @calendar_name, @calendar_color,
            @status, @priority, @estimate_minutes, @manual_tracked_minutes, @completed_at, @due_date,
            @sort_order, @deleted_at, @created_at, @updated_at
          )
        `);
        tasks.forEach((t) =>
          stmt.run({
            ...t,
            notes: t.notes !== undefined && t.notes !== null ? t.notes : (t.description || ""),
          }),
        );
      }

      if (Array.isArray(timeEntries)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO time_entries (
            id, task_id, project_id, task_name, start_time, end_time, duration_minutes, entry_type, notes, created_at, updated_at
          ) VALUES (
            @id, @task_id, @project_id, @task_name, @start_time, @end_time, @duration_minutes, @entry_type, @notes, @created_at, @updated_at
          )
        `);
        timeEntries.forEach((te) => stmt.run(te));
      }

      if (Array.isArray(habits)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO habits (id, name, color, frequency_target, sort_order, archived, created_at, updated_at)
          VALUES (@id, @name, @color, @frequency_target, @sort_order, @archived, @created_at, @updated_at)
        `);
        habits.forEach((h) => stmt.run(h));
      }

      if (Array.isArray(habitLogs)) {
        const stmt = this.db.prepare(`
          INSERT INTO habit_logs (id, habit_id, date, completed, status, created_at)
          VALUES (@id, @habit_id, @date, @completed, @status, @created_at)
          ON CONFLICT(habit_id, date) DO UPDATE SET
            completed = excluded.completed,
            status = excluded.status
        `);
        habitLogs.forEach((hl) => {
          const status = hl.status || (hl.completed ? "success" : "fail");
          const completed = hl.completed !== undefined ? (hl.completed ? 1 : 0) : (status === "success" ? 1 : 0);
          stmt.run({
            id: hl.id || `hl_${hl.habit_id}_${hl.date}`,
            habit_id: hl.habit_id,
            date: hl.date,
            completed,
            status,
            created_at: hl.created_at || new Date().toISOString(),
          });
        });
      }

      if (Array.isArray(settings)) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO settings (key, value, updated_at)
          VALUES (@key, @value, @updated_at)
        `);
        settings.forEach((s) => stmt.run(s));
      }
    });

    importTx();
    return true;
  }

  /**
   * Scoped safe data reset
   */
  resetData(scope = "all") {
    const tx = this.db.transaction(() => {
      if (scope === "sessions_only" || scope === "all") {
        this.db.prepare("DELETE FROM time_entries").run();
      }
      if (scope === "tasks_only" || scope === "all") {
        this.db.prepare("DELETE FROM tasks").run();
        this.setSetting("task_order", "[]");
      }
      if (scope === "habits_only" || scope === "all") {
        this.db.prepare("DELETE FROM habits").run();
        this.db.prepare("DELETE FROM habit_logs").run();
      }
      if (scope === "projects_only" || scope === "all") {
        this.db.prepare("DELETE FROM projects").run();
        this.db.prepare("UPDATE tasks SET project_id = NULL").run();
        this.setSetting("project_order", "[]");
      }
      if (scope === "all") {
        this.db.prepare("DELETE FROM settings").run();
      }
    });

    tx();
    return true;
  }
}

module.exports = Repository;
