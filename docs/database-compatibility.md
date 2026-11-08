# Database Compatibility

Guarantees that a database file is never silently broken by version
mismatches or migrations.

## Schema versioning

The schema has an integer version, stored in the database file via SQLite's
`PRAGMA user_version` and defined in code as `SCHEMA_VERSION`
(`src/main/schema.js`). Every change to the schema increments the constant
and adds a corresponding migration step. A value of `0` marks a database
from before versioning was introduced; such files are migrated and stamped
on first open.

## Open sequence

On startup the app reads the file's version and acts as follows:

- **File version higher than the app's**: the app refuses to open the
  database. Nothing is written. A dialog explains that the database was
  created by a newer version of the app and that the app must be updated.
  This prevents an outdated installation from misreading or damaging a
  newer file.
- **File version lower than the app's** (including `0`): the file is first
  copied to `<name>-premigrate-YYMMDD-HHMMSS.db` in the same directory,
  then migrations run, the schema is verified, and the file is stamped
  with the current version. The backup is only created for existing
  databases, not for freshly created ones.
- **File version equal to the app's**: migrations are skipped; the schema
  is still verified.

If migration or verification fails, the app shows the error and the backup
path instead of running against a half-migrated schema. The pre-migration
backup always contains the untouched previous state.

## Legacy repair: stale categories foreign key

Databases created before the category feature was removed carry a
`FOREIGN KEY (category_id) REFERENCES categories(id)` clause in the todos
table definition, while the `categories` table itself is dropped by a later
migration. The clause is inert while SQLite foreign-key enforcement is off,
but breaks every write to todos if enforcement is ever enabled.

Migration to schema version 1 detects `REFERENCES categories` in the stored
todos DDL and rebuilds the table without it, following SQLite's documented
table-rebuild procedure: create the table under a temporary name with the
canonical column set, copy all rows, drop the old table, rename. The
`category_id` column and its data are dropped; all other data is preserved
(and remains available in the pre-migration backup).

Migration to schema version 2 adds the `todos.deleted_project_id` column.
When a project is moved to the trash its todos go to the inbox and the
column records the project they came from; restoring the project moves the
todos that are still in the inbox back into it. Older app versions refuse to
open a version 2 file, as described above.

## Schema verification

After opening, the app checks via `PRAGMA table_info` that the todos,
projects, and statuses tables contain every column the code relies on.
A mismatch aborts startup with a message naming the missing columns and
pointing to the backup and reset options (see [Reset Database](reset-database.md)),
instead of letting individual inserts fail later.
