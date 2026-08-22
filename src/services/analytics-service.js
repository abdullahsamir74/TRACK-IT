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

class AnalyticsService {
  constructor(repository) {
    this.repo = repository;
    this.db = repository.db;
  }

  getAnalytics(range = "week") {
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

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Query time entries in range
    const entriesQuery = `
      SELECT 
        te.*,
        t.name as task_name_joined,
        p.name as project_name_joined,
        p.color as project_color_joined
      FROM time_entries te
      LEFT JOIN tasks t ON te.task_id = t.id
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE te.start_time >= ? AND te.start_time <= ?
      ORDER BY te.start_time ASC
    `;
    const filteredEntries = this.db.prepare(entriesQuery).all(startIso, endIso);

    // Build continuous daily slots for the chart
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

    // Populate daily map
    for (const entry of filteredEntries) {
      const key = getLocalDateString(entry.start_time);
      if (dailyMap[key]) {
        dailyMap[key].trackedMinutes += Math.round((entry.duration_minutes || 0) * 10) / 10;
        dailyMap[key].sessionsCount += 1;
      }
    }

    // Task stats breakdown
    const taskStatsMap = {};
    for (const entry of filteredEntries) {
      const name = entry.task_name || entry.task_name_joined || "Unknown Task";
      if (!taskStatsMap[name]) {
        taskStatsMap[name] = {
          taskId: entry.task_id,
          taskName: name,
          totalMinutes: 0,
          sessionsCount: 0,
          projectName: entry.project_name_joined || null,
          projectColor: entry.project_color_joined || null,
        };
      }
      taskStatsMap[name].totalMinutes += entry.duration_minutes || 0;
      taskStatsMap[name].sessionsCount += 1;
    }

    const taskStats = Object.values(taskStatsMap)
      .map((t) => ({ ...t, totalMinutes: Math.round(t.totalMinutes * 10) / 10 }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Project breakdown
    const projectStatsMap = {};
    for (const entry of filteredEntries) {
      const projName = entry.project_name_joined || "Unassigned";
      const projColor = entry.project_color_joined || "#94a3b8";
      if (!projectStatsMap[projName]) {
        projectStatsMap[projName] = {
          projectName: projName,
          color: projColor,
          totalMinutes: 0,
          sessionsCount: 0,
        };
      }
      projectStatsMap[projName].totalMinutes += entry.duration_minutes || 0;
      projectStatsMap[projName].sessionsCount += 1;
    }
    const projectStats = Object.values(projectStatsMap)
      .map((p) => ({ ...p, totalMinutes: Math.round(p.totalMinutes * 10) / 10 }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Completion stats for active tasks
    const activeTasks = this.db.prepare("SELECT status FROM tasks WHERE deleted_at IS NULL").all();
    const completedCount = activeTasks.filter((t) => t.status === "completed").length;
    const totalTaskCount = activeTasks.length;

    // 365-day Activity Heatmap
    const yearAgo = new Date(now);
    yearAgo.setDate(now.getDate() - 364);
    yearAgo.setHours(0, 0, 0, 0);

    const allYearEntries = this.db.prepare(`
      SELECT start_time, duration_minutes 
      FROM time_entries 
      WHERE start_time >= ?
    `).all(yearAgo.toISOString());

    const heatmapData = {};
    for (const s of allYearEntries) {
      if (!s.start_time) continue;
      const key = getLocalDateString(s.start_time);
      if (key) {
        heatmapData[key] = (heatmapData[key] || 0) + (s.duration_minutes || 0);
      }
    }

    // Streak calculation (Consecutive active days ending today or yesterday)
    let streak = 0;
    const todayKey = getLocalDateString();
    const allDatesWithActivity = new Set(
      this.db.prepare("SELECT DISTINCT substr(start_time, 1, 10) as day FROM time_entries").all().map((r) => r.day)
    );

    let checkDate = new Date();
    if (allDatesWithActivity.has(todayKey) || (heatmapData[todayKey] || 0) > 0) {
      // Activity today!
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
      const yKey = getLocalDateString(checkDate);
      if (!allDatesWithActivity.has(yKey) && (heatmapData[yKey] || 0) <= 0) {
        checkDate = null;
      }
    }

    if (checkDate) {
      let limit = 1000;
      while (limit-- > 0) {
        const k = getLocalDateString(checkDate);
        if (allDatesWithActivity.has(k) || (heatmapData[k] || 0) > 0) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Current week progress for weekly goals
    const curWeekStart = new Date(now);
    curWeekStart.setDate(now.getDate() - now.getDay());
    curWeekStart.setHours(0, 0, 0, 0);

    const weekEntries = this.db.prepare(`
      SELECT te.duration_minutes, te.project_id, t.project_id as task_project_id
      FROM time_entries te
      LEFT JOIN tasks t ON te.task_id = t.id
      WHERE te.start_time >= ?
    `).all(curWeekStart.toISOString());

    let currentWeekTotalMinutes = 0;
    const weeklyProjectMinutes = {};

    for (const w of weekEntries) {
      const mins = w.duration_minutes || 0;
      currentWeekTotalMinutes += mins;
      const pId = w.project_id || w.task_project_id;
      if (pId) {
        weeklyProjectMinutes[pId] = (weeklyProjectMinutes[pId] || 0) + mins;
      }
    }

    const totalTrackedMinutes = filteredEntries.reduce(
      (sum, s) => sum + (s.duration_minutes || 0),
      0
    );

    return {
      daily: dailyData,
      taskStats,
      projectStats,
      completedCount,
      totalTaskCount,
      streak,
      totalTrackedMinutes: Math.round(totalTrackedMinutes * 10) / 10,
      totalSessions: filteredEntries.length,
      heatmapData,
      currentWeekTotalMinutes: Math.round(currentWeekTotalMinutes * 10) / 10,
      weeklyProjectMinutes,
    };
  }
}

module.exports = AnalyticsService;
