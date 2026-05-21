export interface ExplorerTabDefinition<T extends string> {
  id: T;
  label: string;
  /** When defined, rendered as a count chip after the label. */
  count?: number;
}

export interface ExplorerTabsProps<T extends string> {
  tabs: ReadonlyArray<ExplorerTabDefinition<T>>;
  active: T;
  onChange: (next: T) => void;
}

export function ExplorerTabs<T extends string>({ tabs, active, onChange }: ExplorerTabsProps<T>) {
  return (
    <div className="oe-tabs" role="tablist">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className="oe-tab"
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="oe-chip">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
