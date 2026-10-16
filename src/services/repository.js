const SettingsRepository = require("./repositories/settings-repository");
const TasksRepository = require("./repositories/tasks-repository");
const SessionsRepository = require("./repositories/sessions-repository");
const ProjectsRepository = require("./repositories/projects-repository");
const HabitsRepository = require("./repositories/habits-repository");
const BackupRepository = require("./repositories/backup-repository");

/**
 * Aggregates the per-domain repositories behind a single object.
 *
 * Each domain lives in its own file under ./repositories and only depends on
 * the sibling repositories it genuinely needs, so the data layer stays modular
 * without duplicating query helpers.
 */
class Repository {
  constructor(dbManager) {
    this.db = dbManager.getDb();

    this.settings = new SettingsRepository(this.db);
    this.tasks = new TasksRepository(this.db, this.settings);
    this.sessions = new SessionsRepository(this.db, this.tasks);
    this.projects = new ProjectsRepository(this.db, this.tasks, this.settings);
    this.habits = new HabitsRepository(this.db);
    this.backup = new BackupRepository(this.db);
  }
}

module.exports = Repository;
