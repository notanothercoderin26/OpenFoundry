import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AppHeaderCollapseContext, useAppHeaderCollapsed } from './AppHeaderCollapseContext';

function Probe() {
  const collapsed = useAppHeaderCollapsed();
  return <span data-testid="probe">{collapsed ? 'collapsed' : 'expanded'}</span>;
}

describe('AppHeaderCollapseContext', () => {
  it('defaults to false outside any provider', () => {
    const html = renderToString(<Probe />);
    expect(html).toContain('expanded');
    expect(html).not.toContain('collapsed');
  });

  it('returns the provider value when wrapped', () => {
    const html = renderToString(
      <AppHeaderCollapseContext.Provider value={true}>
        <Probe />
      </AppHeaderCollapseContext.Provider>,
    );
    expect(html).toContain('collapsed');
  });

  it('isolates nested providers — inner wins', () => {
    const html = renderToString(
      <AppHeaderCollapseContext.Provider value={true}>
        <AppHeaderCollapseContext.Provider value={false}>
          <Probe />
        </AppHeaderCollapseContext.Provider>
      </AppHeaderCollapseContext.Provider>,
    );
    expect(html).toContain('expanded');
  });
});
