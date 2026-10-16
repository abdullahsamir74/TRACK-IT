const BaseRepository = require("./base-repository");

/** Key/value application settings (task/project order, sort mode, weekly targets). */
class SettingsRepository extends BaseRepository {
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
}

module.exports = SettingsRepository;
