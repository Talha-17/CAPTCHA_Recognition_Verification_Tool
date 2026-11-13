

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDirectory = path.join(__dirname, 'data');

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const databasePath = path.join(dataDirectory, 'captcha_tool.db');

const db = new sqlite3.Database(databasePath, (error) => {
  if (error) {
    console.error('Database connection failed:', error.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS processing_runs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          category TEXT,
          challenge_type TEXT,
          status TEXT,
          duration_ms REAL DEFAULT 0,
          confidence REAL DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          safe_message TEXT
        )`,
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          db.run(
            `CREATE INDEX IF NOT EXISTS idx_processing_runs_timestamp
             ON processing_runs(timestamp)`,
            (indexError) => {
              if (indexError) {
                reject(indexError);
              } else {
                console.log('Database tables initialized.');
                resolve();
              }
            }
          );
        }
      );
    });
  });
};

module.exports = {
  db,
  initializeDatabase
};
