import Database from "better-sqlite3";
import { config } from "../config";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initDb(db);
  }
  return db;
}

function initDb(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quicknode_id    TEXT    NOT NULL,
      endpoint_id     TEXT    NOT NULL UNIQUE,
      wss_url         TEXT    NOT NULL,
      http_url        TEXT    NOT NULL,
      chain           TEXT    NOT NULL,
      network         TEXT    NOT NULL,
      plan            TEXT    NOT NULL DEFAULT 'starter',
      referers        TEXT,
      contract_addresses TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_instances_endpoint_id
      ON instances(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_instances_quicknode_id
      ON instances(quicknode_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
