import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorizations (
      id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      terms_json TEXT NOT NULL,
      issuer_signature TEXT NOT NULL,
      approval_json TEXT,
      revocation_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_subject ON authorizations(subject);
    CREATE INDEX IF NOT EXISTS idx_auth_issuer ON authorizations(issuer);
    CREATE TABLE IF NOT EXISTS challenges (
      nonce TEXT PRIMARY KEY,
      authorization_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      type TEXT NOT NULL,
      authorization_id TEXT,
      issuer TEXT,
      subject TEXT,
      resource_id TEXT,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS assets (
      mint TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      labeled_by TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      signature TEXT PRIMARY KEY,
      authorization_id TEXT NOT NULL,
      verified_at INTEGER NOT NULL
    );
        CREATE TABLE IF NOT EXISTS asset_records (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      photo_hash TEXT NOT NULL,
      declared_at INTEGER NOT NULL,
      signature TEXT NOT NULL,
      mint TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_asset_owner ON asset_records(owner);
    CREATE TABLE IF NOT EXISTS asset_photos (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL
    );
  `);
  try {
    db.exec('ALTER TABLE authorizations ADD COLUMN payment_json TEXT');
  } catch {
    // Column already exists.
  }
  try {
    db.exec('ALTER TABLE authorizations ADD COLUMN denial_json TEXT');
  } catch {
    // Column already exists.
  }
  return db;
}