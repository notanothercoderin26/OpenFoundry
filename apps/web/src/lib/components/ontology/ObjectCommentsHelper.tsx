import { useState, type FormEvent } from 'react';

import {
  appendObjectComment,
  deleteObjectComment,
  editObjectComment,
  objectCommentEntryPermissions,
  type ObjectCommentThread,
  type OntologyPermissionPrincipal,
} from '@/lib/api/ontology';

interface ObjectCommentsHelperProps {
  thread: ObjectCommentThread | null;
  principal: OntologyPermissionPrincipal;
  authorDisplayName: string;
  onThreadChange: (thread: ObjectCommentThread) => void;
  onClose?: () => void;
}

function attachmentDrafts(value: string) {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export function ObjectCommentsHelper({
  thread,
  principal,
  authorDisplayName,
  onThreadChange,
  onClose,
}: ObjectCommentsHelperProps) {
  const [draft, setDraft] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingBody, setEditingBody] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) return;
    const result = appendObjectComment(thread, {
      body: draft,
      principal,
      authorDisplayName,
      attachments: attachmentDrafts(attachmentDraft),
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    onThreadChange(result.thread);
    setDraft('');
    setAttachmentDraft('');
    setError('');
  }

  function saveEdit(commentId: string) {
    if (!thread) return;
    const result = editObjectComment(thread, { commentId, body: editingBody, principal });
    if (result.error) {
      setError(result.error);
      return;
    }
    onThreadChange(result.thread);
    setEditingId('');
    setEditingBody('');
    setError('');
  }

  function remove(commentId: string) {
    if (!thread) return;
    const result = deleteObjectComment(thread, { commentId, principal });
    if (result.error) {
      setError(result.error);
      return;
    }
    onThreadChange(result.thread);
    setError('');
  }

  if (!thread) {
    return (
      <section className="of-panel" style={{ padding: 14 }}>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
          Select an object to open object-scoped comments.
        </p>
      </section>
    );
  }

  const activeComments = thread.comments.filter((comment) => !comment.deleted_at);

  return (
    <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 14 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Object comments helper</p>
          <h3 className="of-heading-md" style={{ marginTop: 4 }}>Comments on {thread.object_id || 'object'}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <span className="of-chip">{thread.surface === 'object_explorer' ? 'Object Explorer' : 'Object View'}</span>
            <span className="of-chip">Object-scoped</span>
            <span className="of-chip of-status-success">Distinct from Workshop Comment widget</span>
            <span className={`of-chip ${thread.permissions.can_comment ? 'of-status-success' : 'of-status-warning'}`}>
              {thread.permissions.can_comment ? 'Can comment' : 'Read only'}
            </span>
          </div>
        </div>
        {onClose ? (
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>

      {!thread.permissions.can_view ? (
        <div className="of-status-warning" style={{ padding: 10, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {thread.permissions.reason}
        </div>
      ) : null}

      {error ? (
        <div className="of-status-danger" style={{ padding: 10, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {thread.permissions.can_comment ? (
        <form onSubmit={submit} className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 10 }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="of-input"
            rows={3}
            placeholder="Add a comment. Use @name to mention someone."
          />
          <input
            value={attachmentDraft}
            onChange={(event) => setAttachmentDraft(event.target.value)}
            className="of-input"
            placeholder="Optional attachments: screenshot.png, notes.pdf"
          />
          <button type="submit" className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
            Add comment
          </button>
        </form>
      ) : null}

      <div style={{ display: 'grid', gap: 8 }}>
        {activeComments.map((comment) => {
          const permissions = objectCommentEntryPermissions(thread, comment, principal);
          const editing = editingId === comment.id;
          return (
            <article key={comment.id} className="of-panel-muted" style={{ display: 'grid', gap: 8, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{comment.author_display_name}</strong>
                  <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11 }}>
                    {new Date(comment.created_at).toLocaleString()} · {comment.source_surface}
                    {comment.edited_at ? ' · edited' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {permissions.can_edit ? (
                    <button
                      type="button"
                      className="of-button"
                      style={{ fontSize: 12 }}
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditingBody(comment.body);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  {permissions.can_delete ? (
                    <button type="button" className="of-button" style={{ fontSize: 12 }} onClick={() => remove(comment.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              {editing ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} className="of-input" rows={3} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="of-button of-button--primary" onClick={() => saveEdit(comment.id)}>
                      Save edit
                    </button>
                    <button type="button" className="of-button" onClick={() => setEditingId('')}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.body}</p>
              )}
              {comment.mentions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {comment.mentions.map((mention) => (
                    <span key={mention.id} className="of-chip">@{mention.handle}</span>
                  ))}
                </div>
              ) : null}
              {comment.attachments.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {comment.attachments.map((attachment) => (
                    <span key={attachment.id} className="of-chip">
                      {attachment.kind}: {attachment.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
        {activeComments.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
            No object comments yet.
          </p>
        ) : null}
      </div>

      <details>
        <summary className="of-eyebrow" style={{ cursor: 'pointer' }}>
          Activity history · {thread.activity.length} events · {thread.notifications.length} notifications
        </summary>
        <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
          {thread.activity.slice(-8).map((event) => (
            <li key={event.id}>
              {event.message} <span className="of-text-muted">{new Date(event.timestamp).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
