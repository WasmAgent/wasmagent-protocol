# Privacy Considerations

- AEP evidence records what an agent did; depending on deployment, tool
  arguments and outputs may be personal data. Producers hash payload content
  (`args_hash`, `content_hash`) precisely so verifiable evidence can be
  retained without retaining raw content.
- Retention is a deployment decision; producers should document retention and
  honor deletion requests by dropping evidence (integrity guarantees apply to
  retained records only).
- The conformance corpus contains only synthetic, seeded canary data.
