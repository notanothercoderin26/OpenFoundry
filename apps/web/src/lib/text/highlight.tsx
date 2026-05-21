import { Fragment, type ReactNode } from 'react';

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Splits `text` against `needles` (case-insensitive) and returns
 * ReactNode[] with each match wrapped in a `<mark>` element. Empty
 * needles fall back to the original text.
 */
export function highlightTerms(text: string, needles: string | string[]): ReactNode {
  if (!text) return text;
  const list = (Array.isArray(needles) ? needles : [needles])
    .map((needle) => needle?.trim())
    .filter((needle): needle is string => Boolean(needle));
  if (list.length === 0) return text;

  const pattern = new RegExp(`(${list.map((needle) => needle.replace(ESCAPE_REGEX, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  const matchSet = new Set(list.map((needle) => needle.toLowerCase()));
  return parts.map((part, index) => {
    if (matchSet.has(part.toLowerCase())) {
      return <mark key={index}>{part}</mark>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
