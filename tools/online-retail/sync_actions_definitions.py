#!/usr/bin/env python3
"""Copy ontology object_types + properties from definition-service (read via the
gateway) into ontology-actions-service's Postgres schema.

In production this happens via Debezium CDC; in the PoC we don't have CDC, so
this script bridges the gap so that action validation can resolve property
names. Idempotent: ON CONFLICT DO UPDATE.

Usage:
    GATEWAY=http://192.168.105.2 TOKEN=$(cat /tmp/of-jwt) \
        python3 tools/online-retail/sync_actions_definitions.py > /tmp/sync.sql
    # then run /tmp/sync.sql against ontology_actions schema
"""
import json
import os
import sys
from urllib import request as urllib_request

TYPES = [
    "678b55fe-db5f-4d3a-bbf2-8cb643af8d32",  # transaction
    "616c7a42-6522-4f94-b696-ddb056cf9b11",  # product
    "46e2598c-0d11-4ab2-a4aa-301f3e8fb5a7",  # customer
]


def get(url: str, token: str) -> dict:
    req = urllib_request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib_request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def sql_str(v) -> str:
    if v is None:
        return "NULL"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def sql_jsonb(v) -> str:
    if v is None:
        return "NULL"
    return f"'{json.dumps(v).replace(chr(39), chr(39)+chr(39))}'::jsonb"


def main() -> int:
    gw = os.environ.get("GATEWAY", "http://192.168.105.2").rstrip("/")
    token = os.environ.get("TOKEN") or open("/tmp/of-jwt").read().strip()

    out = ["SET search_path TO ontology_actions, public;", "BEGIN;"]
    for tid in TYPES:
        t = get(f"{gw}/api/v1/ontology/types/{tid}", token)
        out.append(
            "INSERT INTO object_types (id, name, display_name, description, "
            "primary_key_property, icon, color, owner_id, created_at, updated_at) VALUES "
            f"({sql_str(t['id'])}, {sql_str(t['name'])}, {sql_str(t['display_name'])}, "
            f"{sql_str(t.get('description',''))}, {sql_str(t.get('primary_key_property'))}, "
            f"{sql_str(t.get('icon','object'))}, {sql_str(t.get('color','#888'))}, "
            f"{sql_str(t.get('owner_id','00000000-0000-0000-0000-000000000001'))}, NOW(), NOW()) "
            "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, display_name=EXCLUDED.display_name, "
            "description=EXCLUDED.description, primary_key_property=EXCLUDED.primary_key_property, "
            "icon=EXCLUDED.icon, color=EXCLUDED.color, updated_at=NOW();"
        )
        props = get(f"{gw}/api/v1/ontology/types/{tid}/properties", token)
        items = props.get("data") or props.get("items") or []
        for p in items:
            out.append(
                "INSERT INTO properties (id, object_type_id, name, display_name, description, "
                "property_type, required, unique_constraint, default_value, validation_rules, "
                "created_at, updated_at) VALUES "
                f"({sql_str(p['id'])}, {sql_str(p['object_type_id'])}, {sql_str(p['name'])}, "
                f"{sql_str(p['display_name'])}, {sql_str(p.get('description',''))}, "
                f"{sql_str(p['property_type'])}, {str(p.get('required', False)).upper()}, "
                f"{str(p.get('unique_constraint', False)).upper()}, "
                f"{sql_jsonb(p.get('default_value'))}, {sql_jsonb(p.get('validation_rules'))}, "
                "NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, "
                "display_name=EXCLUDED.display_name, description=EXCLUDED.description, "
                "property_type=EXCLUDED.property_type, required=EXCLUDED.required, "
                "unique_constraint=EXCLUDED.unique_constraint, default_value=EXCLUDED.default_value, "
                "validation_rules=EXCLUDED.validation_rules, updated_at=NOW();"
            )
    out.append("COMMIT;")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
