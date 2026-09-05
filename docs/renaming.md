# Renaming: from Todo to Ordo

The application was called Todo up to and including 0.8.2, and Ordo from 0.8.3. The rename changes more than a label, because two things the user depends on are derived from the application name.

## What the name controls

Electron resolves `app.getPath('userData')` from the application name in `package.json`. Under the old name that directory was `todo`; under the new one it is `ordo`. The database file, its write-ahead log, and every backup live in that directory, so a rename alone would point the application at an empty directory while the real database stayed behind. To the user that is indistinguishable from losing every todo.

The macOS bundle identifier also changed, from the placeholder `com.todo.app` to `net.sorenwacker.ordo`. The old identifier claimed a domain that is not ours, which would have had to change before the build could be signed or notarized.

## The migration

`src/main/legacyData.js` copies the previous directory forward. It runs once, from `app.whenReady()`, before the database is opened.

It copies `todos.db`, its `-wal` and `-shm` companions when present, and any `todos-backup-*.db` and `todos-premigrate-*.db` files. Nothing else in the old directory is touched: the rest is Electron's own cache and is rebuilt on demand.

Three conditions stop it, each reported as a reason rather than an error:

- `target-exists` — the new directory already holds a `todos.db`. The current database is never overwritten, so running a new build after a returning user has already started fresh cannot destroy their work.
- `no-legacy-data` — there is no old database to copy, which is the normal case for a new installation.
- `same-directory` — the two paths resolve to the same place, so there is nothing to do.

The copy is non-destructive. The old `todo` directory is left exactly as it was, which means a user who installs 0.8.3, dislikes it, and goes back to 0.8.2 still finds their data where that build expects it. The cost is one duplicated database on disk until the user deletes the old directory by hand.

A failure to copy is logged and swallowed rather than being allowed to stop startup. The application then opens an empty database, and the untouched old directory can still be recovered by hand, which is a better outcome than an application that refuses to start.

## Repository and downloads

The GitHub repository moved from `sorenwacker/my-todo-list` to `sorenwacker/ordo`. GitHub redirects the old paths, including release asset URLs, so existing installations continue to find updates. Release assets are named `Ordo-<version>-*` from 0.8.3; earlier releases keep their `Todo-<version>-*` names.
