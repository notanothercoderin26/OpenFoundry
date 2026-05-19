import { createContext, useContext } from 'react';

/**
 * Set to true when the surrounding AppHeader is rendered in a vertical
 * collapsed state. Widgets that live in the header (e.g. Button Group)
 * read this to switch to an icon-only / compact layout.
 *
 * Defaults to false so widgets outside the header — the vast majority —
 * keep their normal layout unconditionally.
 */
export const AppHeaderCollapseContext = createContext<boolean>(false);

export function useAppHeaderCollapsed(): boolean {
  return useContext(AppHeaderCollapseContext);
}
