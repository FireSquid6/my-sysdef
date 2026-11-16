# Branchfork state recovery

Snapshots are published atomically without replacing an existing file. A retry
reuses a snapshot only when its context matches (ignoring regenerated metadata
and branchfork status notices). Corrupt or conflicting snapshots stop the command;
inspect the reported file before manually moving it aside and retrying. A process
killed during writing may leave an unpublished `.tmp` file; it is never reused.

Inbox registrations, queues, and receipts use a process/session receiver ID.
The ID survives `/reload` in that process, but a newly started process has a new
ID even when resuming the same saved session. Reload existing destination Pi
processes after upgrading. Old session-keyed queues and queues belonging to an
exited process are retained, not automatically reassigned: inspect them and rerun
the source command to queue context for the intended live receiver. Automatically
adopting them could deliver another terminal's context to the wrong process.
