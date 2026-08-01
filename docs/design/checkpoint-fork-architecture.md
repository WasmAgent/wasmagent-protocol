# Checkpoint and fork architecture

This document defines the checkpoint and fork model used by the WasmAgent
protocol. A checkpoint is an immutable execution-state snapshot. A fork is a
new execution lineage initialized from a checkpoint. A normal resume continues
the producing run and is not a fork.

## Checkpoint

The machine-readable checkpoint object is defined by
[`schemas/aep/checkpoint.schema.json`](../../schemas/aep/checkpoint.schema.json).
It contains:

- `checkpoint_id`: a stable snapshot identifier with the form
  `ckpt-<64 lowercase hexadecimal characters>`. The suffix is the SHA-256
  digest of the canonical checkpoint identity tuple
  `(parent_run_id, state_digest, nonce)`. A nonce is required when two
  snapshots could otherwise have the same tuple. The identifier names the
  snapshot, not the run, and must never be reused for different state.
- `parent_run_id`: the non-empty, opaque identifier of the execution run that
  captured the snapshot. It uses the same identifier namespace as
  `aep-record.run_id`; this protocol does not impose a separate run-ID syntax.
  It is immutable after checkpoint creation.
- `state_digest`: a content digest of the complete resumable state, encoded as
  `sha256:<64 lowercase hexadecimal characters>`. The covered state includes
  the execution cursor, immutable inputs and relevant configuration,
  capability/tool state, memory or state stores, pending work, and lineage
  inputs needed to resume or fork. It excludes storage locations, transport
  metadata, signatures, and other non-execution metadata.
- `created_at_ms`: the UTC epoch time in milliseconds at which the snapshot was
  captured.
- `fork_of` (optional): the `checkpoint_id` from which this checkpoint's state
  was derived, or `null`. It is absent for an ordinary checkpoint. It does not
  identify a run; `parent_run_id` provides that relationship.

### Digest computation

The producer serializes the covered state as deterministic UTF-8 canonical JSON:
object keys are sorted lexicographically, insignificant whitespace is omitted,
and numbers use one deterministic representation. `state_digest` is
`sha256:` followed by the SHA-256 digest of those bytes. A consumer loads the
snapshot, reconstructs the same canonical covered state, and compares the
computed digest before resuming or using it as fork input. The checkpoint ID is
computed separately from its identity tuple, so changing state cannot retain
the old checkpoint ID.

## Fork

A fork occurs when a new execution run is initialized from an existing
checkpoint and is allowed to diverge from the producing run. Typical reasons
are alternative-plan evaluation, policy changes, recovery, or debugging. The
source run and checkpoint remain immutable; the new run receives a distinct
`new_run_id` and its own evidence chain.

The fork relationship is defined by
[`schemas/aep/fork.schema.json`](../../schemas/aep/fork.schema.json):

- `fork_id`: a stable relationship identifier with the form
  `fork-<64 lowercase hexadecimal characters>`.
- `fork_of`: the source `checkpoint_id`; it must resolve to an existing
  checkpoint whose `state_digest` verifies before initialization.
- `new_run_id`: the non-empty identifier of the newly created execution run.
- `reason`: a non-empty explanation of why the new lineage was created;
  `fork_kind` may classify it as `alternative`, `recovery`, `debug`, `policy`,
  or `other`.
- `created_at_ms`: the UTC epoch time at which the new lineage was created.

The lineage is therefore:

```text
parent run --captures--> checkpoint --forks--> new run
  parent_run_id          checkpoint_id       new_run_id
                         state_digest
```

## Checkpoint evidence

`schemas/aep/checkpoint-evidence.schema.json` is the AEP evidence record for a
checkpoint capture and, when `fork_of` is present, its source-checkpoint
relationship. It asserts that the named run captured the named state at the
record timestamp; it does not by itself assert that a fork was executed unless
the fork fields are present and the referenced checkpoint and new run can be
resolved.

The record reuses the formal `checkpoint_id`, `parent_run_id`, `fork_of`, and
`state_digest` definitions from `checkpoint.schema.json`. Its `created_at_ms`
is the AEP envelope timestamp. The optional `signature` covers the canonical
record payload excluding the signature field. The checkpoint-producing runtime
or an authorized evidence issuer signs it so a verifier can detect alteration
and bind the assertion to a known key.

Verification requires: validate the JSON Schema; canonicalize the unsigned
payload; verify the signature when present against the key identified by
`signature.key_id`; resolve `parent_run_id` to the corresponding run evidence;
resolve `fork_of` to the source checkpoint when non-null; recompute and compare
`state_digest`; and, for a fork record, confirm that `new_run_id` is a distinct
run initialized from that source checkpoint. An unsigned record can be parsed
for compatibility, but it is not sufficient for a cryptographic provenance
claim.
