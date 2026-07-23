"""wasmagent-protocol — canonical AEP + compliance JSON Schemas.

Single source of truth across the WasmAgent org. Do not copy these schemas into
consumer repositories; depend on this package instead.

    from wasmagent_protocol import get_schema, schema_path, INDEX

    aep = get_schema("aep-record")   # parsed dict
    path = schema_path("aep-record") # pathlib.Path to the .json file
"""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Any

__all__ = ["INDEX", "get_schema", "schema_path", "schema_ids"]

_SCHEMAS_PKG = "wasmagent_protocol.schemas"


def _read(rel_path: str) -> str:
    # rel_path is e.g. "index.json" or "aep/aep-record.schema.json"
    resource = resources.files(_SCHEMAS_PKG)
    for part in rel_path.split("/"):
        resource = resource / part
    return resource.read_text(encoding="utf-8")


INDEX: dict[str, Any] = json.loads(_read("index.json"))

# Map schema id -> path relative to the schemas/ directory.
_PATHS: dict[str, str] = {
    s["id"]: s["path"].removeprefix("schemas/") for s in INDEX["schemas"]
}


def schema_ids() -> list[str]:
    """Return the ids of every registered canonical schema."""
    return list(_PATHS)


@lru_cache(maxsize=None)
def get_schema(schema_id: str) -> dict[str, Any]:
    """Return the parsed JSON Schema for a registered id.

    Raises KeyError on an unknown id.
    """
    try:
        rel = _PATHS[schema_id]
    except KeyError:
        raise KeyError(
            f"unknown schema id {schema_id!r}; known: {', '.join(_PATHS)}"
        ) from None
    return json.loads(_read(rel))


def schema_path(schema_id: str) -> Path:
    """Return a filesystem Path to the schema JSON for a registered id.

    Raises KeyError on an unknown id.
    """
    try:
        rel = _PATHS[schema_id]
    except KeyError:
        raise KeyError(
            f"unknown schema id {schema_id!r}; known: {', '.join(_PATHS)}"
        ) from None
    resource = resources.files(_SCHEMAS_PKG)
    for part in rel.split("/"):
        resource = resource / part
    with resources.as_file(resource) as p:
        return Path(p)
