# Protocol Boundaries

AEP **is**:

- portable evidence and verification infrastructure for agent actions;
- a schema + signature envelope + conformance model;
- designed so a third party can verify evidence without trusting the emitter.

AEP **is not**:

- a general agent orchestration protocol (it carries evidence, not control);
- a runtime authorization mechanism — policy decisions consume AEP evidence,
  but enforcement lives elsewhere;
- a capture-completeness guarantee — without an independent witness, AEP
  proves integrity of what was emitted, not that nothing was omitted;
- an identity provider or a transport.

These boundaries are stable; expansion beyond them requires a documented
community decision, not tooling convenience.
