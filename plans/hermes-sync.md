# Plan: manage Hermes configuration with sysdef

## Agreed first pass

Share the existing `SOUL.md` with sysdef-location guidance, all 27 installed Matt Pocock / AI Hero skills, and Impeccable with its supporting assets. `modules/hermes.ts` implements this scope with individual skill links. Runtime config generation described below is deferred; the current module does not touch Hermes config or private state. See `hermes/README.md` for usage and migration.

## Goal

Reproduce the shared Hermes setup across machines using `sysdef sync --files-only`, without copying credentials or runtime state. This means configuration deployment through Git and sysdef, not live replication of conversations or a bidirectional sync daemon.

## Existing integration points

- `modules/claude.ts` and `modules/pi.ts` show the existing opt-in agent-module pattern; both leave installation separate.
- `syncFiles()` in `sysdef-src/sysdef.ts` supports both symlinked files and generated file contents. No new provider or core sync mechanism should be needed.
- Hermes is installed locally at `~/.hermes/hermes-agent`; the command is available at `~/.local/bin/hermes`.
- `~/.hermes/config.yaml` contains shared preferences alongside machine-specific settings such as terminal paths, browser settings, dashboard authentication settings, and platform configuration.
- Hermes persists configuration changes through atomic file replacement (`hermes_cli/config_backend.py` and `utils.py`). A plain config symlink is therefore unsafe to assume will survive Hermes writes.
- `~/.hermes/skills` contains categorized skills plus bundled-skill manifests, hub metadata, usage records, locks, and curator state. Do not link or copy this whole directory.

## Ownership boundary

| Content | Policy |
| --- | --- |
| Portable, non-secret preferences | Version in `hermes/config.yaml` |
| `SOUL.md` | Version and link after reviewing for personal/private content |
| Selected user-authored skills | Version individually; link only selected skill directories |
| Hooks/scripts | Add only after reviewing contents, dependencies, and paths |
| Machine-specific settings | Keep in an untracked local overlay |
| `.env`, `auth.json`, `credentials/`, tokens | Always local; never import into Git |
| Memories, sessions, databases, logs, caches, history, attachments | Always local |
| Cron jobs, profiles, plugins, gateway/service state | Out of scope for the first pass |
| Hermes installation and updates | Keep using the existing Hermes installer/update mechanism |

Use an explicit allowlist when importing files. Never copy `~/.hermes` wholesale and rely on ignore rules afterward. Shared YAML must be checked for embedded credentials, auth settings, private endpoints, user identifiers, and absolute machine paths; secrets are not confined to `.env`.

## Proposed repository layout

```text
modules/hermes.ts
hermes/
  README.md
  config.yaml                 # curated shared defaults, not a raw config dump
  config.local.example.yaml   # example machine overrides, no real secrets
  SOUL.md                     # reviewed shared persona
  skills/                     # selected custom skills, only if wanted
plans/hermes-sync.md
```

Keep real local overrides at `<Hermes home>/sysdef-local.yaml`, outside the repo. Prefer Hermes's existing local credential mechanisms rather than adding secrets to this overlay.

## Implementation steps

### 1. Curate the initial shared setup

- Review the current config locally without exposing secret values in logs or patches.
- Select the settings to share: for example model preferences, display, compression, memory limits, and tool behavior.
- Keep machine paths, authentication, platform identities, and host-specific integrations out of the shared baseline.
- Review `SOUL.md`; inventory custom versus bundled/hub-installed skills. Start with config and persona if skill ownership is unclear.
- Do not include unrelated scratch scripts or automatically generated skill metadata.

### 2. Add an opt-in Hermes module

- Follow the existing `ModuleGenerator` pattern, with no managed packages.
- Resolve the destination from explicit `HERMES_HOME`, otherwise `~/.hermes`. Document that the first pass targets the default home or an explicitly supplied home, not automatic named-profile discovery.
- Generate a regular destination `config.yaml` from the shared YAML plus optional `sysdef-local.yaml`, using the existing generated-file support.
- Define deterministic merge rules: recursively merge mappings, replace arrays/scalars, and retain explicit nulls. Fail clearly on malformed YAML or non-mapping roots before writing the destination.
- Link the reviewed `SOUL.md` and any explicitly selected skill directories. Keep the skills root and runtime metadata local.
- Do not install Hermes, restart services, or run network commands as part of file sync.

**Config ownership contract:** shared defaults + local overlay are authoritative on sync. Hermes may edit its regular runtime config during use, but the next sync regenerates it. Changes worth keeping must be promoted into the shared file or local overlay first. Do not silently ingest the entire runtime config back into Git.

### 3. Make migration reversible

- Back up the existing config, persona, and each skill destination being adopted, with restrictive permissions and outside Git.
- Extract machine-specific preferences into the local overlay before the first sync. Preserve the original config for comparison.
- Move aside existing destinations before replacing them with symlinks; do not depend on sysdef to back up collisions automatically.
- Enable `hermes` in the machine's local sysdef `config.yaml` only after review.
- Run `sysdef sync --files-only --dry-run`, inspect the proposed scope, then run the real file-only sync.
- Compare the effective generated config with the original to confirm that intentional changes are the only changes. Restart Hermes manually if needed.
- Rollback: disable the module, remove only the adopted links/generated config, and restore the backups. Disabling a module alone does not restore files.

### 4. Test and document

- Test module output with a temporary home and explicit `HERMES_HOME`; never use the real Hermes home in tests.
- Test baseline-only generation, override precedence, arrays/nulls, malformed input, and repeat-sync stability.
- Assert the destination allowlist excludes credentials, memories, databases, and other runtime data.
- Verify a selected skill can be linked without replacing its siblings or metadata.
- Smoke-test a harmless Hermes config mutation in a disposable home, followed by another sync, to verify the documented regeneration behavior.
- Document secret setup, installation prerequisites, local overrides, promoting runtime edits, migration, and rollback in `hermes/README.md`.

## Acceptance criteria

1. A second machine with Hermes installed can apply the shared setup with file-only sync, without copying the first machine's Hermes state.
2. Credentials and runtime data remain untouched and absent from Git.
3. Machine-specific overrides survive repeated syncs.
4. Hermes can persist runtime settings without breaking a config symlink, because the config is a generated regular file.
5. A repeated sync with unchanged inputs yields identical config contents.
6. Existing sessions, memories, installed skills, and gateway operation are not implicitly migrated or restarted.

## Decisions to confirm before implementation

- Is the intended scope shared configuration only, or are memories/conversations also desired? This plan deliberately excludes the latter.
- Share the current `SOUL.md`, or leave persona local?
- Which custom skills should become repository-owned?
- Is regeneration on sync acceptable? If preserving every Hermes UI/CLI setting change automatically is required, design a separate explicit import/reconciliation command rather than an implicit two-way merge.
