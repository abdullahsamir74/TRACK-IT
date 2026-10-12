const path = require("path");
const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");
const DatabaseManager = require("../src/db/database");
const Repository = require("../src/services/repository");

async function migrate() {
  const defaultSqlitePath = path.join(
    os.homedir(),
    ".config",
    "track-it",
    "tracker.sqlite",
  );
  const sqlitePath = process.argv[2] || defaultSqlitePath;

  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite database not found at: ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`Migrating SQLite data from: ${sqlitePath}`);

  const queryTable = (table) => {
    try {
      const output = execSync(
        `sqlite3 "${sqlitePath}" ".mode json" "SELECT * FROM ${table};"`,
        { encoding: "utf8" },
      ).trim();
      return output ? JSON.parse(output) : [];
    } catch (e) {
      return [];
    }
  };

  const payload = {
    data: {
      projects: queryTable("projects"),
      tasks: queryTable("tasks"),
      timeEntries: queryTable("time_entries"),
      habits: queryTable("habits"),
      habitLogs: queryTable("habit_logs"),
      settings: queryTable("settings"),
    },
  };

  const dbManager = await DatabaseManager.create();
  const repo = new Repository(dbManager);
  await repo.importDatabaseJson(payload);
  await dbManager.close();

  console.log("Migration completed successfully!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
