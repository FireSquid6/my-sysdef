# Global instructions

- When no language or runtime is specified, default to TypeScript with Bun. Follow an existing project's language and tooling conventions unless asked to change them.
- If a required tool is missing and you cannot install it, stop immediately and report the blocker to the user. Explain which tool is needed and why you cannot install it; do not silently skip the blocked work or substitute an unverified workaround.
- Prefer stable, maintained existing libraries over building equivalent functionality yourself. Follow the project's dependency conventions and use custom code when no suitable library fits.
