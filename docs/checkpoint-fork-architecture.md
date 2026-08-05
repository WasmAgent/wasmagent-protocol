# Checkpoint & Fork Architecture

## Overview

Checkpoints and forks are the two primitives for verifiable execution state management in the WasmAgent protocol.

- A **Checkpoint** captures a snapshot of agent execution state at a point in time, enabling tamper-evident resume and state verification.
- A **Fork** creates a new execution lineage derived from an existing checkpoint, recording the provenance link back to the source.

## Checkpoint

A checkpoint represents a deterministic snapshot of an agent's execution state.

### Fields

- `checkpoint_id` — Globally unique identifier. Recommended format: `<run_id>-<state_digest_prefix>` or `<run_id>-<nonce>`.
- `state_digest` — Deterministic content digest of the checkpointed state. Computed over the canonical serialization of all mutable state at checkpoint time. The digest algorithm (e.g. SHA-256) is not specified by this schema but must be consistent within a system.
- `created_at` — ISO 8601 timestamp of checkpoint creation.
- `parent_run_id` (optional) — The run that produced this checkpoint.
- `fork_of` (optional) — When present, indicates this checkpoint is the starting point of a fork, linking back to the source checkpoint by `checkpoint_id`.

### Uniqueness

`checkpoint_id` must be unique within a system. When derived from a run, including a nonce or timestamp component prevents collisions from parallel checkpointing.

### State Digest Computation

The `state_digest` covers all execution-relevant state: task queue, memory context, tool state, and any accumulated evidence. The specific serialization is implementation-defined but must be deterministic (same state → same digest).

## Fork

A fork starts a new execution lineage from an existing checkpoint.

### Fields

- `fork_id` — Globally unique identifier. Recommended format: `fork-<source_checkpoint_id>-<nonce>`.
- `source_checkpoint_id` — The `checkpoint_id` from which this fork was created.
- `fork_reason` — Semantic classification: `retry`, `branch`, `rollback`, `experiment`, `recovery`, or `other`.
- `created_at` — ISO 8601 timestamp of fork creation.
- `target_branch` (optional) — Label for the destination execution environment or branch.
- `parent_run_id` (optional) — The run that produced the source checkpoint.

### When Forking Occurs

Forking is appropriate when:
- A run needs to be retried from a known-good state (`retry`)
- Alternative execution paths must be explored in parallel (`branch`, `experiment`)
- A failed run needs to resume from a prior checkpoint (`rollback`, `recovery`)

## Relationship to CheckpointEvidence

`CheckpointEvidence` (`schemas/aep/checkpoint-evidence.schema.json`) is the AEP evidence record that attests a checkpoint occurred within a run. It carries the AEP envelope fields plus the same `checkpoint_id`, `parent_run_id`, `fork_of`, and `state_digest` fields. The `Checkpoint` and `Fork` schemas in this directory define the standalone data structures; `CheckpointEvidence` wraps them in the AEP evidence envelope.
