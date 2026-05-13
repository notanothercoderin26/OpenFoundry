import api from "./client";

// ────────────────────────────────────────────────────────────────
// Ontology API — slices grow as routes are migrated. Today: object
// types + properties listing (used by /queries). Full ontology
// surface (links, indexing, design) gets added with /ontology* routes.
// ────────────────────────────────────────────────────────────────

export interface ObjectType {
  id: string;
  rid?: string;
  name: string;
  api_name?: string;
  display_name: string;
  plural_display_name?: string | null;
  description: string;
  primary_key_property: string | null;
  primary_key?: string;
  title_property?: string | null;
  icon: string | null;
  color: string | null;
  status?: "active" | "experimental" | "deprecated" | string;
  visibility?: "normal" | "hidden" | string;
  group_names?: string[];
  object_display_preferences?: Record<string, unknown>;
  editable?: boolean;
  backing_dataset_id?: string | null;
  backing_dataset_rid?: string | null;
  pipeline_rid?: string | null;
  managed_by?: string | null;
  properties?: Property[];
  property_count?: number;
  searchable_property_names?: string[];
  geopoint_property_names?: string[];
  geoshape_property_names?: string[];
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export type PropertyDisplayMode = "hidden" | "normal" | "prominent" | string;

export interface PropertyValueFormatting {
  style?: "plain" | "number" | "currency" | "percent" | "date" | "time" | "datetime" | string;
  locale?: string;
  currency?: string;
  minimum_fraction_digits?: number;
  maximum_fraction_digits?: number;
  prefix?: string;
  suffix?: string;
  empty_value?: string;
}


export type ValueTypeEditKind = "non_breaking" | "breaking";

export interface ValueTypeConstraints {
  required?: boolean;
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  regex?: string;
  allowed_values?: unknown[];
}

export interface ValueTypeVersion {
  version: number;
  edit_kind: ValueTypeEditKind;
  note: string;
  created_by: string;
  created_at: string;
}

export interface ValueTypePermissions {
  viewers?: string[];
  appliers?: string[];
  editors?: string[];
}

export interface OntologyValueType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  space_id: string;
  base_type: string;
  semantic_type: string;
  constraints: ValueTypeConstraints;
  formatting?: PropertyValueFormatting | Record<string, unknown>;
  permissions: ValueTypePermissions;
  version: number;
  versions: ValueTypeVersion[];
  status: "active" | "deprecated" | string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface PropertyConditionalFormattingRule {
  operator?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty" | string;
  value?: unknown;
  color?: string;
  background?: string;
  font_weight?: string;
  label?: string;
}

export interface PropertyReducerMetadata {
  reducer?: "count" | "sum" | "avg" | "min" | "max" | "latest" | "earliest" | string;
  source_property?: string;
  window?: string;
  label?: string;
}

export interface PropertyInlineEditConfig {
  action_type_id?: string;
  input_name?: string | null;
  enabled?: boolean;
  permission_keys?: string[];
}

export interface Property {
  id: string;
  object_type_id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  value_type_id?: string | null;
  value_type?: OntologyValueType | null;
  shared_property_type_id?: string | null;
  base_type?: string;
  type_family?: string;
  type_display_name?: string;
  value_shape?: string;
  is_array?: boolean;
  array_item_type?: string | null;
  array_allowed?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  aggregatable?: boolean;
  primary_key_eligible?: boolean;
  title_key_eligible?: boolean;
  formatting_eligible?: boolean;
  object_security_eligible?: boolean;
  prominent_eligible?: boolean;
  semantic_hints?: string[];
  display_mode?: PropertyDisplayMode;
  value_formatting?: PropertyValueFormatting | Record<string, unknown>;
  conditional_formatting?: PropertyConditionalFormattingRule[];
  reducer_metadata?: PropertyReducerMetadata | Record<string, unknown>;
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
  default_value: unknown;
  validation_rules: unknown;
  inline_edit_config?: PropertyInlineEditConfig | null;
  created_at: string;
  updated_at: string;
}

export function objectTypeRID(
  objectType: Pick<ObjectType, "id"> & Partial<ObjectType>,
) {
  return objectType.rid || `ri.ontology.main.object-type.${objectType.id}`;
}

export function objectTypeAPIName(
  objectType: Pick<ObjectType, "name"> & Partial<ObjectType>,
) {
  return objectType.api_name || objectType.name;
}

export function objectTypePluralDisplayName(
  objectType: Pick<ObjectType, "display_name" | "name"> & Partial<ObjectType>,
) {
  if (objectType.plural_display_name?.trim())
    return objectType.plural_display_name;
  const base = objectType.display_name || objectType.name || "Objects";
  return base.toLowerCase().endsWith("s") ? base : `${base}s`;
}

export function objectTypePrimaryKey(
  objectType: Partial<ObjectType> | null | undefined,
) {
  return objectType?.primary_key || objectType?.primary_key_property || "id";
}

export function objectTypeTitleProperty(
  objectType: Partial<ObjectType> | null | undefined,
) {
  return objectType?.title_property || objectTypePrimaryKey(objectType);
}

export function objectTypeProperties(
  objectType: Partial<ObjectType> | null | undefined,
) {
  return Array.isArray(objectType?.properties) ? objectType.properties : [];
}

export function objectTypeSearchablePropertyNames(
  objectType: Partial<ObjectType> | null | undefined,
) {
  if (
    Array.isArray(objectType?.searchable_property_names) &&
    objectType.searchable_property_names.length > 0
  ) {
    return objectType.searchable_property_names;
  }
  const names = [
    objectTypeTitleProperty(objectType),
    objectTypePrimaryKey(objectType),
  ];
  for (const property of objectTypeProperties(objectType)) {
    if (isStringLikePropertyType(property.property_type))
      names.push(property.name);
  }
  return uniqueNonEmpty(names);
}

export function objectTypeGeoPointPropertyNames(
  objectType: Partial<ObjectType> | null | undefined,
) {
  if (Array.isArray(objectType?.geopoint_property_names))
    return objectType.geopoint_property_names;
  return objectTypeProperties(objectType)
    .filter((property) => isGeoPointPropertyType(property.property_type))
    .map((property) => property.name);
}

export function objectTypeGeoShapePropertyNames(
  objectType: Partial<ObjectType> | null | undefined,
) {
  if (Array.isArray(objectType?.geoshape_property_names))
    return objectType.geoshape_property_names;
  return objectTypeProperties(objectType)
    .filter((property) => isGeoShapePropertyType(property.property_type))
    .map((property) => property.name);
}

export interface PropertyTypeMetadata {
  base_type: string;
  type_family: string;
  type_display_name: string;
  value_shape: string;
  is_array: boolean;
  array_item_type: string | null;
  array_allowed: boolean;
  searchable: boolean;
  filterable: boolean;
  sortable: boolean;
  aggregatable: boolean;
  primary_key_eligible: boolean;
  title_key_eligible: boolean;
  formatting_eligible: boolean;
  object_security_eligible: boolean;
  prominent_eligible: boolean;
  semantic_hints: string[];
}

export function propertyTypeMetadata(
  property: Pick<Property, "property_type"> & Partial<Property>,
): PropertyTypeMetadata {
  const derived = derivePropertyTypeMetadata(property.property_type);
  return {
    base_type: property.base_type || derived.base_type,
    type_family: property.type_family || derived.type_family,
    type_display_name: property.type_display_name || derived.type_display_name,
    value_shape: property.value_shape || derived.value_shape,
    is_array: property.is_array ?? derived.is_array,
    array_item_type: property.array_item_type ?? derived.array_item_type,
    array_allowed: property.array_allowed ?? derived.array_allowed,
    searchable: property.searchable ?? derived.searchable,
    filterable: property.filterable ?? derived.filterable,
    sortable: property.sortable ?? derived.sortable,
    aggregatable: property.aggregatable ?? derived.aggregatable,
    primary_key_eligible:
      property.primary_key_eligible ?? derived.primary_key_eligible,
    title_key_eligible: property.title_key_eligible ?? derived.title_key_eligible,
    formatting_eligible:
      property.formatting_eligible ?? derived.formatting_eligible,
    object_security_eligible:
      property.object_security_eligible ?? derived.object_security_eligible,
    prominent_eligible: property.prominent_eligible ?? derived.prominent_eligible,
    semantic_hints: property.semantic_hints ?? derived.semantic_hints,
  };
}

export function canonicalPropertyBaseType(propertyType: string) {
  const parsedArray = parseArrayPropertyType(propertyType);
  if (parsedArray.isArray && parsedArray.itemType)
    return canonicalPropertyBaseType(parsedArray.itemType);
  const normalized = normalizedPropertyType(propertyType);
  if (["string", "str", "text"].includes(normalized)) return "string";
  if (["integer", "int", "short", "byte"].includes(normalized))
    return "integer";
  if (normalized === "long") return "long";
  if (["float", "double"].includes(normalized)) return "float";
  if (["decimal", "number", "numeric"].includes(normalized))
    return "decimal";
  if (["boolean", "bool"].includes(normalized)) return "boolean";
  if (normalized === "date") return "date";
  if (normalized === "time") return "time";
  if (["timestamp", "datetime"].includes(normalized)) return "timestamp";
  if (normalized === "json") return "json";
  if (normalized === "array") return "array";
  if (["vector", "embedding"].includes(normalized)) return "vector";
  if (["reference", "object_reference", "object_ref"].includes(normalized))
    return "reference";
  if (normalized === "geohash") return "geohash";
  if (isGeoPointPropertyType(normalized)) return "geopoint";
  if (isGeoShapePropertyType(normalized)) return "geoshape";
  if (["media_reference", "media", "mediaref"].includes(normalized))
    return "media_reference";
  if (["attachment", "file", "file_reference"].includes(normalized))
    return "attachment";
  if (["binary", "bytes"].includes(normalized)) return "binary";
  if (
    ["time_series", "timeseries", "time_series_reference"].includes(normalized)
  )
    return "time_series";
  if (normalized === "struct") return "struct";
  return normalized;
}

function derivePropertyTypeMetadata(
  propertyType: string,
): PropertyTypeMetadata {
  const parsedArray = parseArrayPropertyType(propertyType);
  const itemBaseType = parsedArray.itemType
    ? canonicalPropertyBaseType(parsedArray.itemType)
    : null;
  const baseType = parsedArray.isArray
    ? itemBaseType || "array"
    : canonicalPropertyBaseType(propertyType);
  const base = basePropertyTypeMetadata(baseType);
  if (!parsedArray.isArray) return base;
  return {
    ...base,
    base_type: "array",
    type_family: "collection",
    type_display_name: "Array",
    value_shape: "array",
    is_array: true,
    array_item_type: itemBaseType,
    searchable: base.searchable && baseType === "string",
    filterable: true,
    sortable: false,
    aggregatable: false,
    primary_key_eligible: false,
    title_key_eligible: false,
    object_security_eligible: false,
    prominent_eligible: true,
    semantic_hints: uniqueNonEmpty([
      "array",
      itemBaseType || "",
      ...base.semantic_hints,
    ]),
  };
}

function basePropertyTypeMetadata(baseType: string): PropertyTypeMetadata {
  switch (baseType) {
    case "string":
      return metadata(baseType, "primitive", "String", "string", true, true, true, false, true, true, true, true, true, true, ["string"]);
    case "integer":
      return metadata(baseType, "numeric", "Integer", "integer", true, true, true, true, false, true, false, true, true, true, ["numeric"]);
    case "long":
      return metadata(baseType, "numeric", "Long", "integer", true, true, true, true, false, true, false, true, true, true, ["numeric"]);
    case "float":
      return metadata(baseType, "numeric", "Float", "number", true, true, true, true, false, false, false, true, false, true, ["numeric"]);
    case "decimal":
      return metadata(baseType, "numeric", "Decimal", "decimal", true, true, true, true, false, false, false, true, false, true, ["numeric", "decimal"]);
    case "boolean":
      return metadata(baseType, "primitive", "Boolean", "boolean", true, true, true, false, false, false, false, true, true, true, ["boolean"]);
    case "date":
      return metadata(baseType, "temporal", "Date", "date-string", true, true, true, false, false, false, false, true, true, true, ["temporal"]);
    case "time":
      return metadata(baseType, "temporal", "Time", "time-string", true, true, true, false, false, false, false, true, true, true, ["temporal", "time"]);
    case "timestamp":
      return metadata(baseType, "temporal", "Timestamp", "timestamp-string", true, true, true, false, false, false, false, true, true, true, ["temporal"]);
    case "json":
      return metadata(baseType, "structured", "JSON", "json", true, false, false, false, false, false, false, true, false, false, ["json"]);
    case "array":
      return metadata(baseType, "collection", "Array", "array", true, true, false, false, false, false, false, true, false, false, ["array"]);
    case "vector":
      return metadata(baseType, "semantic", "Vector", "numeric-array", false, false, false, false, false, false, false, false, false, false, ["vector", "embedding"]);
    case "reference":
      return metadata(baseType, "reference", "Object reference", "string", true, true, true, false, true, false, true, true, true, true, ["reference", "object_reference"]);
    case "geohash":
      return metadata(baseType, "geospatial", "Geohash", "string", true, true, true, false, true, false, true, true, true, true, ["geospatial", "geohash"]);
    case "geopoint":
      return metadata(baseType, "geospatial", "Geopoint", "lat-lon-object", true, true, false, false, false, false, false, true, false, true, ["geospatial", "point"]);
    case "geoshape":
      return metadata(baseType, "geospatial", "Geoshape", "geojson-object-or-string", true, true, false, false, false, false, false, true, false, true, ["geospatial", "shape"]);
    case "media_reference":
      return metadata(baseType, "media", "Media reference", "media-reference", true, true, false, false, false, false, false, true, false, true, ["media"]);
    case "attachment":
      return metadata(baseType, "file", "Attachment", "attachment-reference", true, true, false, false, false, false, false, true, false, true, ["attachment", "file"]);
    case "binary":
      return metadata(baseType, "file", "Binary", "base64-string", false, false, false, false, false, false, false, false, false, false, ["binary", "file"]);
    case "time_series":
      return metadata(baseType, "timeseries", "Time series", "time-series", false, false, false, false, false, false, false, false, false, false, ["time_series", "temporal"]);
    case "struct":
      return metadata(baseType, "structured", "Struct", "object", true, false, false, false, false, false, false, true, false, false, ["struct"]);
    default:
      return metadata(baseType, "unknown", baseType || "Unknown", "unknown", true, false, false, false, false, false, false, false, false, false, []);
  }
}

function metadata(
  baseType: string,
  family: string,
  displayName: string,
  valueShape: string,
  arrayAllowed: boolean,
  filterable: boolean,
  sortable: boolean,
  aggregatable: boolean,
  searchable: boolean,
  primaryKeyEligible: boolean,
  titleKeyEligible: boolean,
  formattingEligible: boolean,
  objectSecurityEligible: boolean,
  prominentEligible: boolean,
  semanticHints: string[],
): PropertyTypeMetadata {
  return {
    base_type: baseType,
    type_family: family,
    type_display_name: displayName,
    value_shape: valueShape,
    is_array: false,
    array_item_type: null,
    array_allowed: arrayAllowed,
    searchable,
    filterable,
    sortable,
    aggregatable,
    primary_key_eligible: primaryKeyEligible,
    title_key_eligible: titleKeyEligible,
    formatting_eligible: formattingEligible,
    object_security_eligible: objectSecurityEligible,
    prominent_eligible: prominentEligible,
    semantic_hints: uniqueNonEmpty(semanticHints),
  };
}

function parseArrayPropertyType(propertyType: string) {
  const normalized = normalizedPropertyType(propertyType);
  if (normalized === "array")
    return { isArray: true, itemType: null as string | null };
  if (normalized.endsWith("[]"))
    return { isArray: true, itemType: normalized.slice(0, -2) };
  if (normalized.startsWith("array<"))
    return {
      isArray: true,
      itemType: normalized.replace(/^array</, "").replace(/>$/, "") || null,
    };
  if (normalized.startsWith("array_of_"))
    return {
      isArray: true,
      itemType: normalized.replace(/^array_of_/, "") || null,
    };
  return { isArray: false, itemType: null as string | null };
}

function normalizedPropertyType(kind: string) {
  return kind
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

function isStringLikePropertyType(kind: string) {
  const normalized = normalizedPropertyType(kind);
  return (
    ["string", "str", "text", "uuid", "rid", "object_id"].includes(
      normalized,
    ) ||
    normalized.includes("string") ||
    normalized.includes("text")
  );
}

function isGeoPointPropertyType(kind: string) {
  const normalized = normalizedPropertyType(kind);
  return (
    [
      "geopoint",
      "geo_point",
      "point",
      "latlon",
      "lat_lon",
      "latitude_longitude",
    ].includes(normalized) ||
    normalized.includes("geopoint") ||
    normalized.includes("geo_point")
  );
}

function isGeoShapePropertyType(kind: string) {
  const normalized = normalizedPropertyType(kind);
  return (
    [
      "geoshape",
      "geo_shape",
      "geometry",
      "geojson",
      "linestring",
      "line_string",
      "polygon",
      "multipolygon",
    ].includes(normalized) ||
    normalized.includes("geoshape") ||
    normalized.includes("geo_shape") ||
    normalized.includes("geometry") ||
    normalized.includes("geojson")
  );
}


function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function propertyDisplayMode(property: Partial<Property>) {
  const mode = String(property.display_mode || "normal").toLowerCase();
  return mode === "hidden" || mode === "prominent" ? mode : "normal";
}

export function objectViewVisibleProperties(properties: Property[]) {
  return properties
    .filter((property) => propertyDisplayMode(property) !== "hidden")
    .sort((left, right) => {
      const leftProminent = propertyDisplayMode(left) === "prominent" ? 0 : 1;
      const rightProminent = propertyDisplayMode(right) === "prominent" ? 0 : 1;
      return leftProminent - rightProminent;
    });
}

export function objectViewProminentProperties(properties: Property[]) {
  return properties.filter(
    (property) => propertyDisplayMode(property) === "prominent",
  );
}

export type ProminentPropertyPresentation =
  | "media"
  | "time_series"
  | "map"
  | "card";

export function prominentPropertyPresentation(
  property: Partial<Property>,
): ProminentPropertyPresentation {
  const metadata = propertyTypeMetadata({
    property_type: property.property_type || "string",
    base_type: property.base_type,
    type_family: property.type_family,
    value_shape: property.value_shape,
  });
  const hints = new Set([
    metadata.base_type,
    metadata.type_family,
    metadata.value_shape,
    ...(metadata.semantic_hints || []),
  ].map((hint) => String(hint || "").toLowerCase()));
  if (hints.has("media_reference") || hints.has("media") || hints.has("attachment-reference")) {
    return "media";
  }
  if (hints.has("time_series") || hints.has("timeseries") || hints.has("time-series")) {
    return "time_series";
  }
  if (
    hints.has("geospatial") ||
    hints.has("geopoint") ||
    hints.has("geoshape") ||
    hints.has("geojson-object-or-string") ||
    hints.has("lat-lon-object") ||
    hints.has("geohash")
  ) {
    return "map";
  }
  return "card";
}

export function formatPropertyValue(property: Partial<Property>, value: unknown) {
  const formatting = (property.value_formatting || property.value_type?.formatting || {}) as PropertyValueFormatting;
  if (value === null || value === undefined || value === "") {
    return formatting.empty_value ?? "—";
  }
  const style = formatting.style || propertyTypeMetadata({
    property_type: property.property_type || "string",
  }).value_shape;
  let rendered: string;
  if (["number", "currency", "percent", "decimal"].includes(style)) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      rendered = new Intl.NumberFormat(formatting.locale, {
        style: style === "currency" ? "currency" : style === "percent" ? "percent" : "decimal",
        currency: formatting.currency || "USD",
        minimumFractionDigits: formatting.minimum_fraction_digits,
        maximumFractionDigits: formatting.maximum_fraction_digits,
      }).format(numeric);
    } else {
      rendered = String(value);
    }
  } else if (["date", "time", "datetime", "date-string", "time-string", "timestamp-string"].includes(style)) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      if (style === "date" || style === "date-string") {
        rendered = new Intl.DateTimeFormat(formatting.locale).format(date);
      } else if (style === "time" || style === "time-string") {
        rendered = new Intl.DateTimeFormat(formatting.locale, { timeStyle: "short" }).format(date);
      } else {
        rendered = new Intl.DateTimeFormat(formatting.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
      }
    } else {
      rendered = String(value);
    }
  } else if (typeof value === "object") {
    rendered = JSON.stringify(value);
  } else {
    rendered = String(value);
  }
  return `${formatting.prefix || ""}${rendered}${formatting.suffix || ""}`;
}

function compareConditionalValue(operator: string, actual: unknown, expected: unknown) {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "empty":
      return actual === null || actual === undefined || actual === "";
    case "not_empty":
      return actual !== null && actual !== undefined && actual !== "";
    default:
      return false;
  }
}

export function propertyConditionalStyle(property: Partial<Property>, value: unknown) {
  const rules = Array.isArray(property.conditional_formatting)
    ? property.conditional_formatting
    : [];
  const match = rules.find((rule) =>
    compareConditionalValue(rule.operator || "eq", value, rule.value),
  );
  if (!match) return {};
  return {
    color: match.color,
    background: match.background,
    fontWeight: match.font_weight,
  };
}


function normalizeValueTypeName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
}

function localValueTypesKey(spaceId = "default") {
  return `of:ontology:value-types:${spaceId || "default"}`;
}

function readLocalValueTypes(spaceId = "default"): OntologyValueType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localValueTypesKey(spaceId));
    const parsed = raw ? (JSON.parse(raw) as OntologyValueType[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalValueTypes(items: OntologyValueType[], spaceId = "default") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localValueTypesKey(spaceId), JSON.stringify(items));
}

export function listValueTypes(params?: { space_id?: string; search?: string; status?: string }) {
  const spaceId = params?.space_id || "default";
  const query = (params?.search || "").trim().toLowerCase();
  const data = readLocalValueTypes(spaceId).filter((valueType) => {
    const matchesQuery = !query || [valueType.name, valueType.display_name, valueType.description, valueType.semantic_type]
      .some((value) => String(value || "").toLowerCase().includes(query));
    const matchesStatus = !params?.status || valueType.status === params.status;
    return matchesQuery && matchesStatus;
  });
  return Promise.resolve({ data, total: data.length, page: 1, per_page: data.length || 100 });
}

export function createValueType(body: {
  name: string;
  display_name?: string;
  description?: string;
  space_id?: string;
  base_type: string;
  semantic_type?: string;
  constraints?: ValueTypeConstraints;
  formatting?: PropertyValueFormatting | Record<string, unknown>;
  permissions?: ValueTypePermissions;
}) {
  const now = new Date().toISOString();
  const spaceId = body.space_id || "default";
  const name = normalizeValueTypeName(body.name || body.display_name || "value_type");
  const next: OntologyValueType = {
    id: `value-type:${spaceId}:${name}`,
    name,
    display_name: body.display_name || body.name || name,
    description: body.description || "",
    space_id: spaceId,
    base_type: body.base_type,
    semantic_type: body.semantic_type || name,
    constraints: body.constraints || {},
    formatting: body.formatting || {},
    permissions: body.permissions || { viewers: [], appliers: [], editors: [] },
    version: 1,
    versions: [{ version: 1, edit_kind: "non_breaking", note: "Initial version", created_by: "local", created_at: now }],
    status: "active",
    owner_id: "local",
    created_at: now,
    updated_at: now,
  };
  const existing = readLocalValueTypes(spaceId).filter((item) => item.id !== next.id && item.name !== next.name);
  writeLocalValueTypes([next, ...existing], spaceId);
  return Promise.resolve(next);
}

export function updateValueType(
  id: string,
  body: Partial<Omit<OntologyValueType, "id" | "versions" | "created_at">> & { edit_kind?: ValueTypeEditKind; note?: string },
) {
  const spaceId = body.space_id || id.split(":")[1] || "default";
  const items = readLocalValueTypes(spaceId);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return Promise.reject(new Error("value type not found"));
  const now = new Date().toISOString();
  const current = items[index];
  const editKind = body.edit_kind || "non_breaking";
  const nextVersion = editKind === "breaking" ? current.version + 1 : current.version;
  const next: OntologyValueType = {
    ...current,
    ...body,
    id: current.id,
    version: nextVersion,
    versions: editKind === "breaking"
      ? [{ version: nextVersion, edit_kind: editKind, note: body.note || "Breaking edit", created_by: "local", created_at: now }, ...current.versions]
      : current.versions,
    updated_at: now,
  };
  items[index] = next;
  writeLocalValueTypes(items, spaceId);
  return Promise.resolve(next);
}

export function deleteValueType(id: string, spaceId = "default") {
  writeLocalValueTypes(readLocalValueTypes(spaceId).filter((item) => item.id !== id), spaceId);
  return Promise.resolve();
}

export function validateValueAgainstValueType(value: unknown, valueType?: OntologyValueType | null): string[] {
  if (!valueType) return [];
  const constraints = valueType.constraints || {};
  const errors: string[] = [];
  if (constraints.required && (value === null || value === undefined || value === "")) errors.push(`${valueType.display_name} is required.`);
  if (value === null || value === undefined || value === "") return errors;
  const numeric = Number(value);
  if (constraints.min !== undefined && Number.isFinite(numeric) && numeric < constraints.min) errors.push(`${valueType.display_name} must be at least ${constraints.min}.`);
  if (constraints.max !== undefined && Number.isFinite(numeric) && numeric > constraints.max) errors.push(`${valueType.display_name} must be at most ${constraints.max}.`);
  const text = String(value);
  if (constraints.min_length !== undefined && text.length < constraints.min_length) errors.push(`${valueType.display_name} must be at least ${constraints.min_length} characters.`);
  if (constraints.max_length !== undefined && text.length > constraints.max_length) errors.push(`${valueType.display_name} must be at most ${constraints.max_length} characters.`);
  if (constraints.regex) {
    try {
      if (!new RegExp(constraints.regex).test(text)) errors.push(`${valueType.display_name} does not match ${constraints.regex}.`);
    } catch {
      errors.push(`${valueType.display_name} has an invalid regular expression constraint.`);
    }
  }
  if (Array.isArray(constraints.allowed_values) && constraints.allowed_values.length > 0) {
    const allowed = constraints.allowed_values.some((candidate) => String(candidate) === text);
    if (!allowed) errors.push(`${valueType.display_name} must be one of ${constraints.allowed_values.join(", ")}.`);
  }
  return errors;
}

export function validatePropertyValueType(property: Partial<Property>, value: unknown) {
  return validateValueAgainstValueType(value, property.value_type);
}

export function valueTypeUsageSummary(
  valueTypeId: string,
  input: { objectTypes?: ObjectType[]; sharedPropertyTypes?: SharedPropertyType[]; interfaces?: OntologyInterface[] },
) {
  const objectProperties = (input.objectTypes || []).flatMap((objectType) =>
    (objectType.properties || [])
      .filter((property) => property.value_type_id === valueTypeId)
      .map((property) => ({ object_type_id: objectType.id, property_name: property.name })),
  );
  const sharedProperties = (input.sharedPropertyTypes || []).filter((property) => property.value_type_id === valueTypeId);
  const interfaceProperties = (input.interfaces || []).flatMap((iface) =>
    (iface.properties || [])
      .filter((property) => property.value_type_id === valueTypeId)
      .map((property) => ({ interface_id: iface.id, property_name: property.name })),
  );
  return {
    object_properties: objectProperties,
    shared_properties: sharedProperties,
    interface_properties: interfaceProperties,
    total: objectProperties.length + sharedProperties.length + interfaceProperties.length,
  };
}

export function sharedPropertyUsageSummary(
  sharedPropertyId: string,
  input: { objectTypes?: ObjectType[]; interfaces?: OntologyInterface[] },
) {
  const objectTypeIds = (input.objectTypes || [])
    .filter((objectType) =>
      (objectType.properties || []).some((property) => property.shared_property_type_id === sharedPropertyId) ||
      (objectType as ObjectType & { shared_property_type_ids?: string[] }).shared_property_type_ids?.includes(sharedPropertyId),
    )
    .map((objectType) => objectType.id);
  const interfaceIds = (input.interfaces || [])
    .filter((iface) => (iface.properties || []).some((property) => property.shared_property_type_id === sharedPropertyId))
    .map((iface) => iface.id);
  return { object_type_ids: objectTypeIds, interface_ids: interfaceIds, total: objectTypeIds.length + interfaceIds.length };
}

export function sharedPropertyImpactWarning(sharedProperty: SharedPropertyType, usage: { total: number }) {
  if (usage.total <= 1) return "";
  return `Editing ${sharedProperty.display_name || sharedProperty.name} affects ${usage.total} object/interface bindings.`;
}

export function listObjectTypes(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: ObjectType[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/types${qs.toString() ? `?${qs}` : ""}`);
}

export function listProperties(typeId: string) {
  return api
    .get<{ data: Property[] }>(`/ontology/types/${typeId}/properties`)
    .then((response) => response.data);
}

// ────────────────────────────────────────────────────────────────
// Object instances + ontology graph + Quiver visual functions
// (used by /quiver). Other ontology surfaces ship with their routes.
// ────────────────────────────────────────────────────────────────

export interface ObjectInstance {
  id: string;
  object_type_id: string;
  properties: Record<string, unknown>;
  created_by: string;
  organization_id?: string | null;
  marking?: string;
  created_at: string;
  updated_at: string;
}

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  secondary_label: string | null;
  color: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  kind: string;
  source: string;
  target: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphSummary {
  scope: string;
  node_kinds: Record<string, number>;
  edge_kinds: Record<string, number>;
  object_types: Record<string, number>;
  markings: Record<string, number>;
  root_neighbor_count: number;
  max_hops_reached: number;
  boundary_crossings: number;
  sensitive_objects: number;
  sensitive_markings: string[];
}

export interface GraphResponse {
  mode: string;
  root_object_id: string | null;
  root_type_id: string | null;
  depth: number;
  total_nodes: number;
  total_edges: number;
  summary: GraphSummary;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type QuiverChartKind = "line" | "area" | "bar" | "point";

export interface QuiverVisualFunction {
  id: string;
  name: string;
  description: string;
  primary_type_id: string;
  secondary_type_id: string | null;
  join_field: string;
  secondary_join_field: string;
  date_field: string;
  metric_field: string;
  group_field: string;
  selected_group: string | null;
  chart_kind: QuiverChartKind;
  shared: boolean;
  vega_spec: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export function getObjectType(id: string) {
  return api.get<ObjectType>(`/ontology/types/${id}`);
}

export function executeInlineEdit(
  typeId: string,
  objectId: string,
  propertyId: string,
  body: { value: unknown; justification?: string },
) {
  return api.post<ExecuteActionResponse>(
    `/ontology/types/${typeId}/properties/${propertyId}/objects/${objectId}/inline-edit`,
    body,
  );
}

export interface ObjectQueryFilter {
  property_name: string;
  operator?:
    | "equals"
    | "not_equals"
    | "contains"
    | "gte"
    | "lte"
    | "gt"
    | "lt"
    | "in"
    | "is_empty"
    | "is_not_empty"
    | string;
  value?: unknown;
}

export interface ObjectQuerySort {
  property_name: string;
  direction?: "asc" | "desc" | string;
}

export type ObjectSetAggregationFunction =
  | "count"
  | "sum"
  | "avg"
  | "average"
  | "min"
  | "max"
  | "distinct_count"
  | "approx_distinct"
  | string;

export interface ObjectSetAggregationSpec {
  id?: string;
  alias?: string;
  function: ObjectSetAggregationFunction;
  property_name?: string;
}

export interface ObjectSetAggregationResult {
  id: string;
  alias?: string;
  function: string;
  property_name?: string;
  value: number | null;
  count: number;
}

export interface ObjectQueryBody {
  equals?: Record<string, unknown>;
  filters?: ObjectQueryFilter[];
  limit?: number;
  page?: number;
  per_page?: number;
  sort?: ObjectQuerySort[];
  include_count?: boolean;
  aggregations?: ObjectSetAggregationSpec[];
  selected_object_ids?: string[];
  search_around?: ObjectSearchAroundQuery;
  knn?: ObjectKnnQuery;
}

export interface ObjectSearchAroundQuery {
  source_object_ids: string[];
  link_type_id?: string;
  link_type_ids?: string[];
  direction?: "outgoing" | "incoming" | "both" | string;
  depth?: number;
  target_object_type_id?: string;
}

export interface LinkedObjectEdge {
  link_id: string;
  link_type_id: string;
  source_object_id: string;
  target_object_id: string;
  direction?: "outgoing" | "incoming" | "both" | string;
  depth?: number;
  properties?: Record<string, unknown>;
}

export interface ObjectKnnQuery {
  property_name: string;
  vector: number[];
  k?: number;
  k_value?: number;
  metric?: "cosine" | "euclidean" | "dot" | string;
}

export interface ObjectKnnResult {
  object_id: string;
  rank: number;
  score: number;
  distance: number;
  metric: string;
  property_name: string;
}

export interface ObjectQueryResponse {
  data: ObjectInstance[];
  total: number;
  count?: number;
  page?: number;
  per_page?: number;
  aggregations?: ObjectSetAggregationResult[];
  linked_edges?: LinkedObjectEdge[];
  knn_results?: ObjectKnnResult[];
  object_set?: {
    object_type_id: string;
    filters?: ObjectQueryFilter[];
    sort?: ObjectQuerySort[];
    limit?: number;
    selected_object_ids?: string[];
    search_around?: ObjectSearchAroundQuery | null;
    knn?: ObjectKnnQuery | null;
  };
}

export function queryObjects(typeId: string, body: ObjectQueryBody) {
  return api.post<ObjectQueryResponse>(
    `/ontology/types/${typeId}/objects/query`,
    body,
  );
}

export type SubmissionUserAttr =
  | "user_id"
  | "email"
  | "organization_id"
  | "roles"
  | "permissions"
  | "auth_methods";

export type SubmissionOperator =
  | "is"
  | "is_not"
  | "matches"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "includes"
  | "includes_any"
  | "is_included_in"
  | "each_is"
  | "each_is_not"
  | "is_empty"
  | "is_not_empty";

export type SubmissionOperand =
  | { kind: "static"; value: unknown }
  | { kind: "param"; name: string }
  | { kind: "user"; attr: SubmissionUserAttr };

export type SubmissionNode =
  | {
      type: "leaf";
      left: SubmissionOperand;
      op: SubmissionOperator;
      right?: SubmissionOperand;
    }
  | { type: "all"; children: SubmissionNode[] }
  | { type: "any"; children: SubmissionNode[] };

export interface ObjectRevision {
  id: string;
  object_id: string;
  object_type_id: string;
  operation: "insert" | "update" | "delete" | string;
  properties: Record<string, unknown>;
  marking: string;
  organization_id?: string | null;
  changed_by: string;
  revision_number: number;
  written_at: string;
}

export interface ListObjectRevisionsResponse {
  object_id: string;
  total: number;
  data: ObjectRevision[];
}

export interface RestoreObjectRevisionResponse {
  object: ObjectInstance;
  restored_from_revision_number: number;
  new_revision_number: number;
}

export function listObjectRevisions(
  typeId: string,
  objectId: string,
  params?: { limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  const tail = qs.toString() ? `?${qs}` : "";
  return api.get<ListObjectRevisionsResponse>(
    `/ontology/types/${typeId}/objects/${objectId}/revisions${tail}`,
  );
}

export function restoreObjectRevision(
  typeId: string,
  objectId: string,
  revisionNumber: number,
) {
  return api.post<RestoreObjectRevisionResponse>(
    `/ontology/types/${typeId}/objects/${objectId}/revisions/${revisionNumber}/restore`,
    {},
  );
}

export interface InlineEditBatchEntry {
  property_id: string;
  object_id: string;
  value: unknown;
  justification?: string;
}

export interface InlineEditBatchResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: {
    property_id: string;
    object_id: string;
    status: "success" | "failure";
    error?: string;
  }[];
}

export function executeInlineEditBatch(
  typeId: string,
  edits: InlineEditBatchEntry[],
) {
  return api.post<InlineEditBatchResponse>(
    `/ontology/types/${typeId}/inline-edit-batch`,
    { edits },
  );
}

export interface RevertActionExecutionResponse {
  execution_id: string;
  reverted: boolean;
  message: string | null;
}

export function revertActionExecution(executionId: string) {
  return api.post<RevertActionExecutionResponse>(
    `/ontology/actions/executions/${executionId}/revert`,
    {},
  );
}

export function createObject(
  typeId: string,
  body: { properties: Record<string, unknown> },
) {
  return api.post<ObjectInstance>(`/ontology/types/${typeId}/objects`, body);
}

export function deleteObject(typeId: string, objectId: string) {
  return api.delete(`/ontology/types/${typeId}/objects/${objectId}`);
}

export function listObjects(
  typeId: string,
  params?: { page?: number; per_page?: number },
) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: ObjectInstance[];
    total: number;
    page?: number;
    per_page?: number;
  }>(`/ontology/types/${typeId}/objects${qs.toString() ? `?${qs}` : ""}`);
}

export function getObject(typeId: string, objectId: string) {
  return api.get<ObjectInstance>(
    `/ontology/types/${typeId}/objects/${objectId}`,
  );
}

export function getOntologyGraph(params?: {
  root_object_id?: string;
  root_type_id?: string;
  depth?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.root_object_id) qs.set("root_object_id", params.root_object_id);
  if (params?.root_type_id) qs.set("root_type_id", params.root_type_id);
  if (params?.depth) qs.set("depth", String(params.depth));
  if (params?.limit) qs.set("limit", String(params.limit));
  return api.get<GraphResponse>(
    `/ontology/graph${qs.toString() ? `?${qs}` : ""}`,
  );
}

export function listQuiverVisualFunctions(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  include_shared?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  if (typeof params?.include_shared === "boolean") {
    qs.set("include_shared", params.include_shared ? "true" : "false");
  }
  return api.get<{
    data: QuiverVisualFunction[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/quiver/visual-functions${qs.toString() ? `?${qs}` : ""}`);
}

export function createQuiverVisualFunction(body: {
  name: string;
  description?: string;
  primary_type_id: string;
  secondary_type_id?: string | null;
  join_field: string;
  secondary_join_field?: string;
  date_field: string;
  metric_field: string;
  group_field: string;
  selected_group?: string | null;
  chart_kind?: QuiverChartKind;
  shared?: boolean;
}) {
  return api.post<QuiverVisualFunction>(
    "/ontology/quiver/visual-functions",
    body,
  );
}

export function updateQuiverVisualFunction(
  id: string,
  body: Partial<{
    name: string;
    description: string;
    primary_type_id: string;
    secondary_type_id: string | null;
    join_field: string;
    secondary_join_field: string;
    date_field: string;
    metric_field: string;
    group_field: string;
    selected_group: string | null;
    chart_kind: QuiverChartKind;
    shared: boolean;
  }>,
) {
  return api.patch<QuiverVisualFunction>(
    `/ontology/quiver/visual-functions/${id}`,
    body,
  );
}

export function deleteQuiverVisualFunction(id: string) {
  return api.delete(`/ontology/quiver/visual-functions/${id}`);
}

// ────────────────────────────────────────────────────────────────
// Vertex slice — search, neighbors, scenario simulation. Used by
// /vertex; future ontology routes can extend the same module.
// ────────────────────────────────────────────────────────────────

function compactObjectId(id: string, length = 12) {
  return id.length > length ? `${id.slice(0, length)}...` : id;
}

export function objectViewTitle(object: ObjectInstance | null | undefined, objectType?: ObjectType | null) {
  if (!object) return "Object detail";
  const titleProperty = objectType?.title_property || objectType?.primary_key_property;
  if (titleProperty && object.properties?.[titleProperty] !== undefined && object.properties[titleProperty] !== null && object.properties[titleProperty] !== "") {
    return String(object.properties[titleProperty]);
  }
  for (const key of ["name", "title", "display_name", "label"]) {
    const value = object.properties?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return compactObjectId(object.id);
}

export function objectViewPrimaryKey(object: ObjectInstance | null | undefined, objectType?: ObjectType | null) {
  if (!object) return "-";
  const primaryKeyProperty = objectType?.primary_key_property;
  if (primaryKeyProperty && object.properties?.[primaryKeyProperty] !== undefined && object.properties[primaryKeyProperty] !== null) {
    return String(object.properties[primaryKeyProperty]);
  }
  return object.id;
}

export function objectViewFullHref(objectOrTypeId: ObjectInstance | string, objectId?: string) {
  const typeId = typeof objectOrTypeId === "string" ? objectOrTypeId : objectOrTypeId.object_type_id;
  const id = typeof objectOrTypeId === "string" ? objectId : objectOrTypeId.id;
  return id
    ? `/ontology/${encodeURIComponent(typeId)}?object=${encodeURIComponent(id)}`
    : `/ontology/${encodeURIComponent(typeId)}`;
}

export interface NeighborLink {
  direction: "inbound" | "outbound";
  link_id: string;
  link_type_id: string;
  link_name: string;
  object: ObjectInstance;
}

export interface LinkedObjectGroup {
  link_type_id: string;
  link_name: string;
  link_type?: LinkType;
  outbound: NeighborLink[];
  inbound: NeighborLink[];
  items: NeighborLink[];
}

export function groupLinkedObjectsByLinkType(
  neighbors: NeighborLink[],
  linkTypes: LinkType[] = [],
): LinkedObjectGroup[] {
  const linkTypeByID = new Map(linkTypes.map((linkType) => [linkType.id, linkType]));
  const groups = new Map<string, LinkedObjectGroup>();
  for (const neighbor of neighbors) {
    const linkType = linkTypeByID.get(neighbor.link_type_id);
    if (linkType?.visibility === "hidden") continue;
    const existing = groups.get(neighbor.link_type_id) ?? {
      link_type_id: neighbor.link_type_id,
      link_name: linkType?.display_name || neighbor.link_name || neighbor.link_type_id,
      link_type: linkType,
      outbound: [],
      inbound: [],
      items: [],
    };
    existing.items.push(neighbor);
    if (neighbor.direction === "outbound") existing.outbound.push(neighbor);
    else existing.inbound.push(neighbor);
    groups.set(neighbor.link_type_id, existing);
  }
  return Array.from(groups.values()).sort((left, right) =>
    left.link_name.localeCompare(right.link_name),
  );
}

export interface SearchResult {
  kind: string;
  id: string;
  object_type_id: string | null;
  title: string;
  subtitle: string | null;
  snippet: string;
  score: number;
  route: string;
  metadata: Record<string, unknown>;
  score_breakdown?: {
    fusion_strategy: string;
    lexical_rank: number | null;
    semantic_rank: number | null;
    lexical_score: number;
    semantic_score: number;
    title_bonus: number;
  };
}

export interface ScenarioSimulationOperation {
  label?: string | null;
  target_object_id?: string | null;
  action_id?: string | null;
  action_parameters?: Record<string, unknown>;
  properties_patch?: Record<string, unknown>;
}

export interface ScenarioSimulationCandidate {
  name: string;
  description?: string | null;
  operations: ScenarioSimulationOperation[];
}

export interface ScenarioSummary {
  impacted_object_count: number;
  changed_object_count: number;
  deleted_object_count: number;
  automatic_rule_matches: number;
  automatic_rule_applications: number;
  advisory_rule_matches: number;
  schedule_count: number;
  impacted_types: string[];
  changed_properties: string[];
  boundary_crossings: number;
  sensitive_objects: number;
  failed_constraints: number;
  achieved_goals: number;
  total_goals: number;
  goal_score: number;
}

export interface ScenarioSimulationResult {
  scenario_id: string;
  name: string;
  description: string | null;
  graph: GraphResponse;
  summary: ScenarioSummary;
}

export interface ObjectScenarioSimulationResponse {
  root_object_id: string;
  root_type_id: string;
  compared_at: string;
  baseline: ScenarioSimulationResult | null;
  scenarios: ScenarioSimulationResult[];
}

export function searchOntology(body: {
  query: string;
  kind?: string;
  object_type_id?: string;
  limit?: number;
  semantic?: boolean;
  hybrid_strategy?: "rrf" | "weighted";
  embedding_provider?: string;
  semantic_candidate_limit?: number;
}) {
  return api.post<{ query: string; total: number; data: SearchResult[] }>(
    "/ontology/search",
    body,
  );
}

export function listNeighbors(typeId: string, objectId: string) {
  return api
    .get<{
      data: NeighborLink[];
    }>(`/ontology/types/${typeId}/objects/${objectId}/neighbors`)
    .then((response) => response.data);
}

export function simulateObjectScenarios(
  typeId: string,
  objectId: string,
  body: {
    scenarios: ScenarioSimulationCandidate[];
    depth?: number;
    include_baseline?: boolean;
  },
) {
  return api.post<ObjectScenarioSimulationResponse>(
    `/ontology/types/${typeId}/objects/${objectId}/scenarios/simulate`,
    body,
  );
}

// ────────────────────────────────────────────────────────────────
// Storage insights — used by /object-databases. Reflects PostgreSQL
// table metrics, index definitions, search projections, and runtime
// activity timestamps from the ontology runtime.
// ────────────────────────────────────────────────────────────────

export interface OntologyStorageTableMetric {
  key: string;
  table_name: string;
  label: string;
  role: string;
  record_count: number;
}

export interface OntologyStorageIndexDefinition {
  table_name: string;
  index_name: string;
  index_definition: string;
}

export interface OntologyStorageDistributionMetric {
  id: string;
  label: string;
  count: number;
}

export interface OntologyStorageSearchKindMetric {
  kind: string;
  count: number;
}

export interface OntologyStorageInsights {
  database_backend: string;
  access_driver: string;
  graph_projection: string;
  search_projection: string;
  funnel_runtime: string;
  table_metrics: OntologyStorageTableMetric[];
  index_definitions: OntologyStorageIndexDefinition[];
  object_type_distribution: OntologyStorageDistributionMetric[];
  link_type_distribution: OntologyStorageDistributionMetric[];
  search_documents_total: number;
  search_documents_by_kind: OntologyStorageSearchKindMetric[];
  latest_object_write_at: string | null;
  latest_link_write_at: string | null;
  latest_funnel_run_at: string | null;
}

export function getOntologyStorageInsights() {
  return api.get<OntologyStorageInsights>("/ontology/storage/insights");
}

// ────────────────────────────────────────────────────────────────
// Link types, interfaces, action types, and projects — used by
// /ontology-design (and incoming routes that touch the broader
// ontology surface).
// ────────────────────────────────────────────────────────────────

export type OntologyAccessMode = "private" | "shared";

export interface OntologyOrganizationVisibility {
  id: string;
  display_name: string;
  marking: string;
}

export interface OntologyLinkedResourceSummary {
  resource_kind: string;
  count: number;
}

export interface OntologySpacePlacement {
  space_slug: string;
  project_id: string | null;
  project_display_name: string;
  folder_path: string;
}

export interface OntologyArtifact {
  id: string;
  api_name: string;
  display_name: string;
  description: string;
  owning_space_slug: string;
  access_mode: OntologyAccessMode;
  organizations: OntologyOrganizationVisibility[];
  placement: OntologySpacePlacement;
  linked_resources: OntologyLinkedResourceSummary[];
  created_at: string | null;
  updated_at: string | null;
}

export interface DeriveOntologyArtifactInput {
  projects: OntologyProject[];
  resourceBindings?: OntologyProjectResourceBinding[];
  objectTypeCount?: number;
  linkTypeCount?: number;
  interfaceCount?: number;
  sharedPropertyTypeCount?: number;
}

export function deriveOntologyArtifact(
  input: DeriveOntologyArtifactInput,
): OntologyArtifact {
  const projects = input.projects;
  const primaryProject = projects[0] ?? null;
  const spaceSlug = primaryProject?.workspace_slug?.trim() || "sandbox";
  const organizations = deriveOntologyOrganizations(projects, spaceSlug);
  const linkedResources = summarizeOntologyLinkedResources(input);

  return {
    id: `ontology.${spaceSlug}`,
    api_name: spaceSlug.replace(/[^a-zA-Z0-9_]/g, "_"),
    display_name:
      primaryProject?.display_name?.trim() ||
      `${titleCaseSlug(spaceSlug)} Ontology`,
    description:
      primaryProject?.description?.trim() ||
      "Space-scoped ontology artifact generated from OpenFoundry project placement and resource bindings.",
    owning_space_slug: spaceSlug,
    access_mode: organizations.length > 1 ? "shared" : "private",
    organizations,
    placement: {
      space_slug: spaceSlug,
      project_id: primaryProject?.id ?? null,
      project_display_name:
        primaryProject?.display_name ||
        primaryProject?.slug ||
        "Sandbox project",
      folder_path: `/${spaceSlug}/ontology`,
    },
    linked_resources: linkedResources,
    created_at: primaryProject?.created_at ?? null,
    updated_at: primaryProject?.updated_at ?? null,
  };
}

export function summarizeOntologyLinkedResources(
  input: DeriveOntologyArtifactInput,
): OntologyLinkedResourceSummary[] {
  const counts = new Map<string, number>();
  const add = (kind: string, count: number | undefined) => {
    if (!count || count < 1) return;
    counts.set(kind, (counts.get(kind) ?? 0) + count);
  };

  add("object_type", input.objectTypeCount);
  add("link_type", input.linkTypeCount);
  add("interface", input.interfaceCount);
  add("shared_property_type", input.sharedPropertyTypeCount);
  for (const binding of input.resourceBindings ?? [])
    add(binding.resource_kind, 1);

  return [...counts.entries()]
    .map(([resource_kind, count]) => ({ resource_kind, count }))
    .sort((a, b) => a.resource_kind.localeCompare(b.resource_kind));
}

function deriveOntologyOrganizations(
  projects: OntologyProject[],
  fallbackSpaceSlug: string,
): OntologyOrganizationVisibility[] {
  const slugs = uniqueNonEmpty(
    projects.map((project) => project.workspace_slug || fallbackSpaceSlug),
  );
  const effectiveSlugs = slugs.length > 0 ? slugs : [fallbackSpaceSlug];
  return effectiveSlugs.map((slug) => ({
    id: `org.${slug}`,
    display_name: `${titleCaseSlug(slug)} organization`,
    marking: slug,
  }));
}

function titleCaseSlug(slug: string) {
  return (
    slug
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Sandbox"
  );
}

export type OntologyResourceRegistryKind =
  | "object_type"
  | "link_type"
  | "action_type"
  | "interface"
  | "shared_property_type"
  | "object_type_group"
  | "core_object_view"
  | "custom_object_view"
  | "datasource_registration";

export interface OntologyObjectTypeGroupSummary {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  visibility?: string;
  status?: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
  object_type_ids?: string[];
  object_type_count?: number;
  project_id?: string | null;
}

export interface OntologyObjectTypeGroup extends OntologyObjectTypeGroupSummary {
  description: string;
  visibility: string;
  status: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  object_type_ids: string[];
  object_type_count: number;
}

export interface OntologyResourceRegistryEntry {
  id: string;
  resource_kind: OntologyResourceRegistryKind;
  resource_id: string;
  api_name: string;
  display_name: string;
  plural_display_name?: string | null;
  description: string;
  project_id: string | null;
  project_display_name: string;
  folder_path: string;
  visibility: string;
  status: string;
  branch_state: string;
  usage_count: number;
  last_edited_at: string | null;
  last_edited_by: string | null;
  backing_datasource_id?: string | null;
  linked_resource_count: number;
}

export interface BuildOntologyResourceRegistryInput {
  ontology: OntologyArtifact;
  projects: OntologyProject[];
  resourceBindings?: OntologyProjectResourceBinding[];
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
  interfaces: OntologyInterface[];
  sharedPropertyTypes: SharedPropertyType[];
  objectTypeGroups?: OntologyObjectTypeGroupSummary[];
  objectViews: ObjectViewDefinition[];
}

export function buildOntologyResourceRegistry(
  input: BuildOntologyResourceRegistryInput,
): OntologyResourceRegistryEntry[] {
  const projectByID = new Map(
    input.projects.map((project) => [project.id, project]),
  );
  const bindingByResource = new Map(
    (input.resourceBindings ?? []).map((binding) => [
      registryBindingKey(binding.resource_kind, binding.resource_id),
      binding,
    ]),
  );
  const objectTypeByID = new Map(
    input.objectTypes.map((objectType) => [objectType.id, objectType]),
  );

  const entries: OntologyResourceRegistryEntry[] = [];
  for (const objectType of input.objectTypes) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("object_type", objectType.id),
        ),
        kind: "object_type",
        resourceID: objectType.id,
        apiName: objectTypeAPIName(objectType),
        displayName: objectType.display_name,
        pluralDisplayName: objectTypePluralDisplayName(objectType),
        description: objectType.description,
        visibility: objectType.visibility,
        status: objectType.status,
        lastEditedAt: objectType.updated_at,
        lastEditedBy: objectType.owner_id,
        usageCount: countObjectTypeUsage(objectType.id, input),
        linkedResourceCount: input.linkTypes.filter(
          (link) =>
            link.source_type_id === objectType.id ||
            link.target_type_id === objectType.id,
        ).length,
        backingDatasourceID:
          objectType.backing_dataset_id ||
          objectType.backing_dataset_rid ||
          null,
      }),
    );
    const datasourceID =
      objectType.backing_dataset_id || objectType.backing_dataset_rid;
    if (datasourceID) {
      entries.push(
        registryEntry({
          ontology: input.ontology,
          projectByID,
          binding: bindingByResource.get(
            registryBindingKey("object_type", objectType.id),
          ),
          kind: "datasource_registration",
          resourceID: `${objectType.id}:${datasourceID}`,
          apiName: `${objectTypeAPIName(objectType)}Datasource`,
          displayName: `${objectType.display_name} datasource`,
          pluralDisplayName: null,
          description: `Backing datasource registration for ${objectType.display_name}.`,
          visibility: objectType.visibility,
          status: objectType.status,
          lastEditedAt: objectType.updated_at,
          lastEditedBy: objectType.owner_id,
          usageCount: 1,
          linkedResourceCount: 1,
          backingDatasourceID: datasourceID,
        }),
      );
    }
  }

  for (const linkType of input.linkTypes) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("link_type", linkType.id),
        ),
        kind: "link_type",
        resourceID: linkType.id,
        apiName: linkType.name,
        displayName: linkType.display_name,
        pluralDisplayName: null,
        description: linkType.description,
        visibility: linkType.visibility || "normal",
        status: "active",
        lastEditedAt: linkType.updated_at,
        lastEditedBy: linkType.owner_id,
        usageCount: 0,
        linkedResourceCount: [
          linkType.source_type_id,
          linkType.target_type_id,
        ].filter((id) => objectTypeByID.has(id)).length,
      }),
    );
  }

  for (const actionType of input.actionTypes) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("action_type", actionType.id),
        ),
        kind: "action_type",
        resourceID: actionType.id,
        apiName: actionType.name,
        displayName: actionType.display_name,
        pluralDisplayName: null,
        description: actionType.description,
        visibility: "normal",
        status: "active",
        lastEditedAt: actionType.updated_at,
        lastEditedBy: actionType.owner_id,
        usageCount: 0,
        linkedResourceCount: actionType.object_type_id ? 1 : 0,
      }),
    );
  }

  for (const iface of input.interfaces) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("interface", iface.id),
        ),
        kind: "interface",
        resourceID: iface.id,
        apiName: iface.name,
        displayName: iface.display_name,
        pluralDisplayName: null,
        description: iface.description,
        visibility: "normal",
        status: "active",
        lastEditedAt: iface.updated_at,
        lastEditedBy: iface.owner_id,
        usageCount: 0,
        linkedResourceCount: 0,
      }),
    );
  }

  for (const shared of input.sharedPropertyTypes) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("shared_property_type", shared.id),
        ),
        kind: "shared_property_type",
        resourceID: shared.id,
        apiName: shared.name,
        displayName: shared.display_name,
        pluralDisplayName: null,
        description: shared.description,
        visibility: "normal",
        status: "active",
        lastEditedAt: shared.updated_at,
        lastEditedBy: shared.owner_id,
        usageCount: 0,
        linkedResourceCount: 0,
      }),
    );
  }

  for (const group of input.objectTypeGroups ?? []) {
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(
          registryBindingKey("object_type_group", group.id),
        ),
        kind: "object_type_group",
        resourceID: group.id,
        apiName: group.name,
        displayName: group.display_name,
        pluralDisplayName: null,
        description: group.description || "",
        visibility: group.visibility,
        status: group.status,
        lastEditedAt: group.updated_at || group.created_at || null,
        lastEditedBy: group.owner_id || null,
        usageCount: group.object_type_count ?? group.object_type_ids?.length ?? 0,
        linkedResourceCount: group.object_type_count ?? group.object_type_ids?.length ?? 0,
      }),
    );
  }

  for (const view of input.objectViews) {
    const kind: OntologyResourceRegistryKind =
      view.mode === "standard" ? "core_object_view" : "custom_object_view";
    entries.push(
      registryEntry({
        ontology: input.ontology,
        projectByID,
        binding: bindingByResource.get(registryBindingKey(kind, view.id)),
        kind,
        resourceID: view.id,
        apiName: view.name,
        displayName: view.display_name || view.name,
        pluralDisplayName: null,
        description: view.description || "",
        visibility: view.published === false ? "hidden" : "normal",
        status: view.status || (view.published === false ? "draft" : "active"),
        lastEditedAt: view.updated_at || view.created_at || null,
        lastEditedBy: view.owner_id || view.created_by || null,
        usageCount: 0,
        linkedResourceCount: view.object_type_id ? 1 : 0,
      }),
    );
  }

  return entries.sort(
    (a, b) =>
      a.resource_kind.localeCompare(b.resource_kind) ||
      a.display_name.localeCompare(b.display_name),
  );
}

function registryBindingKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

function countObjectTypeUsage(
  objectTypeID: string,
  input: BuildOntologyResourceRegistryInput,
) {
  return (
    input.linkTypes.filter(
      (link) =>
        link.source_type_id === objectTypeID ||
        link.target_type_id === objectTypeID,
    ).length +
    input.actionTypes.filter((action) => action.object_type_id === objectTypeID)
      .length +
    input.objectViews.filter((view) => view.object_type_id === objectTypeID)
      .length
  );
}

function registryEntry({
  ontology,
  projectByID,
  binding,
  kind,
  resourceID,
  apiName,
  displayName,
  pluralDisplayName,
  description,
  visibility,
  status,
  lastEditedAt,
  lastEditedBy,
  usageCount,
  linkedResourceCount,
  backingDatasourceID,
}: {
  ontology: OntologyArtifact;
  projectByID: Map<string, OntologyProject>;
  binding?: OntologyProjectResourceBinding;
  kind: OntologyResourceRegistryKind;
  resourceID: string;
  apiName: string;
  displayName: string;
  pluralDisplayName?: string | null;
  description?: string;
  visibility?: string | null;
  status?: string | null;
  lastEditedAt?: string | null;
  lastEditedBy?: string | null;
  usageCount: number;
  linkedResourceCount: number;
  backingDatasourceID?: string | null;
}): OntologyResourceRegistryEntry {
  const project = binding ? projectByID.get(binding.project_id) : null;
  return {
    id: registryBindingKey(kind, resourceID),
    resource_kind: kind,
    resource_id: resourceID,
    api_name: apiName,
    display_name: displayName,
    plural_display_name: pluralDisplayName,
    description: description || "",
    project_id: binding?.project_id ?? ontology.placement.project_id,
    project_display_name:
      project?.display_name ||
      project?.slug ||
      ontology.placement.project_display_name,
    folder_path: ontology.placement.folder_path,
    visibility: visibility || "normal",
    status: status || "active",
    branch_state: "main",
    usage_count: usageCount,
    last_edited_at: lastEditedAt || null,
    last_edited_by: lastEditedBy || null,
    backing_datasource_id: backingDatasourceID,
    linked_resource_count: linkedResourceCount,
  };
}

export type LinkTypeCardinality =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many";

export interface LinkTypeDatasourceMapping {
  datasource_id?: string | null;
  source_key?: string | null;
  target_key?: string | null;
  source_property?: string | null;
  target_property?: string | null;
}

export interface LinkType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  source_type_id: string;
  target_type_id: string;
  cardinality: LinkTypeCardinality | string;
  label?: string | null;
  reverse_label?: string | null;
  visibility?: string | null;
  link_datasource_mapping?: LinkTypeDatasourceMapping | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export function linkTypeCardinalityLabel(cardinality: string) {
  switch (cardinality) {
    case "one_to_one":
      return "One-to-one";
    case "one_to_many":
      return "One-to-many";
    case "many_to_one":
      return "Many-to-one";
    case "many_to_many":
      return "Many-to-many";
    default:
      return cardinality || "Many-to-many";
  }
}

export function linkTypeEndpointLabels(linkType: LinkType) {
  return {
    forward: linkType.label || linkType.display_name || linkType.name,
    reverse:
      linkType.reverse_label ||
      (linkType.label
        ? `${linkType.label} (reverse)`
        : `Reverse ${linkType.display_name || linkType.name}`),
  };
}

export function linkTypeRequiresDatasourceMapping(
  linkType: Pick<LinkType, "cardinality">,
) {
  return linkType.cardinality === "many_to_many";
}

export function linkTypeHasDatasourceMapping(
  linkType: Pick<LinkType, "cardinality" | "link_datasource_mapping">,
) {
  if (!linkTypeRequiresDatasourceMapping(linkType)) return true;
  const mapping = linkType.link_datasource_mapping;
  return Boolean(
    mapping?.datasource_id && mapping?.source_key && mapping?.target_key,
  );
}

export interface OntologyInterface {
  id: string;
  name: string;
  display_name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  properties?: InterfaceProperty[];
}

export type OntologyProjectRole = "viewer" | "editor" | "owner";

export interface OntologyProject {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  workspace_slug: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OntologyProjectMembership {
  project_id: string;
  user_id: string;
  role: OntologyProjectRole;
  created_at: string;
  updated_at: string;
}

export type ActionOperationKind =
  | "create_object"
  | "update_object"
  | "modify_object"
  | "create_or_modify_object"
  | "create_link"
  | "delete_link"
  | "delete_object"
  | "invoke_function"
  | "invoke_webhook"
  | "create_interface"
  | "modify_interface"
  | "delete_interface"
  | "create_interface_link"
  | "delete_interface_link";

export interface ActionInputField {
  name: string;
  display_name?: string | null;
  description?: string | null;
  property_type: string;
  value_type_id?: string | null;
  value_type?: OntologyValueType | null;
  shared_property_type_id?: string | null;
  value_formatting?: PropertyValueFormatting | Record<string, unknown>;
  conditional_formatting?: PropertyConditionalFormattingRule[];
  required: boolean;
  default_value?: unknown;
  struct_fields?: ActionInputField[];
}

export interface ActionFormCondition {
  left: string;
  operator: string;
  right?: unknown;
}

export interface ActionFormSectionOverride {
  conditions?: ActionFormCondition[];
  hidden?: boolean;
  columns?: number;
  title?: string | null;
  description?: string | null;
}

export interface ActionFormSection {
  id: string;
  title?: string | null;
  description?: string | null;
  columns?: number;
  collapsible?: boolean;
  visible?: boolean;
  parameter_names?: string[];
  overrides?: ActionFormSectionOverride[];
}

export interface ActionFormParameterOverride {
  parameter_name: string;
  conditions?: ActionFormCondition[];
  hidden?: boolean;
  required?: boolean;
  default_value?: unknown;
  display_name?: string | null;
  description?: string | null;
}

export interface ActionFormSchema {
  sections?: ActionFormSection[];
  parameter_overrides?: ActionFormParameterOverride[];
}

export interface ActionAuthorizationPolicy {
  required_permission_keys?: string[];
  any_role?: string[];
  all_roles?: string[];
  attribute_equals?: Record<string, unknown>;
  allowed_markings?: string[];
  minimum_clearance?: string | null;
  deny_guest_sessions?: boolean;
}

export interface ActionType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  interface_id?: string | null;
  operation_kind: ActionOperationKind;
  input_schema: ActionInputField[];
  form_schema: ActionFormSchema;
  config: unknown;
  confirmation_required: boolean;
  permission_key: string | null;
  authorization_policy: ActionAuthorizationPolicy;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export function listLinkTypes(params?: {
  object_type_id?: string;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{ data: LinkType[]; total: number }>(`/ontology/links?${qs}`);
}

export function listInterfaces(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: OntologyInterface[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/interfaces?${qs}`);
}


export function actionInterfaceId(action: Partial<ActionType>) {
  const config = action.config && typeof action.config === "object" ? action.config as Record<string, unknown> : {};
  const candidate = action.interface_id ?? config.interface_id ?? config.target_interface_id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

export function isInterfaceAction(action: Partial<ActionType>) {
  return Boolean(actionInterfaceId(action)) || String(action.operation_kind || "").includes("interface");
}

export function interfaceActionAppliesToObjectType(action: ActionType, implementedInterfaces: OntologyInterface[]) {
  const interfaceId = actionInterfaceId(action);
  return implementedInterfaces.some((iface) =>
    iface.id === interfaceId || (isInterfaceAction(action) && action.object_type_id === iface.id),
  );
}

export function mergeApplicableInterfaceActions(
  objectActions: ActionType[],
  allActions: ActionType[],
  implementedInterfaces: OntologyInterface[],
) {
  const seen = new Set(objectActions.map((action) => action.id));
  const inherited = allActions.filter((action) => interfaceActionAppliesToObjectType(action, implementedInterfaces) && !seen.has(action.id));
  return [...objectActions, ...inherited];
}

function actionConfigTargets(action: ActionType) {
  const config = action.config && typeof action.config === "object" ? action.config as Record<string, unknown> : {};
  const raw = [config.property_name, config.target_property, config.property, config.properties, config.modified_properties, config.changed_properties];
  const directTargets = raw.flatMap((entry) => Array.isArray(entry) ? entry : entry ? [entry] : []).map(String);
  const mappingTargets = Array.isArray(config.property_mappings)
    ? config.property_mappings.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const mapping = entry as Record<string, unknown>;
        return typeof mapping.property_name === "string" ? [mapping.property_name] : [];
      })
    : [];
  const staticPatchTargets = config.static_patch && typeof config.static_patch === "object" && !Array.isArray(config.static_patch)
    ? Object.keys(config.static_patch as Record<string, unknown>)
    : [];
  return [...directTargets, ...mappingTargets, ...staticPatchTargets];
}

export function validateInterfaceActionRestrictions(
  action: ActionType,
  input: { interfaceProperties?: InterfaceProperty[]; objectType?: ObjectType | null },
) {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!isInterfaceAction(action)) return { valid: true, warnings, errors };
  const primaryKey = input.objectType?.primary_key_property || input.objectType?.primary_key || "id";
  const modified = new Set([...action.input_schema.map((field) => field.name), ...actionConfigTargets(action)]);
  if ([...modified].some((name) => name === primaryKey || name.endsWith(`.${primaryKey}`))) {
    errors.push(`Interface action ${action.display_name || action.name} may modify primary-key property ${primaryKey}.`);
  }
  const allowedProperties = new Set((input.interfaceProperties || []).map((property) => property.name));
  const broadModify = action.operation_kind === "modify_interface" || action.operation_kind === "create_interface";
  if (broadModify) {
    for (const name of modified) {
      if (allowedProperties.size > 0 && !allowedProperties.has(name) && name !== primaryKey) {
        warnings.push(`${name} is not declared on the target interface.`);
      }
    }
  }
  return { valid: errors.length === 0, warnings, errors };
}

export function listActionTypes(params?: {
  object_type_id?: string;
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: ActionType[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/actions?${qs}`);
}

export interface CreateActionTypeBody {
  name: string;
  display_name?: string;
  description?: string;
  object_type_id: string;
  interface_id?: string | null;
  operation_kind: ActionOperationKind;
  input_schema?: ActionInputField[];
  form_schema?: ActionFormSchema;
  config?: unknown;
  confirmation_required?: boolean;
  permission_key?: string;
  authorization_policy?: ActionAuthorizationPolicy;
}

export interface UpdateActionTypeBody {
  display_name?: string;
  description?: string;
  operation_kind?: ActionOperationKind;
  input_schema?: ActionInputField[];
  form_schema?: ActionFormSchema;
  config?: unknown;
  confirmation_required?: boolean;
  permission_key?: string;
  authorization_policy?: ActionAuthorizationPolicy;
}

export interface ActionWhatIfBranch {
  id: string;
  action_id: string;
  target_object_id: string | null;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  preview: Record<string, unknown>;
  before_object: Record<string, unknown> | null;
  after_object: Record<string, unknown> | null;
  deleted: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ValidateActionResponse {
  valid: boolean;
  errors: string[];
  preview: unknown;
}

export interface ExecuteActionResponse {
  action: ActionType;
  target_object_id: string | null;
  deleted: boolean;
  preview: unknown;
  object: unknown | null;
  link: unknown | null;
  result: unknown | null;
}

export interface ExecuteBatchActionResponse {
  action: ActionType;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}

export interface ActionMetricsResponse {
  action_id: string;
  window: string;
  success_count: number;
  failure_count: number;
  p95_duration_ms: number | null;
  failure_categories: Record<string, number>;
}

export function createActionType(body: CreateActionTypeBody) {
  return api.post<ActionType>("/ontology/actions", body);
}

export function updateActionType(id: string, body: UpdateActionTypeBody) {
  return api.patch<ActionType>(`/ontology/actions/${id}`, body);
}

export function deleteActionType(id: string) {
  return api.delete(`/ontology/actions/${id}`);
}

export function validateAction(
  id: string,
  body: { target_object_id?: string; parameters?: Record<string, unknown> },
) {
  return api.post<ValidateActionResponse>(
    `/ontology/actions/${id}/validate`,
    body,
  );
}

export function executeAction(
  id: string,
  body: {
    target_object_id?: string;
    parameters?: Record<string, unknown>;
    justification?: string;
  },
) {
  return api.post<ExecuteActionResponse>(
    `/ontology/actions/${id}/execute`,
    body,
  );
}

export function executeActionBatch(
  id: string,
  body: {
    target_object_ids: string[];
    parameters?: Record<string, unknown>;
    justification?: string;
  },
) {
  return api.post<ExecuteBatchActionResponse>(
    `/ontology/actions/${id}/execute-batch`,
    body,
  );
}

export function getActionMetrics(
  actionId: string,
  params?: { window?: string },
) {
  const qs = new URLSearchParams();
  if (params?.window) qs.set("window", params.window);
  const tail = qs.toString();
  return api.get<ActionMetricsResponse>(
    `/ontology/actions/${actionId}/metrics${tail ? `?${tail}` : ""}`,
  );
}

export function listActionWhatIfBranches(
  id: string,
  params?: { target_object_id?: string; page?: number; per_page?: number },
) {
  const qs = new URLSearchParams();
  if (params?.target_object_id)
    qs.set("target_object_id", params.target_object_id);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: ActionWhatIfBranch[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/actions/${id}/what-if?${qs}`);
}

export function createActionWhatIfBranch(
  id: string,
  body: {
    target_object_id?: string;
    parameters?: Record<string, unknown>;
    name?: string;
    description?: string;
  },
) {
  return api.post<ActionWhatIfBranch>(`/ontology/actions/${id}/what-if`, body);
}

export function deleteActionWhatIfBranch(id: string, branchId: string) {
  return api.delete(`/ontology/actions/${id}/what-if/${branchId}`);
}

export function listProjects(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: OntologyProject[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/projects?${qs}`);
}

export interface ProjectTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
}

export function listProjectTemplates() {
  return api
    .get<{ data: ProjectTemplate[] }>("/ontology/projects/templates")
    .then((response) => response.data);
}

export function listProjectMemberships(id: string) {
  return api
    .get<{
      data: OntologyProjectMembership[];
    }>(`/ontology/projects/${id}/memberships`)
    .then((response) => response.data);
}

export function createProject(body: {
  slug: string;
  display_name?: string;
  description?: string;
  workspace_slug?: string;
  folders?: Array<{
    name: string;
    description?: string;
    parent_folder_id?: string | null;
  }>;
}) {
  return api.post<OntologyProject>("/ontology/projects", body);
}

export function getProject(id: string) {
  return api.get<OntologyProject>(`/ontology/projects/${id}`);
}

export function updateProject(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    workspace_slug?: string | null;
  },
) {
  return api.patch<OntologyProject>(`/ontology/projects/${id}`, {
    ...body,
    workspace_slug:
      typeof body.workspace_slug === "undefined"
        ? undefined
        : body.workspace_slug,
  });
}

export function deleteProject(id: string) {
  return api.delete(`/ontology/projects/${id}`);
}

export function listProjectFolders(id: string) {
  return api
    .get<{ data: OntologyProjectFolder[] }>(`/ontology/projects/${id}/folders`)
    .then((response) => response.data);
}

export function createProjectFolder(
  id: string,
  body: {
    name: string;
    description?: string;
    parent_folder_id?: string | null;
  },
) {
  return api.post<OntologyProjectFolder>(
    `/ontology/projects/${id}/folders`,
    body,
  );
}

export function bindProjectResource(
  id: string,
  body: { resource_kind: string; resource_id: string },
) {
  return api.post<OntologyProjectResourceBinding>(
    `/ontology/projects/${id}/resources`,
    body,
  );
}

export function unbindProjectResource(
  id: string,
  resourceKind: string,
  resourceId: string,
) {
  return api.delete(
    `/ontology/projects/${id}/resources/${resourceKind}/${resourceId}`,
  );
}

export function upsertProjectMembership(
  id: string,
  body: { user_id: string; role: OntologyProjectRole },
) {
  return api.post<OntologyProjectMembership>(
    `/ontology/projects/${id}/memberships`,
    body,
  );
}

export function deleteProjectMembership(id: string, userId: string) {
  return api.delete(`/ontology/projects/${id}/memberships/${userId}`);
}

export function replaceProjectWorkingState(
  id: string,
  changes: OntologyStagedChange[],
) {
  return api.put<OntologyProjectWorkingState>(
    `/ontology/projects/${id}/working-state`,
    { changes },
  );
}

export function getActionType(id: string) {
  return api.get<ActionType>(`/ontology/actions/${id}`);
}

export function getFunctionPackage(id: string) {
  return api.get<FunctionPackage>(`/ontology/functions/${id}`);
}

export function getFunctionPackageMetricsForId(id: string) {
  return api.get<FunctionPackageMetrics>(`/ontology/functions/${id}/metrics`);
}

export function getOntologyFunnelSource(id: string) {
  return api.get<OntologyFunnelSource>(`/ontology/funnel/sources/${id}`);
}

export function getObjectInstance(typeId: string, objectId: string) {
  return api.get<ObjectInstance>(
    `/ontology/types/${typeId}/objects/${objectId}`,
  );
}

// ────────────────────────────────────────────────────────────────
// Object-type bindings (dataset → object type materialization)
// ────────────────────────────────────────────────────────────────

export type ObjectTypeBindingSyncMode = "snapshot" | "incremental" | "view";

export interface ObjectTypeBindingPropertyMapping {
  source_field: string;
  target_property: string;
  transform?: string | null;
  datasource_id?: string | null;
  restricted_view_id?: string | null;
  null_when_inaccessible?: boolean;
}

export interface ObjectTypeBinding {
  id: string;
  object_type_id: string;
  dataset_id: string;
  dataset_branch?: string | null;
  dataset_version?: number | null;
  primary_key_column: string;
  property_mapping: ObjectTypeBindingPropertyMapping[];
  sync_mode: ObjectTypeBindingSyncMode;
  default_marking: string;
  preview_limit: number;
  owner_id: string;
  last_materialized_at?: string | null;
  last_run_status?: string | null;
  last_run_summary?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MaterializeBindingResponse {
  binding_id: string;
  status: string;
  rows_read: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  dry_run: boolean;
  error_details?: unknown[];
}


export function bindingDatasourceProvenance(bindings: ObjectTypeBinding[]) {
  const provenance = new Map<string, Array<{ binding_id: string; dataset_id: string; source_field: string; restricted_view_id?: string | null; null_when_inaccessible?: boolean }>>();
  for (const binding of bindings) {
    for (const mapping of binding.property_mapping) {
      const entries = provenance.get(mapping.target_property) ?? [];
      entries.push({
        binding_id: binding.id,
        dataset_id: mapping.datasource_id || binding.dataset_id,
        source_field: mapping.source_field,
        restricted_view_id: mapping.restricted_view_id,
        null_when_inaccessible: mapping.null_when_inaccessible,
      });
      provenance.set(mapping.target_property, entries);
    }
  }
  return provenance;
}

export function validateMultiDatasourcePrimaryKeys(bindings: ObjectTypeBinding[]) {
  const columns = Array.from(new Set(bindings.map((binding) => binding.primary_key_column).filter(Boolean)));
  return {
    valid: columns.length <= 1,
    primary_key_columns: columns,
    errors: columns.length > 1 ? [`Primary key columns must be consistent across datasources: ${columns.join(", ")}.`] : [],
    unsupported: ["Row-wise MDO semantics are unsupported; use restricted views for row-level filtering."],
  };
}

export function maskObjectPropertiesForDatasourceAccess(
  object: ObjectInstance,
  bindings: ObjectTypeBinding[],
  accessibleDatasourceIds: string[],
) {
  const accessible = new Set(accessibleDatasourceIds);
  const provenance = bindingDatasourceProvenance(bindings);
  const properties = { ...(object.properties || {}) };
  for (const [propertyName, sources] of provenance) {
    const allInaccessible = sources.length > 0 && sources.every((source) => !accessible.has(source.dataset_id));
    const shouldNull = sources.some((source) => source.null_when_inaccessible);
    if (allInaccessible && shouldNull) properties[propertyName] = null;
  }
  return { ...object, properties };
}

export function listObjectTypeBindings(typeId: string) {
  return api.get<{ data: ObjectTypeBinding[] }>(
    `/ontology/types/${typeId}/bindings`,
  );
}

export function createObjectTypeBinding(
  typeId: string,
  body: {
    dataset_id: string;
    dataset_branch?: string;
    dataset_version?: number;
    primary_key_column: string;
    property_mapping: ObjectTypeBindingPropertyMapping[];
    sync_mode: ObjectTypeBindingSyncMode;
    default_marking?: string;
    preview_limit?: number;
  },
) {
  return api.post<ObjectTypeBinding>(
    `/ontology/types/${typeId}/bindings`,
    body,
  );
}

export function updateObjectTypeBinding(
  typeId: string,
  bindingId: string,
  body: Partial<{
    dataset_branch: string;
    dataset_version: number;
    primary_key_column: string;
    property_mapping: ObjectTypeBindingPropertyMapping[];
    sync_mode: ObjectTypeBindingSyncMode;
    default_marking: string;
    preview_limit: number;
  }>,
) {
  return api.patch<ObjectTypeBinding>(
    `/ontology/types/${typeId}/bindings/${bindingId}`,
    body,
  );
}

export function deleteObjectTypeBinding(typeId: string, bindingId: string) {
  return api.delete(`/ontology/types/${typeId}/bindings/${bindingId}`);
}

export function materializeObjectTypeBinding(
  typeId: string,
  bindingId: string,
  body?: {
    dataset_branch?: string;
    dataset_version?: number;
    limit?: number;
    dry_run?: boolean;
  },
) {
  return api.post<MaterializeBindingResponse>(
    `/ontology/types/${typeId}/bindings/${bindingId}/materialize`,
    body ?? {},
  );
}

// ────────────────────────────────────────────────────────────────
// Rules + machinery — used by /dynamic-scheduling.
// ────────────────────────────────────────────────────────────────

export type RuleEvaluationMode = "advisory" | "automatic";

export interface RuleTriggerSpec {
  equals?: Record<string, unknown>;
  numeric_gte?: Record<string, number>;
  numeric_lte?: Record<string, number>;
  exists?: string[];
  changed_properties?: string[];
  markings?: string[];
}

export interface RuleAlertSpec {
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message?: string | null;
}

export interface RuleScheduleSpec {
  property_name: string;
  offset_hours: number;
  priority_score?: number;
  estimated_duration_minutes?: number;
  required_capability?: string | null;
  constraint_tags?: string[];
  hard_deadline_hours?: number | null;
}

export interface RuleEffectSpec {
  object_patch?: Record<string, unknown> | null;
  schedule?: RuleScheduleSpec | null;
  alert?: RuleAlertSpec | null;
}

export interface OntologyRule {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  evaluation_mode: RuleEvaluationMode;
  trigger_spec: RuleTriggerSpec;
  effect_spec: RuleEffectSpec;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface MachineryInsight {
  rule_id: string;
  name: string;
  display_name: string;
  evaluation_mode: RuleEvaluationMode;
  matched_runs: number;
  total_runs: number;
  pending_schedules: number;
  overdue_schedules: number;
  avg_schedule_lead_hours: number | null;
  dynamic_pressure: string;
  last_matched_at: string | null;
  last_object_id: string | null;
}

export interface MachineryQueueItem {
  id: string;
  rule_id: string;
  rule_run_id: string;
  object_id: string;
  rule_name: string;
  rule_display_name: string;
  object_type_id: string;
  status: string;
  scheduled_for: string;
  priority_score: number;
  estimated_duration_minutes: number;
  required_capability: string | null;
  constraint_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MachineryCapabilityLoad {
  capability: string;
  pending_count: number;
  total_estimated_minutes: number;
}

export interface MachineryQueueRecommendation {
  generated_at: string;
  strategy: string;
  queue_depth: number;
  overdue_count: number;
  total_estimated_minutes: number;
  next_due_at: string | null;
  recommended_order: string[];
  capability_load: MachineryCapabilityLoad[];
}

export interface MachineryQueueResponse {
  object_type_id: string | null;
  data: MachineryQueueItem[];
  recommendation: MachineryQueueRecommendation;
}

export function listRules(params?: {
  object_type_id?: string;
  search?: string;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: OntologyRule[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/rules?${qs}`);
}

export function getMachineryInsights(params?: { object_type_id?: string }) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  return api.get<{ object_type_id: string | null; data: MachineryInsight[] }>(
    `/ontology/rules/insights?${qs}`,
  );
}

export function getMachineryQueue(params?: { object_type_id?: string }) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  return api.get<MachineryQueueResponse>(
    `/ontology/rules/machinery/queue?${qs}`,
  );
}

export function updateMachineryQueueItem(id: string, body: { status: string }) {
  return api.patch<MachineryQueueItem>(
    `/ontology/rules/machinery/queue/${id}`,
    body,
  );
}

// ────────────────────────────────────────────────────────────────
// Interface mutations + bindings — used by /interfaces.
// ────────────────────────────────────────────────────────────────

export interface InterfaceProperty {
  id: string;
  interface_id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  value_type_id?: string | null;
  value_type?: OntologyValueType | null;
  shared_property_type_id?: string | null;
  value_formatting?: PropertyValueFormatting | Record<string, unknown>;
  conditional_formatting?: PropertyConditionalFormattingRule[];
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
  default_value: unknown;
  validation_rules: unknown;
  created_at: string;
  updated_at: string;
}


export interface InterfaceExtensionBinding {
  interface_id: string;
  extends_interface_id: string;
  created_at: string;
}

export interface InterfacePropertyMapping {
  interface_property_id: string;
  interface_property_name: string;
  object_property_name: string;
}

export interface InterfaceLinkImplementationMapping {
  constraint_id: string;
  link_type_id: string;
}

export interface InterfaceImplementationDetail {
  interface_id: string;
  object_type_id: string;
  property_mappings: InterfacePropertyMapping[];
  link_mappings: InterfaceLinkImplementationMapping[];
  updated_at: string;
}

export type InterfaceLinkTargetKind = "object_type" | "interface";
export type InterfaceLinkConstraintCardinality = "one" | "many";

export interface InterfaceLinkConstraint {
  id: string;
  interface_id: string;
  api_name: string;
  display_name: string;
  description: string;
  target_kind: InterfaceLinkTargetKind;
  target_id: string;
  cardinality: InterfaceLinkConstraintCardinality;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export interface ObjectTypeInterfaceBinding {
  object_type_id: string;
  interface_id: string;
  created_at: string;
}


function interfaceLocalKey(kind: string, id: string) {
  return `of:ontology:interface:${kind}:${id}`;
}

function readInterfaceLocalList<T>(kind: string, id: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(interfaceLocalKey(kind, id));
    const parsed = raw ? (JSON.parse(raw) as T[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeInterfaceLocalList<T>(kind: string, id: string, items: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(interfaceLocalKey(kind, id), JSON.stringify(items));
}

export function listInterfaceExtensions(interfaceId: string) {
  return Promise.resolve(readInterfaceLocalList<InterfaceExtensionBinding>("extensions", interfaceId));
}

export function addInterfaceExtension(interfaceId: string, extendsInterfaceId: string) {
  const now = new Date().toISOString();
  const existing = readInterfaceLocalList<InterfaceExtensionBinding>("extensions", interfaceId)
    .filter((entry) => entry.extends_interface_id !== extendsInterfaceId);
  const next = { interface_id: interfaceId, extends_interface_id: extendsInterfaceId, created_at: now };
  writeInterfaceLocalList("extensions", interfaceId, [next, ...existing]);
  return Promise.resolve(next);
}

export function removeInterfaceExtension(interfaceId: string, extendsInterfaceId: string) {
  writeInterfaceLocalList(
    "extensions",
    interfaceId,
    readInterfaceLocalList<InterfaceExtensionBinding>("extensions", interfaceId)
      .filter((entry) => entry.extends_interface_id !== extendsInterfaceId),
  );
  return Promise.resolve();
}

export function listInterfaceLinkConstraints(interfaceId: string) {
  return Promise.resolve(readInterfaceLocalList<InterfaceLinkConstraint>("link-constraints", interfaceId));
}

export function createInterfaceLinkConstraint(interfaceId: string, body: Omit<InterfaceLinkConstraint, "id" | "interface_id" | "created_at" | "updated_at">) {
  const now = new Date().toISOString();
  const constraint: InterfaceLinkConstraint = {
    ...body,
    id: `interface-link:${interfaceId}:${body.api_name}`,
    interface_id: interfaceId,
    created_at: now,
    updated_at: now,
  };
  const existing = readInterfaceLocalList<InterfaceLinkConstraint>("link-constraints", interfaceId)
    .filter((entry) => entry.id !== constraint.id && entry.api_name !== constraint.api_name);
  writeInterfaceLocalList("link-constraints", interfaceId, [constraint, ...existing]);
  return Promise.resolve(constraint);
}

export function deleteInterfaceLinkConstraint(interfaceId: string, constraintId: string) {
  writeInterfaceLocalList(
    "link-constraints",
    interfaceId,
    readInterfaceLocalList<InterfaceLinkConstraint>("link-constraints", interfaceId).filter((entry) => entry.id !== constraintId),
  );
  return Promise.resolve();
}

export function listInterfaceImplementationDetails(interfaceId: string) {
  return Promise.resolve(readInterfaceLocalList<InterfaceImplementationDetail>("implementations", interfaceId));
}

export function upsertInterfaceImplementationDetail(detail: InterfaceImplementationDetail) {
  const next = { ...detail, updated_at: new Date().toISOString() };
  const existing = readInterfaceLocalList<InterfaceImplementationDetail>("implementations", detail.interface_id)
    .filter((entry) => entry.object_type_id !== detail.object_type_id);
  writeInterfaceLocalList("implementations", detail.interface_id, [next, ...existing]);
  return Promise.resolve(next);
}

export function validateInterfaceImplementation(input: {
  properties: InterfaceProperty[];
  linkConstraints: InterfaceLinkConstraint[];
  implementation?: InterfaceImplementationDetail | null;
}) {
  const propertyMappings = input.implementation?.property_mappings ?? [];
  const linkMappings = input.implementation?.link_mappings ?? [];
  const missingProperties = input.properties
    .filter((property) => property.required)
    .filter((property) => !propertyMappings.some((mapping) => mapping.interface_property_id === property.id && mapping.object_property_name.trim()));
  const missingLinks = input.linkConstraints
    .filter((constraint) => constraint.required)
    .filter((constraint) => !linkMappings.some((mapping) => mapping.constraint_id === constraint.id && mapping.link_type_id.trim()));
  return {
    valid: missingProperties.length === 0 && missingLinks.length === 0,
    missing_properties: missingProperties,
    missing_link_constraints: missingLinks,
  };
}

export function createInterface(body: {
  name: string;
  display_name?: string;
  description?: string;
}) {
  return api.post<OntologyInterface>("/ontology/interfaces", body);
}

export function getInterface(id: string) {
  return api.get<OntologyInterface>(`/ontology/interfaces/${id}`);
}

export function updateInterface(
  id: string,
  body: { display_name?: string; description?: string },
) {
  return api.patch<OntologyInterface>(`/ontology/interfaces/${id}`, body);
}

export function deleteInterface(id: string) {
  return api.delete(`/ontology/interfaces/${id}`);
}

export function listInterfaceProperties(id: string) {
  return api
    .get<{ data: InterfaceProperty[] }>(`/ontology/interfaces/${id}/properties`)
    .then((response) => response.data);
}

export function createInterfaceProperty(
  id: string,
  body: {
    name: string;
    display_name?: string;
    description?: string;
    property_type: string;
    value_type_id?: string | null;
    required?: boolean;
    unique_constraint?: boolean;
    time_dependent?: boolean;
    default_value?: unknown;
    validation_rules?: unknown;
  },
) {
  return api.post<InterfaceProperty>(
    `/ontology/interfaces/${id}/properties`,
    body,
  );
}

export function updateInterfaceProperty(
  id: string,
  propertyId: string,
  body: {
    display_name?: string;
    description?: string;
    value_type_id?: string | null;
    required?: boolean;
    unique_constraint?: boolean;
    time_dependent?: boolean;
    default_value?: unknown;
    validation_rules?: unknown;
  },
) {
  return api.patch<InterfaceProperty>(
    `/ontology/interfaces/${id}/properties/${propertyId}`,
    body,
  );
}

export function deleteInterfaceProperty(id: string, propertyId: string) {
  return api.delete(`/ontology/interfaces/${id}/properties/${propertyId}`);
}

export function listTypeInterfaces(typeId: string) {
  return api
    .get<{ data: OntologyInterface[] }>(`/ontology/types/${typeId}/interfaces`)
    .then((response) => response.data);
}

export function implementInterface(
  interfaceId: string,
  body: { object_type_id: string },
) {
  return api.post<ObjectTypeInterfaceBinding>(
    `/ontology/interfaces/${interfaceId}/implementations`,
    body,
  );
}

export function attachInterfaceToType(typeId: string, interfaceId: string) {
  return implementInterface(interfaceId, { object_type_id: typeId });
}

export function detachInterfaceFromType(typeId: string, interfaceId: string) {
  return api.delete(`/ontology/types/${typeId}/interfaces/${interfaceId}`);
}

export function updateObject(
  typeId: string,
  objectId: string,
  body: {
    properties: Record<string, unknown>;
    replace?: boolean;
    marking?: string;
  },
) {
  return api.patch<ObjectInstance>(
    `/ontology/types/${typeId}/objects/${objectId}`,
    body,
  );
}

// ────────────────────────────────────────────────────────────────
// Object views, rules, simulations — used by /object-views,
// /object-explorer, /foundry-rules, /machinery, etc.
// ────────────────────────────────────────────────────────────────

export interface RuleMatchResponse {
  rule_id: string;
  matched: boolean;
  trigger_payload: Record<string, unknown>;
  effect_preview: Record<string, unknown> | null;
}

export interface OntologyRuleRun {
  id: string;
  rule_id: string;
  object_id: string;
  matched: boolean;
  simulated: boolean;
  trigger_payload: Record<string, unknown>;
  effect_preview: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface ObjectViewResponse {
  object: ObjectInstance;
  summary: Record<string, unknown>;
  neighbors: NeighborLink[];
  graph: GraphResponse;
  applicable_actions: ActionType[];
  matching_rules: RuleMatchResponse[];
  recent_rule_runs: OntologyRuleRun[];
  timeline: Array<Record<string, unknown>>;
}

export function getObjectView(typeId: string, objectId: string) {
  return api.get<ObjectViewResponse>(
    `/ontology/types/${typeId}/objects/${objectId}/view`,
  );
}

export type ObjectViewMode = "standard" | "configured";
export type ObjectViewFormFactor = "full" | "panel";
export type ObjectViewSectionKind =
  | "summary"
  | "properties"
  | "links"
  | "timeline"
  | "actions"
  | "graph"
  | "comments"
  | "apps";

export interface ObjectViewSectionDefinition {
  id: string;
  title: string;
  kind: ObjectViewSectionKind;
  description: string;
}

export interface ObjectViewSidebarLinkDefinition {
  id: string;
  label: string;
  href: string;
}

export interface ObjectViewConfig {
  mode: ObjectViewMode;
  form_factor: ObjectViewFormFactor;
  title_template: string;
  subtitle_property: string;
  prominent_properties: string[];
  panel_properties: string[];
  sections: ObjectViewSectionDefinition[];
  sidebar_links: ObjectViewSidebarLinkDefinition[];
  comments_enabled: boolean;
  branch_label: string;
  auto_publish: boolean;
  metadata?: {
    title_property?: string | null;
    primary_key_property?: string | null;
    normal_properties?: string[];
    linked_object_type_ids?: string[];
    link_type_ids?: string[];
    generated?: boolean;
  };
}

export interface ObjectViewDefinition {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  object_type_id: string;
  mode: ObjectViewMode;
  form_factor: ObjectViewFormFactor;
  config?: ObjectViewConfig;
  branch_label?: string | null;
  published?: boolean;
  status?: string;
  created_by?: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

function coreObjectViewSection(
  id: string,
  title: string,
  kind: ObjectViewSectionKind,
  description: string,
): ObjectViewSectionDefinition {
  return { id, title, kind, description };
}

function coreObjectViewConfig(
  objectType: ObjectType,
  properties: Property[],
  linkTypes: LinkType[],
  formFactor: ObjectViewFormFactor,
): ObjectViewConfig {
  const visible = objectViewVisibleProperties(properties);
  const prominent = objectViewProminentProperties(properties);
  const prominentNames = prominent.map((property) => property.name);
  const normalNames = visible
    .filter((property) => !prominentNames.includes(property.name))
    .map((property) => property.name);
  const panelNames = [
    ...prominentNames,
    ...normalNames,
  ].slice(0, 6);
  const linkedObjectTypeIds = uniqueNonEmpty(
    linkTypes.flatMap((link) => [link.source_type_id, link.target_type_id]),
  ).filter((id) => id !== objectType.id || linkTypes.some((link) => link.source_type_id === objectType.id && link.target_type_id === objectType.id));
  return {
    mode: "standard",
    form_factor: formFactor,
    title_template: `{{${objectType.title_property || objectType.primary_key_property || "id"}}}`,
    subtitle_property: objectType.primary_key_property || "",
    prominent_properties: prominentNames,
    panel_properties: formFactor === "panel" ? panelNames : visible.map((property) => property.name),
    sections: formFactor === "full"
      ? [
          coreObjectViewSection("summary", "Summary", "summary", "Title, primary key, prominent properties, and metadata."),
          coreObjectViewSection("properties", "Properties", "properties", "Normal non-hidden properties from the object type."),
          coreObjectViewSection("links", "Linked objects", "links", "Non-hidden linked objects grouped by link type."),
          coreObjectViewSection("actions", "Actions", "actions", "Actions available for this object type."),
          coreObjectViewSection("timeline", "Timeline", "timeline", "Object activity and metadata timeline."),
          coreObjectViewSection("graph", "Graph", "graph", "Object graph neighborhood."),
        ]
      : [
          coreObjectViewSection("summary", "Summary", "summary", "Title, primary key, and prominent properties."),
          coreObjectViewSection("properties", "Properties", "properties", "Compact non-hidden properties."),
          coreObjectViewSection("links", "Linked objects", "links", "Compact linked object previews."),
          coreObjectViewSection("actions", "Actions", "actions", "Primary actions."),
        ],
    sidebar_links: [],
    comments_enabled: false,
    branch_label: "core",
    auto_publish: true,
    metadata: {
      title_property: objectType.title_property || objectType.primary_key_property || null,
      primary_key_property: objectType.primary_key_property || null,
      normal_properties: normalNames,
      linked_object_type_ids: linkedObjectTypeIds,
      link_type_ids: linkTypes.map((link) => link.id),
      generated: true,
    },
  };
}

export function buildCoreObjectViews(input: {
  objectTypes: ObjectType[];
  propertiesByObjectType?: Record<string, Property[]>;
  linkTypes?: LinkType[];
}): ObjectViewDefinition[] {
  const linkTypes = input.linkTypes ?? [];
  return input.objectTypes.flatMap((objectType) => {
    const properties = input.propertiesByObjectType?.[objectType.id] ?? objectType.properties ?? [];
    const visibleLinks = linkTypes.filter(
      (link) =>
        link.visibility !== "hidden" &&
        (link.source_type_id === objectType.id || link.target_type_id === objectType.id),
    );
    return (["full", "panel"] as const).map((formFactor) => ({
      id: `core:${objectType.id}:${formFactor}`,
      name: `${objectTypeAPIName(objectType)}Core${formFactor === "full" ? "Full" : "Panel"}View`,
      display_name: `${objectType.display_name} core ${formFactor === "full" ? "full" : "panel"} view`,
      description: `Automatically generated core ${formFactor} Object View for ${objectType.display_name}.`,
      object_type_id: objectType.id,
      mode: "standard",
      form_factor: formFactor,
      config: coreObjectViewConfig(objectType, properties, visibleLinks, formFactor),
      branch_label: "core",
      published: true,
      status: "core",
      owner_id: "platform",
      created_by: "platform",
      created_at: objectType.created_at,
      updated_at: objectType.updated_at,
    }));
  });
}

export interface CreateObjectViewBody {
  name: string;
  display_name?: string;
  description?: string;
  object_type_id: string;
  mode?: ObjectViewMode;
  form_factor?: ObjectViewFormFactor;
  config?: ObjectViewConfig;
  branch_label?: string;
  published?: boolean;
}

export function listObjectViews(params?: {
  object_type_id?: string;
  form_factor?: ObjectViewFormFactor;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.form_factor) qs.set("form_factor", params.form_factor);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const tail = qs.toString();
  return api.get<{
    data: ObjectViewDefinition[];
    total: number;
    page?: number;
    per_page?: number;
  }>(`/object-views${tail ? `?${tail}` : ""}`);
}

export function createObjectView(body: CreateObjectViewBody) {
  return api.post<ObjectViewDefinition>("/object-views", body);
}

// ────────────────────────────────────────────────────────────────
// Object sets — used by /object-explorer.
// ────────────────────────────────────────────────────────────────

export interface ObjectSetPolicy {
  allowed_markings: string[];
  minimum_clearance: string | null;
  deny_guest_sessions: boolean;
  required_restricted_view_id: string | null;
}

export interface ObjectSetFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface ObjectSetTraversal {
  direction: "outbound" | "inbound" | "both";
  link_type_id: string | null;
  target_object_type_id: string | null;
  max_hops: number;
}

export interface ObjectSetJoin {
  secondary_object_type_id: string;
  left_field: string;
  right_field: string;
  join_kind: "inner" | "left";
}

export interface ObjectSetDefinition {
  id: string;
  name: string;
  description: string;
  base_object_type_id: string;
  filters: ObjectSetFilter[];
  traversals: ObjectSetTraversal[];
  join: ObjectSetJoin | null;
  projections: string[];
  what_if_label: string | null;
  policy: ObjectSetPolicy;
  materialized_snapshot: unknown[] | null;
  materialized_at: string | null;
  materialized_row_count: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ObjectSetEvaluationResponse {
  object_set: ObjectSetDefinition;
  total_base_matches: number;
  total_rows: number;
  traversal_neighbor_count: number;
  rows: Record<string, unknown>[];
  generated_at: string;
  materialized: boolean;
}

export function listObjectSets(params?: { size?: number; token?: string }) {
  const qs = new URLSearchParams();
  if (params?.size) qs.set("size", String(params.size));
  if (params?.token) qs.set("token", params.token);
  return api.get<{ data: ObjectSetDefinition[]; next_token?: string }>(
    `/ontology/object-sets${qs.toString() ? `?${qs}` : ""}`,
  );
}

export function createObjectSet(body: {
  name: string;
  description?: string;
  base_object_type_id: string;
  filters?: ObjectSetFilter[];
  traversals?: ObjectSetTraversal[];
  join?: ObjectSetJoin | null;
  projections?: string[];
  what_if_label?: string | null;
  policy?: Partial<ObjectSetPolicy>;
}) {
  return api.post<ObjectSetDefinition>("/ontology/object-sets", body);
}

export function updateObjectSet(
  id: string,
  body: Partial<{
    name: string;
    description: string;
    base_object_type_id: string;
    filters: ObjectSetFilter[];
    traversals: ObjectSetTraversal[];
    join: ObjectSetJoin | null;
    projections: string[];
    what_if_label: string | null;
    policy: ObjectSetPolicy;
  }>,
) {
  return api.patch<ObjectSetDefinition>(`/ontology/object-sets/${id}`, body);
}

export function deleteObjectSet(id: string) {
  return api.delete(`/ontology/object-sets/${id}`);
}

export function evaluateObjectSet(id: string, body?: { limit?: number }) {
  return api.post<ObjectSetEvaluationResponse>(
    `/ontology/object-sets/${id}/evaluate`,
    body ?? {},
  );
}

export function materializeObjectSet(id: string, body?: { limit?: number }) {
  return api.post<ObjectSetEvaluationResponse>(
    `/ontology/object-sets/${id}/materialize`,
    body ?? {},
  );
}

// ────────────────────────────────────────────────────────────────
// Ontology funnel sources / runs / health — used by /ontology-indexing.
// ────────────────────────────────────────────────────────────────

export interface OntologyFunnelPropertyMapping {
  source_field: string;
  target_property: string;
}

export interface OntologyFunnelSource {
  id: string;
  name: string;
  description: string;
  object_type_id: string;
  dataset_id: string;
  pipeline_id: string | null;
  dataset_branch: string | null;
  dataset_version: number | null;
  preview_limit: number;
  default_marking: string;
  status: string;
  property_mappings: OntologyFunnelPropertyMapping[];
  trigger_context: Record<string, unknown>;
  owner_id: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyFunnelRun {
  id: string;
  source_id: string;
  object_type_id: string;
  dataset_id: string;
  pipeline_id: string | null;
  pipeline_run_id: string | null;
  status: string;
  trigger_type: string;
  started_by: string | null;
  rows_read: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  details: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface OntologyFunnelSourceHealth {
  source: OntologyFunnelSource;
  health_status: string;
  health_reason: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  warning_runs: number;
  success_rate: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  max_duration_ms: number | null;
  latest_run_status: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_warning_at: string | null;
  rows_read: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
}

export interface OntologyFunnelHealthSummary {
  stale_after_hours: number;
  total_sources: number;
  active_sources: number;
  paused_sources: number;
  healthy_sources: number;
  degraded_sources: number;
  failing_sources: number;
  stale_sources: number;
  never_run_sources: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  warning_runs: number;
  success_rate: number;
  rows_read: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  last_run_at: string | null;
  sources: OntologyFunnelSourceHealth[];
}

export function getOntologyFunnelHealth(params?: {
  object_type_id?: string;
  stale_after_hours?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.stale_after_hours)
    qs.set("stale_after_hours", String(params.stale_after_hours));
  return api.get<OntologyFunnelHealthSummary>(`/ontology/funnel/health?${qs}`);
}

export function listOntologyFunnelSources(params?: {
  object_type_id?: string;
  status?: string;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set("object_type_id", params.object_type_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: OntologyFunnelSource[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/funnel/sources?${qs}`);
}

export function createOntologyFunnelSource(body: {
  name: string;
  description?: string;
  object_type_id: string;
  dataset_id: string;
  pipeline_id?: string | null;
  dataset_branch?: string | null;
  dataset_version?: number | null;
  preview_limit?: number;
  default_marking?: string;
  status?: string;
  property_mappings?: OntologyFunnelPropertyMapping[];
  trigger_context?: Record<string, unknown>;
}) {
  return api.post<OntologyFunnelSource>("/ontology/funnel/sources", body);
}

export function updateOntologyFunnelSource(
  id: string,
  body: {
    name?: string;
    description?: string;
    pipeline_id?: string | null;
    dataset_branch?: string | null;
    dataset_version?: number | null;
    preview_limit?: number;
    default_marking?: string;
    status?: string;
    property_mappings?: OntologyFunnelPropertyMapping[];
    trigger_context?: Record<string, unknown>;
  },
) {
  return api.patch<OntologyFunnelSource>(
    `/ontology/funnel/sources/${id}`,
    body,
  );
}

export function deleteOntologyFunnelSource(id: string) {
  return api.delete(`/ontology/funnel/sources/${id}`);
}

export function triggerOntologyFunnelRun(
  id: string,
  body?: {
    limit?: number;
    dataset_branch?: string;
    dataset_version?: number;
    skip_pipeline?: boolean;
    dry_run?: boolean;
    trigger_context?: Record<string, unknown>;
  },
) {
  return api.post<OntologyFunnelRun>(
    `/ontology/funnel/sources/${id}/run`,
    body ?? {},
  );
}

export interface OntologyReindexRequest {
  page_size?: number;
  trigger_context?: Record<string, unknown>;
}

export interface OntologyReindexResponse {
  job_id?: string;
  request_id?: string;
  type_id?: string;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export function reindexOntologyType(
  typeId: string,
  body?: OntologyReindexRequest,
) {
  return api.post<OntologyReindexResponse>(
    `/ontology/types/${typeId}/reindex`,
    body ?? {},
  );
}

export function listOntologyFunnelRuns(
  id: string,
  params?: { page?: number; per_page?: number },
) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: OntologyFunnelRun[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/funnel/sources/${id}/runs?${qs}`);
}

// ────────────────────────────────────────────────────────────────
// Project branches/proposals/migrations + shared property types —
// used by /ontologies, /ontology-manager, /ontology.
// ────────────────────────────────────────────────────────────────

export interface SharedPropertyType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  property_type: string;
  value_type_id?: string | null;
  value_type?: OntologyValueType | null;
  value_formatting?: PropertyValueFormatting | Record<string, unknown>;
  conditional_formatting?: PropertyConditionalFormattingRule[];
  required: boolean;
  unique_constraint: boolean;
  time_dependent: boolean;
  default_value: unknown;
  validation_rules: unknown;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OntologyProjectResourceBinding {
  project_id: string;
  resource_kind: string;
  resource_id: string;
  bound_by: string;
  created_at: string;
}

export interface OntologyProjectMigrationResource {
  resource_kind: string;
  resource_id: string;
  label?: string;
}

export interface OntologyProjectMigration {
  id: string;
  project_id: string;
  source_project_id: string;
  target_project_id: string;
  resources: OntologyProjectMigrationResource[];
  submitted_at: string;
  status: string;
  note: string;
  submitted_by: string;
}

export interface OntologyStagedChange {
  id: string;
  kind: string;
  action: string;
  label: string;
  description: string;
  targetId?: string;
  parentRef?: {
    kind: string;
    id?: string;
    name?: string;
    slug?: string;
  };
  payload: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  source: string;
  author?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
}

export type OntologyChangeValidationSeverity = "warning" | "error";

export interface OntologyChangeValidationIssue {
  severity: OntologyChangeValidationSeverity;
  code: string;
  message: string;
}

export interface OntologyUnsavedChangeReview {
  change: OntologyStagedChange;
  resource_kind: string;
  resource_id: string | null;
  author: string;
  timestamp: string;
  diff_summary: string;
  validation_issues: OntologyChangeValidationIssue[];
  validation_status: "valid" | "warning" | "error";
  save_ready: boolean;
  owned_by_current_user: boolean;
}

export interface OntologyUnsavedChangesReviewSummary {
  reviews: OntologyUnsavedChangeReview[];
  total: number;
  errors: number;
  warnings: number;
  save_ready: boolean;
  current_user_owned: number;
}

export interface OntologySavedChangeRecord {
  id: string;
  project_id: string;
  change_ids: string[];
  resources: Array<{ kind: string; id?: string | null; label?: string }>;
  changes: OntologyStagedChange[];
  branch_id?: string | null;
  proposal_id?: string | null;
  status: "saved" | "failed";
  validation_errors: OntologyChangeValidationIssue[];
  error_details?: unknown;
  saved_by: string;
  saved_at: string;
}

export interface SaveOntologyChangesResponse {
  record: OntologySavedChangeRecord;
  working_state: OntologyProjectWorkingState;
}

export interface OntologyProjectWorkingState {
  project_id: string;
  changes: OntologyStagedChange[];
  updated_by: string;
  updated_at: string;
}

const API_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function stagedPayload(change: OntologyStagedChange) {
  return change.payload && typeof change.payload === "object" ? change.payload as Record<string, unknown> : {};
}

export function ontologyChangeAuthor(change: OntologyStagedChange, fallback = "unknown") {
  return change.author || change.createdBy || change.updatedBy || fallback;
}

export function ontologyChangeResource(change: OntologyStagedChange) {
  const payload = stagedPayload(change);
  return {
    kind: change.kind || change.parentRef?.kind || "ontology_resource",
    id: change.targetId || (typeof payload.id === "string" ? payload.id : null),
  };
}

export function ontologyChangeDiffSummary(change: OntologyStagedChange) {
  const payload = stagedPayload(change);
  const keys = Object.keys(payload).filter((key) => payload[key] !== undefined);
  const changedFields = keys.length > 0 ? keys.slice(0, 6).join(", ") : "metadata";
  const suffix = keys.length > 6 ? ` +${keys.length - 6} more` : "";
  return `${change.action || "update"} ${change.kind || "resource"}: ${changedFields}${suffix}`;
}

function pushExistingIssues(change: OntologyStagedChange, issues: OntologyChangeValidationIssue[]) {
  for (const message of change.warnings || []) {
    issues.push({ severity: "warning", code: "existing_warning", message });
  }
  for (const message of change.errors || []) {
    issues.push({ severity: "error", code: "existing_error", message });
  }
}

export function validateOntologyStagedChange(change: OntologyStagedChange): OntologyChangeValidationIssue[] {
  const issues: OntologyChangeValidationIssue[] = [];
  const payload = stagedPayload(change);
  pushExistingIssues(change, issues);

  const apiName = payload.name ?? payload.api_name;
  if (typeof apiName === "string" && apiName.trim() && !API_NAME_RE.test(apiName.trim())) {
    issues.push({ severity: "error", code: "invalid_api_name", message: `API name ${apiName} must start with a letter and contain only letters, numbers, and underscores.` });
  }

  if ((change.kind === "link_type" || payload.source_object_type_id || payload.target_object_type_id) && change.action !== "delete") {
    if (!payload.source_object_type_id && !payload.source_type_id) {
      issues.push({ severity: "error", code: "missing_link_source", message: "Link changes must include a source object type." });
    }
    if (!payload.target_object_type_id && !payload.target_type_id) {
      issues.push({ severity: "error", code: "missing_link_target", message: "Link changes must include a target object type." });
    }
  }

  const primaryKey = payload.primary_key_property ?? payload.primary_key_column;
  if ((change.kind === "object_type" || change.kind === "object_type_binding") && change.action !== "delete" && typeof primaryKey === "string" && !primaryKey.trim()) {
    issues.push({ severity: "error", code: "missing_primary_key", message: "Object type and datasource mapping changes must define a primary key." });
  }

  if (Array.isArray(payload.property_mapping)) {
    const seen = new Set<string>();
    for (const entry of payload.property_mapping) {
      if (!entry || typeof entry !== "object") continue;
      const mapping = entry as Record<string, unknown>;
      const target = typeof mapping.target_property === "string" ? mapping.target_property : "";
      if (!mapping.source_field) issues.push({ severity: "error", code: "missing_mapping_source", message: "Datasource mappings must include source_field for each mapped property." });
      if (!target) issues.push({ severity: "error", code: "missing_mapping_target", message: "Datasource mappings must include target_property for each mapped property." });
      if (target && seen.has(target)) issues.push({ severity: "error", code: "duplicate_mapping_target", message: `Datasource mapping targets ${target} more than once.` });
      if (target) seen.add(target);
    }
  }

  if (change.kind === "interface_implementation") {
    if (Array.isArray(payload.missing_properties) && payload.missing_properties.length > 0) {
      issues.push({ severity: "error", code: "missing_interface_properties", message: "Interface implementation is missing required property mappings." });
    }
    if (Array.isArray(payload.missing_link_constraints) && payload.missing_link_constraints.length > 0) {
      issues.push({ severity: "error", code: "missing_interface_links", message: "Interface implementation is missing required link mappings." });
    }
  }

  if (change.kind === "object_view" && Array.isArray(payload.action_ids) && payload.action_ids.some((id) => !id)) {
    issues.push({ severity: "error", code: "invalid_action_reference", message: "Object View action references must point at concrete action type IDs." });
  }

  if ((change.kind === "action_type" || payload.operation_kind) && !payload.permission_key) {
    issues.push({ severity: "warning", code: "missing_permission_requirement", message: "Action changes should declare a permission key or authorization policy before save." });
  }

  if (["object_type", "property", "link_type"].includes(change.kind)) {
    issues.push({ severity: "warning", code: "object_view_impact", message: "Review downstream Object View impacts before saving this schema change." });
  }

  return issues;
}

export function reviewUnsavedOntologyChanges(
  changes: OntologyStagedChange[],
  currentUserId?: string | null,
): OntologyUnsavedChangesReviewSummary {
  const reviews = changes.map((change) => {
    const resource = ontologyChangeResource(change);
    const issues = validateOntologyStagedChange(change);
    const hasError = issues.some((issue) => issue.severity === "error");
    const hasWarning = issues.some((issue) => issue.severity === "warning");
    const author = ontologyChangeAuthor(change, currentUserId || "unknown");
    return {
      change,
      resource_kind: resource.kind,
      resource_id: resource.id,
      author,
      timestamp: change.createdAt,
      diff_summary: ontologyChangeDiffSummary(change),
      validation_issues: issues,
      validation_status: hasError ? "error" as const : hasWarning ? "warning" as const : "valid" as const,
      save_ready: !hasError,
      owned_by_current_user: Boolean(currentUserId && author === currentUserId),
    };
  });
  const errors = reviews.reduce((count, review) => count + review.validation_issues.filter((issue) => issue.severity === "error").length, 0);
  const warnings = reviews.reduce((count, review) => count + review.validation_issues.filter((issue) => issue.severity === "warning").length, 0);
  return {
    reviews,
    total: reviews.length,
    errors,
    warnings,
    save_ready: reviews.length > 0 && errors === 0,
    current_user_owned: reviews.filter((review) => review.owned_by_current_user).length,
  };
}

export function discardOntologyChange(changes: OntologyStagedChange[], changeId: string) {
  return changes.filter((change) => change.id !== changeId);
}

export function discardOntologyChangesOwnedBy(changes: OntologyStagedChange[], userId: string) {
  return changes.filter((change) => ontologyChangeAuthor(change) !== userId);
}

export interface OntologyBranch {
  id: string;
  project_id: string;
  name: string;
  description: string;
  status: "main" | "draft" | "in_review" | "rebasing" | "merged" | "closed";
  proposal_id: string | null;
  changes: OntologyStagedChange[];
  conflict_resolutions: Record<string, "main" | "branch" | "custom">;
  enable_indexing: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  latest_rebased_at: string;
}

export interface OntologyProposalTask {
  id: string;
  change_id: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  reviewer_id: string | null;
  comments: string[];
}

export interface OntologyProposalComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface OntologyProposal {
  id: string;
  project_id: string;
  branch_id: string;
  title: string;
  description: string;
  status: "draft" | "in_review" | "approved" | "merged" | "closed";
  reviewer_ids: string[];
  tasks: OntologyProposalTask[];
  comments: OntologyProposalComment[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OntologyProjectFolder {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  slug: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function listSharedPropertyTypes(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: SharedPropertyType[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/shared-property-types?${qs}`);
}

export function listObjectTypeGroups(params?: {
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.search) qs.set("search", params.search);
  return api.get<{
    data: OntologyObjectTypeGroup[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/object-type-groups?${qs}`);
}

export function createObjectTypeGroup(body: {
  name: string;
  display_name?: string;
  description?: string;
  visibility?: string;
  status?: string;
  project_id?: string | null;
  object_type_ids?: string[];
}) {
  return api.post<OntologyObjectTypeGroup>("/ontology/object-type-groups", body);
}

export function updateObjectTypeGroup(
  id: string,
  body: {
    name?: string;
    display_name?: string;
    description?: string;
    visibility?: string;
    status?: string;
    project_id?: string | null;
    object_type_ids?: string[];
  },
) {
  return api.patch<OntologyObjectTypeGroup>(
    `/ontology/object-type-groups/${id}`,
    body,
  );
}

export function deleteObjectTypeGroup(id: string) {
  return api.delete(`/ontology/object-type-groups/${id}`);
}

export function addObjectTypeToGroup(groupId: string, objectTypeId: string) {
  return api.post<OntologyObjectTypeGroup>(
    `/ontology/object-type-groups/${groupId}/object-types/${objectTypeId}`,
    {},
  );
}

export function removeObjectTypeFromGroup(groupId: string, objectTypeId: string) {
  return api.delete(
    `/ontology/object-type-groups/${groupId}/object-types/${objectTypeId}`,
  );
}

export function listProjectResources(id: string) {
  return api
    .get<{
      data: OntologyProjectResourceBinding[];
    }>(`/ontology/projects/${id}/resources`)
    .then((r) => r.data);
}

export function getProjectWorkingState(id: string) {
  return api.get<OntologyProjectWorkingState>(
    `/ontology/projects/${id}/working-state`,
  );
}

export function listProjectSavedChanges(id: string) {
  return api
    .get<{ data: OntologySavedChangeRecord[] }>(
      `/ontology/projects/${id}/saved-changes`,
    )
    .then((r) => r.data);
}

export function saveProjectOntologyChanges(
  id: string,
  body: {
    change_ids?: string[];
    branch_id?: string | null;
    proposal_id?: string | null;
    note?: string;
  } = {},
) {
  return api.post<SaveOntologyChangesResponse>(
    `/ontology/projects/${id}/save-changes`,
    body,
  );
}

export function listProjectBranches(id: string) {
  return api
    .get<{ data: OntologyBranch[] }>(`/ontology/projects/${id}/branches`)
    .then((r) => r.data);
}

export function createProjectBranch(
  id: string,
  body: {
    name: string;
    description?: string;
    changes: OntologyStagedChange[];
    enable_indexing?: boolean;
  },
) {
  return api.post<OntologyBranch>(`/ontology/projects/${id}/branches`, body);
}

export function updateProjectBranch(
  id: string,
  branchId: string,
  body: {
    description?: string;
    status?: OntologyBranch["status"];
    proposal_id?: string | null;
    changes?: OntologyStagedChange[];
    conflict_resolutions?: Record<string, "main" | "branch" | "custom">;
    enable_indexing?: boolean;
    latest_rebased_at?: string;
  },
) {
  return api.patch<OntologyBranch>(
    `/ontology/projects/${id}/branches/${branchId}`,
    body,
  );
}

export function listProjectProposals(id: string) {
  return api
    .get<{ data: OntologyProposal[] }>(`/ontology/projects/${id}/proposals`)
    .then((r) => r.data);
}

export function createProjectProposal(
  id: string,
  body: {
    branch_id: string;
    title: string;
    description?: string;
    reviewer_ids?: string[];
    tasks: OntologyProposalTask[];
    comments?: OntologyProposalComment[];
  },
) {
  return api.post<OntologyProposal>(`/ontology/projects/${id}/proposals`, body);
}

export function updateProjectProposal(
  id: string,
  proposalId: string,
  body: {
    title?: string;
    description?: string;
    status?: OntologyProposal["status"];
    reviewer_ids?: string[];
    tasks?: OntologyProposalTask[];
    comments?: OntologyProposalComment[];
  },
) {
  return api.patch<OntologyProposal>(
    `/ontology/projects/${id}/proposals/${proposalId}`,
    body,
  );
}

export function listProjectMigrations(id: string) {
  return api
    .get<{
      data: OntologyProjectMigration[];
    }>(`/ontology/projects/${id}/migrations`)
    .then((r) => r.data);
}

export function createProjectMigration(
  id: string,
  body: {
    source_project_id: string;
    target_project_id: string;
    resources: OntologyProjectMigration["resources"];
    note?: string;
  },
) {
  return api.post<OntologyProjectMigration>(
    `/ontology/projects/${id}/migrations`,
    body,
  );
}

// ────────────────────────────────────────────────────────────────
// Function packages — used by /functions, /object-monitors, /ml.
// ────────────────────────────────────────────────────────────────

export interface FunctionCapabilities {
  allow_ontology_read: boolean;
  allow_ontology_write: boolean;
  allow_ai: boolean;
  allow_network: boolean;
  timeout_seconds: number;
  max_source_bytes: number;
}

export interface FunctionPackageSummary {
  id: string;
  name: string;
  version: string;
  display_name: string;
  runtime: string;
  entrypoint: string;
  capabilities: FunctionCapabilities;
}

export interface FunctionPackage {
  id: string;
  name: string;
  version: string;
  display_name: string;
  description: string;
  runtime: string;
  source: string;
  entrypoint: string;
  capabilities: FunctionCapabilities;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface FunctionAuthoringTemplate {
  id: string;
  runtime: string;
  display_name: string;
  description: string;
  entrypoint: string;
  starter_source: string;
  default_capabilities: FunctionCapabilities;
  recommended_use_cases: string[];
  cli_scaffold_template: string | null;
  sdk_packages: string[];
}

export interface FunctionSDKPackageReference {
  language: string;
  path: string;
  package_name: string;
  generated_by: string;
}

export interface FunctionAuthoringSurface {
  templates: FunctionAuthoringTemplate[];
  sdk_packages: FunctionSDKPackageReference[];
  cli_commands: string[];
}

export interface FunctionPackageRun {
  id: string;
  function_package_id: string;
  function_package_name: string;
  function_package_version: string;
  runtime: string;
  status: "success" | "failure" | string;
  invocation_kind: "simulation" | "action" | string;
  action_id: string | null;
  action_name: string | null;
  object_type_id: string | null;
  target_object_id: string | null;
  actor_id: string;
  duration_ms: number;
  error_message: string | null;
  started_at: string;
  completed_at: string;
}

export interface FunctionPackageMetrics {
  package: FunctionPackageSummary;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  simulation_runs: number;
  action_runs: number;
  success_rate: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  max_duration_ms: number | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
}

export interface FunctionPackageInvocationBody {
  object_type_id?: string;
  target_object_id?: string;
  parameters?: Record<string, unknown>;
  justification?: string;
}

export interface ValidateFunctionPackageResponse {
  valid: boolean;
  package: FunctionPackageSummary;
  preview: unknown;
  errors: string[];
}

export interface SimulateFunctionPackageResponse {
  package: FunctionPackageSummary;
  preview: unknown;
  result: unknown;
}

export function getFunctionAuthoringSurface() {
  return api.get<FunctionAuthoringSurface>(
    "/ontology/functions/authoring-surface",
  );
}

export function listFunctionPackages(params?: {
  runtime?: string;
  search?: string;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.runtime) qs.set("runtime", params.runtime);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  return api.get<{
    data: FunctionPackage[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/functions?${qs}`);
}

export function createFunctionPackage(body: {
  name: string;
  version?: string;
  display_name?: string;
  description?: string;
  runtime: string;
  source: string;
  entrypoint?: string;
  capabilities?: Partial<FunctionCapabilities>;
}) {
  return api.post<FunctionPackage>("/ontology/functions", body);
}

export function updateFunctionPackage(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    source?: string;
    entrypoint?: string;
    capabilities?: Partial<FunctionCapabilities>;
  },
) {
  return api.patch<FunctionPackage>(`/ontology/functions/${id}`, body);
}

export function deleteFunctionPackage(id: string) {
  return api.delete(`/ontology/functions/${id}`);
}

export function listFunctionPackageRuns(
  id: string,
  params?: {
    invocation_kind?: string;
    status?: string;
    page?: number;
    per_page?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params?.invocation_kind)
    qs.set("invocation_kind", params.invocation_kind);
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const tail = qs.toString() ? `?${qs}` : "";
  return api.get<{
    data: FunctionPackageRun[];
    total: number;
    page: number;
    per_page: number;
  }>(`/ontology/functions/${id}/runs${tail}`);
}

export function listFunctionPackageMetrics(id: string) {
  return api.get<FunctionPackageMetrics>(`/ontology/functions/${id}/metrics`);
}

export function validateFunctionPackage(
  id: string,
  body: FunctionPackageInvocationBody,
) {
  return api.post<ValidateFunctionPackageResponse>(
    `/ontology/functions/${id}/validate`,
    body,
  );
}

export function simulateFunctionPackage(
  id: string,
  body: FunctionPackageInvocationBody & { object_type_id: string },
) {
  return api.post<SimulateFunctionPackageResponse>(
    `/ontology/functions/${id}/simulate`,
    body,
  );
}

export function executeFunctionPackage(
  id: string,
  body: FunctionPackageInvocationBody & { object_type_id: string },
) {
  return simulateFunctionPackage(id, body);
}

// ────────────────────────────────────────────────────────────────
// Object/Link/Property/SharedProperty mutations — used by
// /object-link-types, /ontology-manager, /ontology, /action-types.
// ────────────────────────────────────────────────────────────────

export interface PropertyInlineEditConfig {
  action_type_id?: string;
  input_name?: string | null;
}

export function createObjectType(body: {
  name: string;
  display_name?: string;
  plural_display_name?: string | null;
  description?: string;
  primary_key_property?: string;
  title_property?: string | null;
  icon?: string;
  color?: string;
  status?: string;
  visibility?: string;
  group_names?: string[];
  object_display_preferences?: Record<string, unknown>;
}) {
  return api.post<ObjectType>("/ontology/types", body);
}

export function updateObjectType(
  id: string,
  body: {
    name?: string;
    display_name?: string;
    plural_display_name?: string | null;
    description?: string;
    primary_key_property?: string;
    title_property?: string | null;
    icon?: string;
    color?: string;
    status?: string;
    visibility?: string;
    group_names?: string[];
    object_display_preferences?: Record<string, unknown>;
  },
) {
  return api.patch<ObjectType>(`/ontology/types/${id}`, body);
}

export function deleteObjectType(id: string) {
  return api.delete(`/ontology/types/${id}`);
}

export function createProperty(
  typeId: string,
  body: {
    name: string;
    display_name?: string;
    description?: string;
    property_type: string;
    value_type_id?: string | null;
    required?: boolean;
    unique_constraint?: boolean;
    time_dependent?: boolean;
    default_value?: unknown;
    validation_rules?: unknown;
    display_mode?: PropertyDisplayMode;
    value_formatting?: PropertyValueFormatting | Record<string, unknown>;
    conditional_formatting?: PropertyConditionalFormattingRule[];
    reducer_metadata?: PropertyReducerMetadata | Record<string, unknown>;
    inline_edit_config?: PropertyInlineEditConfig | null;
  },
) {
  return api.post<Property>(`/ontology/types/${typeId}/properties`, body);
}

export function updateProperty(
  typeId: string,
  propertyId: string,
  body: {
    display_name?: string;
    description?: string;
    value_type_id?: string | null;
    required?: boolean;
    unique_constraint?: boolean;
    time_dependent?: boolean;
    default_value?: unknown;
    validation_rules?: unknown;
    display_mode?: PropertyDisplayMode;
    value_formatting?: PropertyValueFormatting | Record<string, unknown>;
    conditional_formatting?: PropertyConditionalFormattingRule[];
    reducer_metadata?: PropertyReducerMetadata | Record<string, unknown>;
    inline_edit_config?: PropertyInlineEditConfig | null;
  },
) {
  return api.patch<Property>(
    `/ontology/types/${typeId}/properties/${propertyId}`,
    body,
  );
}

export function deleteProperty(typeId: string, propertyId: string) {
  return api.delete(`/ontology/types/${typeId}/properties/${propertyId}`);
}

export function createSharedPropertyType(body: {
  name: string;
  display_name?: string;
  description?: string;
  property_type: string;
  value_type_id?: string | null;
  value_formatting?: PropertyValueFormatting | Record<string, unknown>;
  conditional_formatting?: PropertyConditionalFormattingRule[];
  required?: boolean;
  unique_constraint?: boolean;
  time_dependent?: boolean;
  default_value?: unknown;
  validation_rules?: unknown;
}) {
  return api.post<SharedPropertyType>("/ontology/shared-property-types", body);
}

export function updateSharedPropertyType(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    value_type_id?: string | null;
    value_formatting?: PropertyValueFormatting | Record<string, unknown>;
    conditional_formatting?: PropertyConditionalFormattingRule[];
    required?: boolean;
    unique_constraint?: boolean;
    time_dependent?: boolean;
    default_value?: unknown;
    validation_rules?: unknown;
  },
) {
  return api.patch<SharedPropertyType>(
    `/ontology/shared-property-types/${id}`,
    body,
  );
}

export function deleteSharedPropertyType(id: string) {
  return api.delete(`/ontology/shared-property-types/${id}`);
}

export function listTypeSharedPropertyTypes(typeId: string) {
  return api
    .get<{
      data: SharedPropertyType[];
    }>(`/ontology/types/${typeId}/shared-property-types`)
    .then((response) => response.data);
}

export function attachSharedPropertyType(
  typeId: string,
  sharedPropertyTypeId: string,
) {
  return api.post<{ object_type_id: string; shared_property_type_id: string }>(
    `/ontology/types/${typeId}/shared-property-types/${sharedPropertyTypeId}`,
    {},
  );
}

export function detachSharedPropertyType(
  typeId: string,
  sharedPropertyTypeId: string,
) {
  return api.delete(
    `/ontology/types/${typeId}/shared-property-types/${sharedPropertyTypeId}`,
  );
}

export function createLinkType(body: {
  name: string;
  display_name?: string;
  description?: string;
  source_type_id: string;
  target_type_id: string;
  cardinality?: LinkTypeCardinality | string;
  label?: string;
  reverse_label?: string;
  visibility?: string;
  link_datasource_mapping?: LinkTypeDatasourceMapping | null;
}) {
  return api.post<LinkType>("/ontology/links", body);
}

export function updateLinkType(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    cardinality?: LinkTypeCardinality | string;
    label?: string;
    reverse_label?: string;
    visibility?: string;
    link_datasource_mapping?: LinkTypeDatasourceMapping | null;
  },
) {
  return api.patch<LinkType>(`/ontology/links/${id}`, body);
}

export function deleteLinkType(id: string) {
  return api.delete(`/ontology/links/${id}`);
}

// Rule mutations + simulation
export function createRule(body: {
  name: string;
  display_name?: string;
  description?: string;
  object_type_id: string;
  evaluation_mode?: RuleEvaluationMode;
  trigger_spec?: RuleTriggerSpec;
  effect_spec?: RuleEffectSpec;
}) {
  return api.post<OntologyRule>("/ontology/rules", body);
}

export function updateRule(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    evaluation_mode?: RuleEvaluationMode;
    trigger_spec?: RuleTriggerSpec;
    effect_spec?: RuleEffectSpec;
  },
) {
  return api.patch<OntologyRule>(`/ontology/rules/${id}`, body);
}

export function simulateRule(
  id: string,
  body: { object_id: string; properties_patch?: Record<string, unknown> },
) {
  return api.post<{
    rule: OntologyRule;
    matched: boolean;
    trigger_payload: Record<string, unknown>;
    effect_preview: Record<string, unknown> | null;
    object: ObjectInstance;
  }>(`/ontology/rules/${id}/simulate`, body);
}

export function applyRule(
  id: string,
  body: { object_id: string; properties_patch?: Record<string, unknown> },
) {
  return api.post<{
    rule: OntologyRule;
    matched: boolean;
    trigger_payload: Record<string, unknown>;
    effect_preview: Record<string, unknown> | null;
    object: ObjectInstance;
  }>(`/ontology/rules/${id}/apply`, body);
}

export function deleteRule(id: string) {
  return api.delete(`/ontology/rules/${id}`);
}
