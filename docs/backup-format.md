# Backup format

A private backup is one file that holds a whole register. It is private: it holds every name, note, amount and page photo. The keeper decides where it goes. The code is `template/src/data/backup.ts`, and `tests/unit/backup.test.ts` covers it.

## The file

- Name: `register-backup-<date>.pkr.zip`, for example `register-backup-2026-04-20.pkr.zip`. The name holds the kind of file and a date, never a private value. The reader decides what a file is from its bytes and never reads its name.
- Container: a zip archive. The entries are written with one fixed time, so the same register gives the same bytes.
- Format name: `plot.backup.v1`. Schema version: 1.

## Entries

| Entry | Holds |
|---|---|
| `manifest.json` | The format, the schema version, the kind of register, the site ID, the lineage ID, the revision, the creation time, a list of every other entry with its path, byte length and SHA-256, the counts of events and images, and the settings that belong to the register |
| `site.json` | The register's own record (title, time zone, currency, workspace and keys). The sequence counter is not stored |
| `events.json` | Every stored event, in order |
| `images/<id>.jpg`, `.png` or `.webp` | One normalised page or stone photo each. Camera metadata was removed when the photo was added |

No other entry is allowed. An entry that is not listed in the manifest, a name repeated, a path not in the list, or a listed entry that is missing makes the whole file refused.

## Checks before a restore

Everything is checked in memory before the first write. A failure writes nothing and leaves the register as it was.

1. Size: the compressed size, the decoded size, the number of photos and the photo bytes for one register are within the limits in `template/src/limits.ts`.
2. The file is a zip, and its manifest is readable JSON with the shape above. A file that is a different kind of Plotwarden file (a visitor copy, a review file, a return slip) is named as such, and refused.
3. The format is `plot.backup.v1` or an older one. A newer version is refused ("This file needs a newer version"). An older one is brought up to date in memory by a migration.
4. The kind matches the register the keeper is in. A backup of a garden is not restored into a churchyard.
5. Every entry is inflated to the size the directory gave, and its length and SHA-256 equal the manifest.
6. The events are in order with no gap, and each one parses.

## Restore

- **Restore as a new register** is the default. The copy gets its own site ID. It keeps the lineage ID.
- **Replace** an existing register needs a deliberate action: the keeper types the register's title.
- The write is one IndexedDB transaction. The result says how many events and images were written.
- A restore may change the exchange key of the copy. The result says when it did, and review files made earlier then refer to the earlier copy, which the Desk keeps apart.
- The register says "This backup is incomplete. Your register is safe." when a file fails a check.

## What this does not cover

- Restore, backup and the 200 row import were run in fake IndexedDB and in headless Chromium. A real device quota failure was not seen. The message for it is covered by a unit test with a store that refuses writes.
- A backup is not encrypted. Keep it where you keep the paper register.
