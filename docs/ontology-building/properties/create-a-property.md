# Create a property

Property creation is already guarded by basic semantic validation in `ontology-definition-service`.

## Current request shape

Based on `CreatePropertyRequest` in `services/ontology-definition-service/internal/models/property.go`, OpenFoundry currently supports:

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | yes | stable property identifier |
| `display_name` | no | user-facing label |
| `description` | no | semantic meaning |
| `property_type` | yes | value kind |
| `required` | no | mandatory or optional |
| `unique_constraint` | no | uniqueness semantics |
| `time_dependent` | no | time-aware behavior |
| `default_value` | no | initial value |
| `validation_rules` | no | additional validation metadata |

## Current validation flow

At creation time the handler currently validates:

- non-empty property name
- allowed property type through `validate_property_type`
- default value compatibility through `validate_property_value`

## Why this matters

That means OpenFoundry is already moving beyond blind schema insertion and treating properties as semantic constructs with typed behavior.
