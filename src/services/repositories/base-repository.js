/**
 * Shared query helpers for domain repositories.
 * Every domain repository talks to PostgreSQL through these three methods.
 */
class BaseRepository {
  constructor(db) {
    this.db = db;
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
}

module.exports = BaseRepository;
