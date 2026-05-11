import {
  objectTypeAPIName,
  objectTypePluralDisplayName,
  objectTypeTitleProperty,
  type ObjectInstance,
  type ObjectType,
} from '@/lib/api/ontology';

export interface ObjectSetTitleProps {
  source_variable_id: string;
  contains_single_object: boolean;
  show_icon: boolean;
  title_override: string;
  render_when_empty: boolean;
  empty_object_type_id: string;
  empty_title: string;
}

export interface ObjectSetTitleModel {
  shouldRender: boolean;
  title: string;
  subtitle: string;
  count: number;
  state: 'loading' | 'empty' | 'single' | 'count';
  showIcon: boolean;
  icon: string;
  color: string;
}

const TITLE_PROPERTY_CANDIDATES = ['title', 'name', 'label', 'display_name', 'trail_name'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringProp(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function boolProp(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function readObjectSetTitleProps(raw: Record<string, unknown> | null | undefined): ObjectSetTitleProps {
  return {
    source_variable_id: stringProp(raw?.source_variable_id),
    contains_single_object: boolProp(raw?.contains_single_object ?? raw?.single_object, false),
    show_icon: boolProp(raw?.show_icon, true),
    title_override: stringProp(raw?.title_override, stringProp(raw?.title_template)),
    render_when_empty: boolProp(raw?.render_when_empty, false),
    empty_object_type_id: stringProp(raw?.empty_object_type_id),
    empty_title: stringProp(raw?.empty_title),
  };
}

export function buildObjectSetTitleModel({
  props,
  variableName,
  objectType,
  emptyObjectType,
  objects,
  total,
  loading = false,
}: {
  props: ObjectSetTitleProps;
  variableName: string;
  objectType: ObjectType | null;
  emptyObjectType?: ObjectType | null;
  objects: ObjectInstance[];
  total: number;
  loading?: boolean;
}): ObjectSetTitleModel {
  const effectiveObjectType = objectType ?? emptyObjectType ?? null;
  const iconSource = effectiveObjectType ?? objectType ?? emptyObjectType ?? null;
  const icon = objectTypeIcon(iconSource);
  const color = objectTypeColor(iconSource);
  const showIcon = props.show_icon;
  const safeTotal = Math.max(0, total);

  if (loading) {
    return {
      shouldRender: true,
      title: props.title_override || 'Loading object set',
      subtitle: 'Loading...',
      count: safeTotal,
      state: 'loading',
      showIcon,
      icon,
      color,
    };
  }

  if (props.contains_single_object) {
    const object = objects[0] ?? null;
    if (object) {
      return {
        shouldRender: true,
        title: props.title_override || objectTitle(object, objectType),
        subtitle: objectTypeName(objectType, variableName),
        count: safeTotal || objects.length,
        state: 'single',
        showIcon,
        icon,
        color,
      };
    }
    if (!props.render_when_empty) return hiddenModel(showIcon, icon, color);
    const placeholderType = emptyObjectType ?? objectType;
    return {
      shouldRender: true,
      title: props.empty_title || props.title_override || `No ${objectTypePluralName(placeholderType, variableName).toLowerCase()}`,
      subtitle: objectTypeName(placeholderType, variableName),
      count: 0,
      state: 'empty',
      showIcon,
      icon: objectTypeIcon(placeholderType),
      color: objectTypeColor(placeholderType),
    };
  }

  if (safeTotal === 0 && !props.render_when_empty) return hiddenModel(showIcon, icon, color);
  const typeName = safeTotal === 1 ? objectTypeName(objectType, variableName) : objectTypePluralName(objectType, variableName);
  return {
    shouldRender: true,
    title: props.title_override || `${safeTotal.toLocaleString()} ${typeName}`,
    subtitle: props.title_override ? `${safeTotal.toLocaleString()} ${typeName}` : '',
    count: safeTotal,
    state: safeTotal === 0 ? 'empty' : 'count',
    showIcon,
    icon,
    color,
  };
}

export function objectTitle(object: ObjectInstance, objectType: ObjectType | null | undefined) {
  const props = object.properties ?? {};
  const titleProperty = objectTypeTitleProperty(objectType);
  const candidates = [titleProperty, ...TITLE_PROPERTY_CANDIDATES, objectType?.primary_key_property ?? '']
    .filter((entry): entry is string => Boolean(entry));
  for (const key of candidates) {
    const value = props[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return object.id;
}

function objectTypeName(objectType: ObjectType | null | undefined, fallback: string) {
  return objectType?.display_name || objectType?.name || (objectType ? objectTypeAPIName(objectType) : '') || fallback || 'Objects';
}

function objectTypePluralName(objectType: ObjectType | null | undefined, fallback: string) {
  return objectType ? objectTypePluralDisplayName(objectType) : fallback || 'Objects';
}

function objectTypeIcon(objectType: ObjectType | null | undefined) {
  const raw = stringProp(objectType?.icon, 'cube');
  return raw.trim() || 'cube';
}

function objectTypeColor(objectType: ObjectType | null | undefined) {
  const raw = objectType?.color;
  return typeof raw === 'string' && raw.trim() ? raw : '#2d72d2';
}

function hiddenModel(showIcon: boolean, icon: string, color: string): ObjectSetTitleModel {
  return {
    shouldRender: false,
    title: '',
    subtitle: '',
    count: 0,
    state: 'empty',
    showIcon,
    icon,
    color,
  };
}

export function objectSetTitleObjectTypeIDFromProps(props: Record<string, unknown> | null | undefined) {
  if (!isRecord(props)) return '';
  return stringProp(props.empty_object_type_id);
}
