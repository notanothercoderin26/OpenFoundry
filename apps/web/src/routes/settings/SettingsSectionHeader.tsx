import type { ReactNode } from 'react';

interface SettingsSectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  filter?: {
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
  };
  actions?: ReactNode;
}

export function SettingsSectionHeader({
  eyebrow,
  title,
  description,
  filter,
  actions,
}: SettingsSectionHeaderProps) {
  return (
    <header className="settings-section__header">
      <div>
        {eyebrow && <p className="of-eyebrow">{eyebrow}</p>}
        <h2 className="of-heading-lg">{title}</h2>
        {description && (
          <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 640 }}>
            {description}
          </p>
        )}
      </div>
      <div className="settings-section__header-actions">
        {filter && (
          <div className="settings-filter">
            <span className="settings-filter__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="settings-filter__input"
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              placeholder={filter.placeholder ?? 'Filter…'}
            />
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
