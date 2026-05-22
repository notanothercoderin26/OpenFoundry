import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

interface CreateDocumentPanelProps {
  onBlank: () => void;
  onFromTemplate: () => void;
  onDocumentTemplate: () => void;
  disabled?: boolean;
}

interface Card {
  key: 'blank' | 'from-template' | 'document-template';
  icon: GlyphName;
  title: string;
  description: string;
  onClick: () => void;
}

export function CreateDocumentPanel({
  onBlank,
  onFromTemplate,
  onDocumentTemplate,
  disabled,
}: CreateDocumentPanelProps) {
  const cards: Card[] = [
    {
      key: 'blank',
      icon: 'document',
      title: 'Blank document',
      description:
        'Create an object-aware collaborative rich-text document with widgets and other embedded content from Foundry applications.',
      onClick: onBlank,
    },
    {
      key: 'from-template',
      icon: 'duplicate',
      title: 'New from template',
      description:
        'Create a document from a template to efficiently populate it with relevant data and content tailored to the specific use case.',
      onClick: onFromTemplate,
    },
    {
      key: 'document-template',
      icon: 'list',
      title: 'Document template',
      description:
        'Create a blueprint that allows users to generate a new document on demand based on given selected objects.',
      onClick: onDocumentTemplate,
    },
  ];

  return (
    <section className="of-create-doc-panel" aria-label="Create a new document">
      <h2 className="of-create-doc-panel__title">Create a new document</h2>
      <div className="of-create-doc-panel__grid">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className="of-create-doc-card"
            onClick={card.onClick}
            disabled={disabled}
          >
            <span className="of-create-doc-card__icon" aria-hidden="true">
              <Glyph name={card.icon} size={20} />
            </span>
            <span className="of-create-doc-card__body">
              <span className="of-create-doc-card__title">{card.title}</span>
              <span className="of-create-doc-card__desc">{card.description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
