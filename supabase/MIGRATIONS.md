# Existing-project migration workflow

Target: eSAKAY project `neifadvftploburrtfmb` only.

The October 27 release privately snapshots every original public table, policy,
and function before applying the feature and security migrations. The release
preservation and safety SQL tests validate existing identities and roles and
roll back disposable test fixtures.

This repository was imported with filenames that differ from the project's
original migration history. Four comment-only markers retain those remote
versions. Migration `20261027170000` baselines ten older local files whose schema
is already covered by the verified current release. It deliberately avoids
replaying superseded seed data, telemetry deletion, or permissive policies.
The original remote migration statements remain intact.

For future changes, add a new timestamped migration after this release, back up
affected records, inspect the pending migration list, and test before deploying.
Do not edit or rerun historical migration files on this existing project.
Normal future records are saved through the shared database and R2 services;
they do not require repeated schema migrations.

These imported-history markers are for the existing project, not a tested
empty-database installation path. A new project needs a separately reviewed
schema baseline rather than replaying historical seed and access policies.
