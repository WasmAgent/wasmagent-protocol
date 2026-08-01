# Checkpoint and fork architecture

This document defines the checkpoint and fork concepts used by the WasmAgent
protocol. A checkpoint describes execution state; a fork describes a new
execution lineage that starts from that state. AEP evidence records can attest
to either operation, but the core objects are useful independently of a
signature or evidence envelope.

## Checkpoints

A checkpoint is an immutable snapshot of an execution run at a particular
point in time. It is an addressable resume point: the producing run may resume
from it, or a new run may use it as the starting point for a fork. Taking a
checkpoint does not itself create a new run.

The machine-readable object is defined by
[`schemas/aep/checkpoint.schema.json`](../schemas/aep/checkpoint.schema.json).
Its required fields are:

- `checkpoint_id` identifies the snapshot, not the run. The recommended wire
  form is `ckpt-<lowercase-sha256-hex>`, where the digest is computed over the
  canonical tuple `(parent_run_id, state_digest, nonce)`. A producer that has
  no parent run uses the empty value for `parent_run_id`. The nonce may be a
  creation timestamp, but a random nonce is preferred when two snapshots can
  otherwise have the same tuple. The resulting identifier is globally unique
  for the identifier namespace with overwhelming probability; implementations
  must not reuse it for different state.
- `parent_run_id` is the non-empty identifier of the execution run that
  produced the snapshot. It is optional on a core checkpoint so that a system
  can represent a root or externally imported snapshot. When present, it is
  captured at checkpoint creation and is immutable.
- `state_digest` is a content digest of the complete resumable state. The
  recommended representation is `sha256:<lowercase-hex>`.
- `created_at` is the RFC 3339 date-time at which the snapshot was captured.

The state covered by `state_digest` includes all information needed to resume
deterministically or to initialize a fork: the execution cursor, immutable
inputs and relevant configuration, capability/tool state, memory or state
stores, pending work, and the checkpoint's lineage inputs. It excludes
transport metadata, storage locations, signatures, and other values that do
not affect execution. Producers compute the digest over a deterministic UTF-8
canonical JSON serialization (sorted object keys, no insignificant whitespace,
and deterministic number representation) of that state. Consumers verify the
digest after loading the snapshot and before resuming or forking.

`fork_of`, when present, links a checkpoint to the checkpoint from which its
state was derived. It may be the source `checkpoint_id` or an embedded
checkpoint reference object containing that ID. It is omitted for an ordinary
checkpoint and may be `null` in AEP evidence for compatibility with existing
producers.

## Forks

A fork is a new execution lineage derived from an existing checkpoint. Forking
occurs when a new run is initialized from a checkpoint and is allowed to
diverge from the producing run. Typical reasons include evaluating an
alternative plan, applying a different policy, recovery, or debugging. A
normal resume continues the existing run and is not a fork.

The fork relationship is defined by
[`schemas/aep/fork.schema.json`](../schemas/aep/fork.schema.json):

- `fork_id` is the unique identifier of the fork relationship.
- `source_checkpoint_id` identifies the checkpoint used to initialize the new
  branch and must resolve to a checkpoint object.
- `fork_reason` records why the new lineage was created. `fork_kind` may add a
  machine-readable classification; the schema enumerates `alternative`,
  `recovery`, `debug`, `policy`, and `other`.
- `created_at` records when the branch was created.
- `new_run_id`, `target_branch`, and `metadata` can identify the resulting run
  and carry non-authoritative lineage context.

The source checkpoint's `parent_run_id` identifies the run that produced the
state. The new run receives its own run ID; it does not overwrite the parent
run, its evidence, or the source checkpoint. A consumer can therefore resolve
`source_checkpoint_id`, verify its `state_digest`, and establish the exact
state from which the new run began.

In shorthand, the lineage is:

```text
parent run --creates--> checkpoint --initializes--> new run
                         |                         |
                   checkpoint_id              new_run_id
```

## Evidence relationship

`schemas/aep/checkpoint-evidence.schema.json` is the AEP evidence envelope for
these concepts. Its `checkpoint_id`, `parent_run_id`, `fork_of`, and
`state_digest` fields reuse the corresponding definitions from the checkpoint
schema. Its `created_at_ms` remains the AEP envelope timestamp in epoch
milliseconds; it is not a replacement for the core checkpoint's RFC 3339
`created_at` field. Signatures and trace correlation belong to the evidence
record, while the core schemas define the identifiers and state relationships
that the record attests to.
