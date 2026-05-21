// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { highlightTerms } from './highlight';

afterEach(() => cleanup());

function htmlOf(node: ReturnType<typeof highlightTerms>) {
  const { container } = render(<>{node}</>);
  return container.innerHTML;
}

describe('highlightTerms', () => {
  it('returns the text unchanged when needles are empty', () => {
    expect(highlightTerms('hello world', '')).toBe('hello world');
    expect(highlightTerms('hello world', [])).toBe('hello world');
    expect(highlightTerms('', 'x')).toBe('');
  });

  it('wraps a case-insensitive match in <mark>', () => {
    const html = htmlOf(highlightTerms('Anaktuvuk Pass Airport', 'pass'));
    expect(html).toBe('Anaktuvuk <mark>Pass</mark> Airport');
  });

  it('handles multiple needles in one call', () => {
    const html = htmlOf(highlightTerms('Pass to Airport', ['pass', 'airport']));
    expect(html).toBe('<mark>Pass</mark> to <mark>Airport</mark>');
  });

  it('escapes regex metacharacters in the needle', () => {
    const html = htmlOf(highlightTerms('cost = $4.99 today', '$4.99'));
    expect(html).toBe('cost = <mark>$4.99</mark> today');
  });

  it('returns the original text when nothing matches', () => {
    expect(highlightTerms('hello', 'world')).toBe('hello');
  });
});
