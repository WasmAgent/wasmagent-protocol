# Privacy Considerations

- AEP evidence records what an agent did; depending on deployment, tool
  arguments and outputs may be personal data. The schema carries content as
  artifact/reference digests rather than raw payloads — e.g.
  `input_refs[].digest`, `output_refs[].digest`, `pre_state_digest`,
  `post_state_digest`, `precondition_digest`, and `result_digest` — precisely
  so verifiable evidence can be retained without retaining raw content.
  Digesting can reduce the need to retain raw payloads; it does not by itself
  make personal data non-personal, and it is not a legal-compliance guarantee.
- Retention is a deployment decision; producers should document retention and
  honor deletion requests by dropping evidence (integrity guarantees apply to
  retained records only).
- The conformance corpus contains only synthetic, seeded canary data.
