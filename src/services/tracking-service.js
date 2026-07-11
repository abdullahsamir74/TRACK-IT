const Store = require('electron-store').default;

class TrackingService {
  constructor() {
    this.store = new Store({
       name: 'tracking-data',
       defaults: {
         tasks: {},
         sessions: [],
         projects: {},
         projectOrder: [],
       },
     });
   }

  /**
   * Get all tasks with their metadata (estimates, status, etc.)
   */
  getTasks() {
    return this.store.get('tasks', {});
  }

  /**
   * Save or update a task
   */
  saveTask(task) {
    const tasks = this.store.get('tasks', {});
    tasks[task.id] = {
      ...tasks[task.id],
      ...task,
      updatedAt: new Date().toISOString(),
    };
    this.store.set('tasks', tasks);
    return tasks[task.id];
  }

  /**
   * Delete a task
   */
  deleteTask(taskId) {
    const tasks = this.store.get('tasks', {});
    delete tasks[taskId];
    this.store.set('tasks', tasks);
    return true;
  }

  /**
   * Set estimated time for a task
   */
  setEstimate(taskId, estimateMinutes) {
    const tasks = this.store.get('tasks', {});
    if (!tasks[taskId]) {
      tasks[taskId] = { id: taskId, createdAt: new Date().toISOString() };
    }
    tasks[taskId].estimateMinutes = estimateMinutes;
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set('tasks', tasks);
    return tasks[taskId];
  }

  /**
   * Mark task as complete
   */
  markComplete(taskId) {
    const tasks = this.store.get('tasks', {});
    if (!tasks[taskId]) {
      tasks[taskId] = { id: taskId, createdAt: new Date().toISOString() };
    }
    tasks[taskId].completed = true;
    tasks[taskId].completedAt = new Date().toISOString();
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set('tasks', tasks);
    return tasks[taskId];
  }

  /**
   * Mark task as incomplete
   */
  markIncomplete(taskId) {
    const tasks = this.store.get('tasks', {});
    if (tasks[taskId]) {
      tasks[taskId].completed = false;
      tasks[taskId].completedAt = null;
      tasks[taskId].updatedAt = new Date().toISOString();
      this.store.set('tasks', tasks);
    }
    return tasks[taskId];
  }

  /**
   * Save a completed timer session
   */
  saveSession(session) {
    const sessions = this.store.get('sessions', []);
    sessions.push({
      ...session,
      savedAt: new Date().toISOString(),
    });
    this.store.set('sessions', sessions);

    // Update task's total tracked time
    const tasks = this.store.get('tasks', {});
    if (!tasks[session.taskId]) {
      tasks[session.taskId] = {
        id: session.taskId,
        name: session.taskName,
        createdAt: new Date().toISOString(),
      };
    }
    const totalTracked = (tasks[session.taskId].totalTrackedMinutes || 0) + (session.durationMinutes || 0);
    tasks[session.taskId].totalTrackedMinutes = totalTracked;
    tasks[session.taskId].updatedAt = new Date().toISOString();
    this.store.set('tasks', tasks);

    return session;
  }

  /**
   * Get sessions for a specific task
   */
  getSessions(taskId) {
    const sessions = this.store.get('sessions', []);
    return taskId ? sessions.filter(s => s.taskId === taskId) : sessions;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return this.store.get('sessions', []);
  }

  /**
   * Get analytics data for a given range
   */
  getAnalytics(range = 'week') {
    const sessions = this.store.get('sessions', []);
    const tasks = this.store.get('tasks', {});
    const now = new Date();

    let startDate;
    if (range === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(0); // all time
    }

    const filteredSessions = sessions.filter(s => new Date(s.startTime) >= startDate);

    // Daily breakdown
    const dailyData = {};
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      dailyData[key] = { date: key, trackedMinutes: 0, estimatedMinutes: 0, sessionsCount: 0 };
    }

    for (const session of filteredSessions) {
      const key = new Date(session.startTime).toISOString().split('T')[0];
      if (dailyData[key]) {
        dailyData[key].trackedMinutes += session.durationMinutes || 0;
        dailyData[key].sessionsCount += 1;
      }
    }

    // Task stats
    const taskStats = {};
    for (const session of filteredSessions) {
      if (!taskStats[session.taskId]) {
        taskStats[session.taskId] = {
          taskId: session.taskId,
          taskName: session.taskName,
          totalMinutes: 0,
          sessionsCount: 0,
        };
      }
      taskStats[session.taskId].totalMinutes += session.durationMinutes || 0;
      taskStats[session.taskId].sessionsCount += 1;
    }

    // Completion stats
    const taskList = Object.values(tasks);
    const completedCount = taskList.filter(t => t.completed).length;
    const totalTaskCount = taskList.length;

    // Streak calculation
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    const sortedDays = Object.keys(dailyData).sort().reverse();
    for (const day of sortedDays) {
      if (dailyData[day].sessionsCount > 0) {
        streak++;
      } else if (day !== today) {
        break; // Today might not have sessions yet
      } else {
        break;
      }
    }

    // Total tracked
    const totalTrackedMinutes = filteredSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

    return {
      daily: Object.values(dailyData),
      taskStats: Object.values(taskStats).sort((a, b) => b.totalMinutes - a.totalMinutes),
      completedCount,
      totalTaskCount,
      streak,
      totalTrackedMinutes,
      totalSessions: filteredSessions.length,
    };
  }


  /**
   * Reset all tracking data (tasks, sessions)
   */
  resetAll() {
    this.store.set('tasks', {});
    this.store.set('sessions', []);
    this.store.set('taskOrder', []);
    this.store.set('projects', {});
    this.store.set('projectOrder', []);
    return true;
  }

  /**
   * Reset only tracking-related data (tasks, sessions, taskOrder)
   */
  resetTrackingData() {
    this.store.set('tasks', {});
    this.store.set('sessions', []);
    this.store.set('taskOrder', []);
    return true;
  }

  /**
   * Reset only projects and projectOrder, unassigning tasks from projects
   */
  resetProjects() {
    this.store.set('projects', {});
    this.store.set('projectOrder', []);

    // Unassign tasks belonging to any project
    const tasks = this.store.get('tasks', {});
    let updated = false;
    for (const taskId in tasks) {
      if (tasks[taskId].projectId) {
        tasks[taskId].projectId = null;
        tasks[taskId].updatedAt = new Date().toISOString();
        updated = true;
      }
    }
    if (updated) {
      this.store.set('tasks', tasks);
    }
    return true;
  }

  /**
   * Save custom task order
   */
  saveTaskOrder(orderedIds) {
    this.store.set('taskOrder', orderedIds);
    return true;
  }

  /**
   * Get custom task order
   */
  getTaskOrder() {
    return this.store.get('taskOrder', []);
  }

  /**
   * Get all custom projects
   */
  getProjects() {
    return this.store.get('projects', {});
  }

  /**
   * Save or update a project
   */
  saveProject(project) {
    const projects = this.store.get('projects', {});
    if (!project.id) {
      project.id = 'proj_' + Math.random().toString(36).substr(2, 9);
      project.createdAt = new Date().toISOString();
    }
    projects[project.id] = {
      ...projects[project.id],
      ...project,
      updatedAt: new Date().toISOString(),
    };
    this.store.set('projects', projects);
    return projects[project.id];
  }

  /**
   * Delete a project
   */
  deleteProject(projectId) {
    const projects = this.store.get('projects', {});
    delete projects[projectId];
    this.store.set('projects', projects);

    // Unassign tasks belonging to this project
    const tasks = this.store.get('tasks', {});
    let updated = false;
    for (const taskId in tasks) {
      if (tasks[taskId].projectId === projectId) {
        tasks[taskId].projectId = null;
        tasks[taskId].updatedAt = new Date().toISOString();
        updated = true;
      }
    }
    if (updated) {
      this.store.set('tasks', tasks);
    }
    return true;
  }

  /**
   * Assign a task to a project
   */
  assignTaskToProject(taskId, projectId) {
    const tasks = this.store.get('tasks', {});
    if (!tasks[taskId]) {
      tasks[taskId] = {
        id: taskId,
        createdAt: new Date().toISOString(),
      };
    }
    tasks[taskId].projectId = projectId;
    tasks[taskId].updatedAt = new Date().toISOString();
    this.store.set('tasks', tasks);
    return tasks[taskId];
  }

  /**
   * Save custom project order
   */
  saveProjectOrder(orderedIds) {
    this.store.set('projectOrder', orderedIds);
    return true;
  }

  /**
   * Get custom project order
   */
  getProjectOrder() {
    return this.store.get('projectOrder', []);
  }
}

module.exports = TrackingService;
