import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const dir = join(here, '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all().map((r) => r.filename),
  );
  const mark = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    // Table rebuilds (SQLite 12-step procedure, e.g. 029_wizard_enums)
    // must run with foreign keys OFF: with FK ON, dropping the parent
    // table silently deletes rows in child tables that reference it
    // (verified: property_images / saved_properties rows vanished on
    // a rebuild test with FK ON, while the copied parent rows looked
    // intact). PRAGMA foreign_keys is a no-op inside a transaction,
    // so it is switched OFF before BEGIN and back ON after COMMIT.
    // A migration opts into this by carrying a REQUIRES_FK_OFF marker.
    // Integrity is still enforced: foreign_key_check runs inside the
    // transaction before COMMIT, and any violation rolls back.
    const needsFkOff = sql.includes('REQUIRES_FK_OFF');
    if (needsFkOff) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      if (needsFkOff) {
        const violations = db.prepare('PRAGMA foreign_key_check').all();
        if (violations.length > 0) {
          throw new Error(`foreign_key_check failed: ${JSON.stringify(violations)}`);
        }
      }
      mark.run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      if (needsFkOff) db.exec('PRAGMA foreign_keys = ON');
    }
  }
}
