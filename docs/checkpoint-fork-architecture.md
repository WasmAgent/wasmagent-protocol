# Checkpoint and fork architecture

This document defines the core checkpoint and fork objects in the WasmAgent
protocol. They describe execution-state lineage; they are not replacements for
the AEP evidence envelopes that attest to that lineage.

## Checkpoint

A checkpoint is an immutable, addressable snapshot of an execution run's state
at a particular point in time. It can be used to resume the same run or as the
starting state for a new run. Creating a checkpoint does not itself create a
new execution run.

The core shape is defined by
[`schemas/aep/checkpoint.schema.json`](../schemas/aep/checkpoint.schema.json):

| Field | Meaning |
| --- | --- |
| `checkpoint_id` | Stable identifier for the snapshot. It identifies state, not a run. |
| `parent_run_id` | The run that produced the checkpoint. |
| `state_digest` | Content digest of the complete checkpointed state. Consumers verify this before resume or fork. |
| `timestamp` | UTC epoch milliseconds when the checkpoint was captured. |
| `metadata` | Non-authoritative producer context, such as runtime or storage details. |

The `state_digest` is the integrity boundary. Metadata may help a consumer
locate or interpret a snapshot, but it is not a substitute for validating the
state digest.

## Fork

A fork occurs when a new execution run starts from an existing checkpoint. The
new run receives its own `new_run_id` and may diverge from the parent without
rewriting the parent run or checkpoint. A normal resume continues the existing
run; it is not a fork. A fork should be recorded when a distinct branch is
created, for example to evaluate an alternative plan or policy decision.

The fork relationship is defined by
[`schemas/aep/fork.schema.json`](../schemas/aep/fork.schema.json):

| Field | Meaning |
| --- | --- |
| `fork_of` | Identifier of the existing parent run. It equals the source checkpoint's `parent_run_id`. |
| `new_run_id` | Identifier of the newly created branch run. |
| `checkpoint_id` | Exact checkpoint from which the branch starts. |
| `reason` | Why the branch was created. |
| `timestamp` | UTC epoch milliseconds when the forked run was created. |

The pair (`fork_of`, `checkpoint_id`) is intentional: the run ID establishes
lineage, while the checkpoint ID identifies the exact state selected from that
run. A consumer can resolve the checkpoint and verify that its
`state_digest` is the state used to initialize `new_run_id`.

## Runs and evidence

Execution runs are the units that produce actions and evidence. A run may
produce zero or more checkpoints. A checkpoint points back to its producing run
through `parent_run_id`; a fork points forward to a new run through
`new_run_id`.

The core objects are deliberately small and contain no signature or AEP
envelope fields. Producers that emit attestations should use the
`checkpoint-evidence` schema. That evidence schema retains the AEP
`created_at_ms` envelope field (the equivalent of a core object's `timestamp`)
and may carry `metadata`, `fork_of`, and `new_run_id`. Its `state_digest` and
`checkpoint_id` have the same meaning as the core checkpoint fields.

Conceptually, the lineage is:

```text
parent run ──creates──> checkpoint ──starts──> new run
     │                       │                  │
     └── parent_run_id ──────┘                  └── new_run_id
                             └── checkpoint_id
```

Signatures, trace correlation, and other tamper-evident claims belong in the
corresponding AEP evidence record. The core schemas define the identifiers and
relationships that those records attest to; they do not claim that a state
exists merely because an identifier was emitted.
