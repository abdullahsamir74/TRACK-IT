const BaseRepository = require("./base-repository");

/** Habits and their daily completion logs. */
class HabitsRepository extends BaseRepository {
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
}

module.exports = HabitsRepository;
