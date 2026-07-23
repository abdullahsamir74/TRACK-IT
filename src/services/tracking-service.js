const Store = require("electron-store").default;

function getLocalDateString(date) {
  const d =
    typeof date === "string" || typeof date === "number"
      ? new Date(date)
      : date || new Date();
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

class TrackingService {
  constructor() {
    this.store = new Store({
      name: "tracking-data",
      defaults: {
        tasks: {},
        sessions: [],
        projects: {},
        projectOrder: [],
        habits: {},
        weeklyTargets: {},
      },
    });
  }

  /**
   * Get all weekly time targets
   */
  getWeeklyTargets() {
    return this.store.get("weeklyTargets", {});
  }

  /**
   * Save or delete a weekly time target (targetKey can be "global" or a projectId)
   */
  saveWeeklyTarget(targetKey, hours) {
    const targets = this.store.get("weeklyTargets", {});
    const val = parseFloat(hours);
    if (isNaN(val) || val <= 0) {
      delete targets[targetKey];
    } else {
      targets[targetKey] = Math.round(val * 10) / 10;
    }
    this.store.set("weeklyTargets", targets);
    return targets;
  }

  /**
   * Get all tasks with their metadata (estimates, status, etc.)
   */
  getTasks() {
    const tasks = this.store.get("tasks", {});
    const activeTasks = {};
    for (const id in tasks) {
      if (!tasks[id].deleted) {
        activeTasks[id] = tasks[id];
      }
    }
    return activeTasks;
  }

  /**
   * Save or update a task
   */
  saveTask(task) {
    const tasks = this.store.get("tasks", {});
    tasks[task.id] = {
      ...tasks[task.id],
      ...task,
      updatedAt: new Date().toISOString(),
    };
    this.store.set("tasks", tasks);
    return tasks[task.id];
  }

  /**
   * Delete a task
   */
  deleteTask(taskId) {
    const tasks = this.store.get("tasks", {});
    if (tasks[taskId]) {
      tasks[taskId].deleted = true;
      tasks[taskId].updatedAt = new Date().toISOString();
    } else {
      tasks[taskId] = {
        id: taskId,
        deleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    this.store.set("tasks", tasks);

    // Also clean up taskOrder
    const taskOrder = this.store.get("taskOrder", []);
    const updatedTaskOrder = taskOrder.filter((id) => id !== taskId);
    this.store.set("taskOrder", updatedTaskOrder);

    return true;
  }

  /**
   * Set estimated time for a task
   */
  setEstimate(taskId, estimateMinutes) {
    const tasks = this.store.get("tasks", {});
    if (!tasks[taskId]) {
      tasks[taskId] = { id: taskId, createdAt: new Date().toISOString() };
    }
    tasks[taskId].estimateMinutes = estimateMinutes;
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set("tasks", tasks);
    return tasks[taskId];
  }

  /**
   * Mark task as complete
   */
  markComplete(taskId) {
    const tasks = this.store.get("tasks", {});
    if (!tasks[taskId]) {
      tasks[taskId] = { id: taskId, createdAt: new Date().toISOString() };
    }
    tasks[taskId].completed = true;
    tasks[taskId].completedAt = new Date().toISOString();
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set("tasks", tasks);
    return tasks[taskId];
  }

  /**
   * Mark task as incomplete
   */
  markIncomplete(taskId) {
    const tasks = this.store.get("tasks", {});
    if (tasks[taskId]) {
      tasks[taskId].completed = false;
      tasks[taskId].completedAt = null;
      tasks[taskId].updatedAt = new Date().toISOString();
    }

    // Remove any automatically generated completion sessions for this task
    const sessions = this.store.get("sessions", []);
    const updatedSessions = sessions.filter(
      (s) => !(s.taskId === taskId && s.completionSession),
    );
    this.store.set("sessions", updatedSessions);

    // Recalculate totalTrackedMinutes from remaining sessions
    if (tasks[taskId]) {
      const taskSessions = updatedSessions.filter((s) => s.taskId === taskId);
      tasks[taskId].totalTrackedMinutes = taskSessions.reduce(
        (sum, s) => sum + (s.durationMinutes || 0),
        0,
      );
    }
    this.store.set("tasks", tasks);

    return tasks[taskId];
  }

  /**
   * Save a completed timer session
   */
  saveSession(session) {
    const sessions = this.store.get("sessions", []);
    sessions.push({
      ...session,
      savedAt: new Date().toISOString(),
    });
    this.store.set("sessions", sessions);

    // Update task's total tracked time
    const tasks = this.store.get("tasks", {});
    if (!tasks[session.taskId]) {
      tasks[session.taskId] = {
        id: session.taskId,
        name: session.taskName,
        createdAt: new Date().toISOString(),
      };
    }
    const totalTracked =
      (tasks[session.taskId].totalTrackedMinutes || 0) +
      (session.durationMinutes || 0);
    tasks[session.taskId].totalTrackedMinutes = totalTracked;
    tasks[session.taskId].updatedAt = new Date().toISOString();
    this.store.set("tasks", tasks);

    return session;
  }

  /**
   * Get sessions for a specific task
   */
  getSessions(taskId) {
    const sessions = this.store.get("sessions", []);
    return taskId ? sessions.filter((s) => s.taskId === taskId) : sessions;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return this.store.get("sessions", []);
  }

  /**
   * Get analytics data for a given range
   */
  getAnalytics(range = "week") {
    const sessions = this.store.get("sessions", []);
    const tasks = this.store.get("tasks", {});
    const now = new Date();

    let startDate = new Date(now);
    let endDate = new Date(now);

    if (range === "week") {
      // Fixed Calendar Week: Sunday to Saturday
      const dayOfWeek = now.getDay();
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (range === "month") {
      // Fixed Calendar Month: 1st of current month to end of month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // Fixed Calendar Year: Jan 1 to Dec 31
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    const filteredSessions = sessions.filter((s) => {
      const sessionDate = new Date(s.startTime);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    // Daily breakdown for the fixed calendar period
    const dailyData = [];
    const dailyMap = {};

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = getLocalDateString(d);
      const item = {
        date: key,
        trackedMinutes: 0,
        estimatedMinutes: 0,
        sessionsCount: 0,
      };
      dailyData.push(item);
      dailyMap[key] = item;
    }

    for (const session of filteredSessions) {
      const key = getLocalDateString(session.startTime);
      if (dailyMap[key]) {
        dailyMap[key].trackedMinutes += session.durationMinutes || 0;
        dailyMap[key].sessionsCount += 1;
      }
    }

    // Task stats (grouped by taskName to consolidate sessions of tasks with identical names)
    const taskStats = {};
    for (const session of filteredSessions) {
      const name = session.taskName || "Unknown";
      if (!taskStats[name]) {
        taskStats[name] = {
          taskId: session.taskId,
          taskName: name,
          totalMinutes: 0,
          sessionsCount: 0,
        };
      }
      taskStats[name].totalMinutes += session.durationMinutes || 0;
      taskStats[name].sessionsCount += 1;
    }

    // Completion stats
    const taskList = Object.values(tasks);
    const relevantTasks = taskList.filter((t) => !t.deleted || t.completed);
    const completedCount = relevantTasks.filter((t) => t.completed).length;
    const totalTaskCount = relevantTasks.length;

    // Streak calculation (calculated from all sessions to avoid range limits)
    let streak = 0;
    const todayKey = getLocalDateString();

    // Group all sessions by date string
    const allSessions = this.store.get("sessions", []);
    const sessionsByDate = {};
    for (const s of allSessions) {
      const dateKey = getLocalDateString(s.startTime);
      if (dateKey) {
        sessionsByDate[dateKey] = (sessionsByDate[dateKey] || 0) + 1;
      }
    }

    let checkDate = new Date();
    if (sessionsByDate[todayKey] > 0) {
      // Today has sessions, start counting from today
    } else {
      // Check if yesterday has sessions
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayKey = getLocalDateString(checkDate);
      if (!(sessionsByDate[yesterdayKey] > 0)) {
        // Yesterday also had no sessions, so streak is broken
        checkDate = null;
      }
    }

    if (checkDate) {
      let maxDaysCheck = 1000;
      while (maxDaysCheck-- > 0) {
        const key = getLocalDateString(checkDate);
        if (sessionsByDate[key] > 0) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // 365-day Heatmap Data (from all sessions)
    const yearAgo = new Date(now);
    yearAgo.setDate(now.getDate() - 364);
    yearAgo.setHours(0, 0, 0, 0);

    const heatmapData = {};
    for (const s of allSessions) {
      if (!s.startTime) continue;
      const d = new Date(s.startTime);
      if (d >= yearAgo) {
        const key = getLocalDateString(d);
        if (key) {
          heatmapData[key] = (heatmapData[key] || 0) + (s.durationMinutes || 0);
        }
      }
    }

    // Current Week Minutes (start of current week: Sunday)
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);

    const weeklyProjectMinutes = {};
    let currentWeekTotalMinutes = 0;

    for (const s of allSessions) {
      if (!s.startTime) continue;
      const d = new Date(s.startTime);
      if (d >= currentWeekStart) {
        const mins = s.durationMinutes || 0;
        currentWeekTotalMinutes += mins;
        if (s.taskId) {
          const task = tasks[s.taskId];
          if (task && task.projectId) {
            weeklyProjectMinutes[task.projectId] =
              (weeklyProjectMinutes[task.projectId] || 0) + mins;
          }
        }
      }
    }

    // Total tracked
    const totalTrackedMinutes = filteredSessions.reduce(
      (sum, s) => sum + (s.durationMinutes || 0),
      0,
    );

    return {
      daily: dailyData,
      taskStats: Object.values(taskStats).sort(
        (a, b) => b.totalMinutes - a.totalMinutes,
      ),
      completedCount,
      totalTaskCount,
      streak,
      totalTrackedMinutes,
      totalSessions: filteredSessions.length,
      heatmapData,
      currentWeekTotalMinutes,
      weeklyProjectMinutes,
    };
  }

  /**
   * Reset all tracking data (tasks, sessions)
   */
  resetAll() {
    this.store.set("tasks", {});
    this.store.set("sessions", []);
    this.store.set("taskOrder", []);
    this.store.set("projects", {});
    this.store.set("projectOrder", []);
    this.store.set("habits", {});
    return true;
  }

  /**
   * Reset only tracking-related data (tasks, sessions, taskOrder)
   */
  resetTrackingData() {
    this.store.set("tasks", {});
    this.store.set("sessions", []);
    this.store.set("taskOrder", []);
    return true;
  }

  /**
   * Reset only tracked sessions/history and time processed, keeping tasks intact.
   */
  resetSessions() {
    this.store.set("sessions", []);
    const tasks = this.store.get("tasks", {});
    for (const taskId in tasks) {
      if (tasks[taskId].totalTrackedMinutes) {
        tasks[taskId].totalTrackedMinutes = 0;
      }
    }
    this.store.set("tasks", tasks);
    return true;
  }

  /**
   * Reset only projects and projectOrder, unassigning tasks from projects
   */
  resetProjects() {
    this.store.set("projects", {});
    this.store.set("projectOrder", []);

    // Unassign tasks belonging to any project
    const tasks = this.store.get("tasks", {});
    let updated = false;
    for (const taskId in tasks) {
      if (tasks[taskId].projectId) {
        tasks[taskId].projectId = null;
        tasks[taskId].updatedAt = new Date().toISOString();
        updated = true;
      }
    }
    if (updated) {
      this.store.set("tasks", tasks);
    }
    return true;
  }

  /**
   * Save custom task order
   */
  saveTaskOrder(orderedIds) {
    this.store.set("taskOrder", Array.isArray(orderedIds) ? orderedIds : []);
    return true;
  }

  /**
   * Get custom task order
   */
  getTaskOrder() {
    return this.store.get("taskOrder", []);
  }

  /**
   * Get all custom projects
   */
  getProjects() {
    return this.store.get("projects", {});
  }

  /**
   * Save or update a project
   */
  saveProject(project) {
    const projects = this.store.get("projects", {});
    if (!project.id) {
      project.id =
        "proj_" +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 7);
      project.createdAt = new Date().toISOString();
    }
    projects[project.id] = {
      ...projects[project.id],
      ...project,
      updatedAt: new Date().toISOString(),
    };
    this.store.set("projects", projects);
    return projects[project.id];
  }

  /**
   * Delete a project
   */
  deleteProject(projectId) {
    const projects = this.store.get("projects", {});
    delete projects[projectId];
    this.store.set("projects", projects);

    // Unassign tasks belonging to this project
    const tasks = this.store.get("tasks", {});
    let updated = false;
    for (const taskId in tasks) {
      if (tasks[taskId].projectId === projectId) {
        tasks[taskId].projectId = null;
        tasks[taskId].updatedAt = new Date().toISOString();
        updated = true;
      }
    }
    if (updated) {
      this.store.set("tasks", tasks);
    }
    return true;
  }

  /**
   * Assign a task to a project
   */
  assignTaskToProject(taskId, projectId) {
    const tasks = this.store.get("tasks", {});
    if (!tasks[taskId]) {
      tasks[taskId] = {
        id: taskId,
        createdAt: new Date().toISOString(),
      };
    }
    tasks[taskId].projectId = projectId || null;
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set("tasks", tasks);
    return tasks[taskId];
  }

  /**
   * Save custom project order
   */
  saveProjectOrder(orderedIds) {
    this.store.set("projectOrder", Array.isArray(orderedIds) ? orderedIds : []);
    return true;
  }

  /**
   * Get custom project order
   */
  getProjectOrder() {
    return this.store.get("projectOrder", []);
  }

  /**
   * Get all habits
   */
  getHabits() {
    return this.store.get("habits", {});
  }

  /**
   * Save or update a habit
   */
  saveHabit(habit) {
    const habits = this.store.get("habits", {});
    if (!habit.id) {
      habit.id =
        "hab_" +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 7);
      habit.createdAt = new Date().toISOString();
      habit.history = habit.history || {};
    }
    habits[habit.id] = {
      ...habits[habit.id],
      ...habit,
      updatedAt: new Date().toISOString(),
    };
    this.store.set("habits", habits);
    return habits[habit.id];
  }

  /**
   * Delete a habit
   */
  deleteHabit(habitId) {
    const habits = this.store.get("habits", {});
    delete habits[habitId];
    this.store.set("habits", habits);
    return true;
  }
}

module.exports = TrackingService;
