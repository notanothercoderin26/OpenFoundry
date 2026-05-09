export type CredentialInputKind =
  | 'api_key'
  | 'auth_header'
  | 'aws_access_key'
  | 'aws_secret_key'
  | 'oauth_token'
  | 'password'
  | 'private_key'
  | 'service_account_json'
  | 'username';

export interface CredentialPanelField {
  key: string;
  label: string;
  kind: CredentialInputKind;
  requiredForTest?: boolean;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
}

interface CredentialsPanelProps {
  fields: CredentialPanelField[];
  values: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}

function inputType(kind: CredentialInputKind) {
  return kind === 'username' ? 'text' : 'password';
}

export function CredentialsPanel({ fields, values, disabled = false, onChange }: CredentialsPanelProps) {
  if (fields.length === 0) {
    return (
      <section style={{ display: 'grid', gap: 6 }}>
        <p className="of-eyebrow">Credentials</p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          This connector can be created without a credential field in the wizard.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">Credentials</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Values are sent only when the source is created and are masked in the form.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {fields.map((field) => (
          <label key={field.key} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
              {field.label}
              {field.requiredForTest ? <span className="of-text-muted"> (needed for test)</span> : null}
            </span>
            {field.multiline ? (
              <textarea
                value={values[field.key] ?? ''}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={disabled}
                placeholder={field.placeholder}
                className="of-textarea"
                style={{ minHeight: 92, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            ) : (
              <input
                type={inputType(field.kind)}
                value={values[field.key] ?? ''}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={disabled}
                placeholder={field.placeholder}
                className="of-input"
              />
            )}
            {field.description ? (
              <span className="of-text-muted" style={{ fontSize: 11 }}>
                {field.description}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </section>
  );
}
