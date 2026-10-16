const BaseRepository = require("./base-repository");

/** Projects, their ordering, weekly targets, and task assignment. */
class ProjectsRepository extends BaseRepository {
  constructor(db, tasks, settings) {
    super(db);
    this.tasks = tasks;
    this.settings = settings;
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
    const targets = await this.settings.getWeeklyTargets();
    if (targets[id]) {
      delete targets[id];
      await this.settings.setSetting("weekly_targets", JSON.stringify(targets));
    }
    const order = await this.getProjectOrder();
    if (Array.isArray(order) && order.includes(id)) {
      await this.saveProjectOrder(order.filter((x) => x !== id));
    }
    return true;
  }

  async assignTaskToProject(id, projectId) {
    const task = await this.one("SELECT id FROM tasks WHERE id=$1", [id]);
    if (!task) await this.tasks.saveTask({ id, projectId });
    else
      await this.run(
        "UPDATE tasks SET project_id=$1,updated_at=$2 WHERE id=$3",
        [projectId || null, new Date().toISOString(), id],
      );
    return (await this.tasks.getTasks())[id];
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
    await this.settings.setSetting("project_order", JSON.stringify(ids));
    return true;
  }

  async getProjectOrder() {
    return this.settings.jsonSetting("project_order", []);
  }
}

module.exports = ProjectsRepository;
