import { DropdownMenu, type DropdownMenuItem } from '@/lib/components/ui/DropdownMenu';

// File / View / Help menubar that sits under the document topbar.
// Presentational: every action is a callback the parent owns. Items
// without a handler are rendered disabled so the structure stays
// stable as the surrounding features land.
export interface DocumentMenuBarProps {
  // ── File ──────────────────────────────────────────────────────────
  isFavorite: boolean;
  exporting?: boolean;
  saving?: boolean;
  printDisabled?: boolean;
  saveDisabled?: boolean;
  onNewDocument: () => void;
  onNewFromTemplate: () => void;
  onOpenDocument: () => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopyPath?: () => void;
  onShare?: () => void;
  onToggleFavorite?: () => void;
  onAddTags?: () => void;
  onSaveAsTemplate?: () => void;
  onSaveNow?: () => void;
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportDOCX?: () => void;
  onMoveToTrash?: () => void;

  // ── View ──────────────────────────────────────────────────────────
  outlineOpen?: boolean;
  historyOpen?: boolean;
  commentsHidden?: boolean;
  onToggleOutline?: () => void;
  onToggleHistory?: () => void;
  onToggleComments?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;

  // ── Help ──────────────────────────────────────────────────────────
  onViewDocumentation?: () => void;
  onKeyboardShortcuts?: () => void;
}

export function DocumentMenuBar(props: DocumentMenuBarProps) {
  const file: DropdownMenuItem[] = [
    { kind: 'item', key: 'new', label: 'New document', icon: 'document', onClick: props.onNewDocument },
    { kind: 'item', key: 'new-from-tpl', label: 'New from template', icon: 'duplicate', onClick: props.onNewFromTemplate },
    { kind: 'item', key: 'open', label: 'Open document…', icon: 'folder-open', onClick: props.onOpenDocument },
    { kind: 'separator' },
    { kind: 'item', key: 'dup', label: 'Duplicate file', icon: 'duplicate', onClick: props.onDuplicate, disabled: !props.onDuplicate },
    { kind: 'item', key: 'rename', label: 'Rename', icon: 'pencil', onClick: props.onRename, disabled: !props.onRename },
    { kind: 'item', key: 'move', label: 'Move…', icon: 'move', onClick: props.onMove, disabled: !props.onMove },
    { kind: 'item', key: 'copy-path', label: 'Copy full path', icon: 'link', onClick: props.onCopyPath, disabled: !props.onCopyPath },
    { kind: 'separator' },
    { kind: 'item', key: 'share', label: 'Share…', icon: 'share', onClick: props.onShare, disabled: !props.onShare },
    {
      kind: 'item',
      key: 'favorite',
      label: props.isFavorite ? 'Unfavorite' : 'Favorite',
      icon: props.isFavorite ? 'star-filled' : 'star',
      onClick: props.onToggleFavorite,
      disabled: !props.onToggleFavorite,
    },
    { kind: 'item', key: 'tags', label: 'Add tags…', icon: 'tag', onClick: props.onAddTags, disabled: !props.onAddTags },
    { kind: 'separator' },
    { kind: 'item', key: 'save-as-tpl', label: 'Save as template…', icon: 'duplicate', onClick: props.onSaveAsTemplate, disabled: !props.onSaveAsTemplate },
    {
      kind: 'item',
      key: 'save-now',
      label: props.saving ? 'Saving…' : 'Save now',
      icon: 'autosaved',
      onClick: props.onSaveNow,
      disabled: props.saveDisabled,
    },
    {
      kind: 'item',
      key: 'print',
      label: 'Print…',
      icon: 'document',
      onClick: props.onPrint,
      disabled: props.printDisabled,
    },
    {
      kind: 'item',
      key: 'export-pdf',
      label: props.exporting ? 'Exporting…' : 'Export as PDF…',
      icon: 'document',
      onClick: props.onExportPDF,
      disabled: props.exporting || !props.onExportPDF,
    },
    {
      kind: 'item',
      key: 'export-docx',
      label: props.exporting ? 'Exporting…' : 'Export as DOCX…',
      icon: 'document',
      onClick: props.onExportDOCX,
      disabled: props.exporting || !props.onExportDOCX,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      key: 'trash',
      label: 'Move to trash…',
      icon: 'trash',
      danger: true,
      onClick: props.onMoveToTrash,
      disabled: !props.onMoveToTrash,
    },
  ];

  const view: DropdownMenuItem[] = [
    {
      kind: 'item',
      key: 'history',
      label: props.historyOpen ? 'Hide version history' : 'Show version history',
      icon: 'history',
      onClick: props.onToggleHistory,
      disabled: !props.onToggleHistory,
    },
    {
      kind: 'item',
      key: 'outline',
      label: props.outlineOpen ? 'Hide outline' : 'Show outline',
      icon: 'list',
      onClick: props.onToggleOutline,
      disabled: !props.onToggleOutline,
    },
    {
      kind: 'item',
      key: 'comments',
      label: props.commentsHidden ? 'Show comments' : 'Hide comments',
      icon: 'mail',
      onClick: props.onToggleComments,
      disabled: !props.onToggleComments,
    },
    { kind: 'separator' },
    { kind: 'item', key: 'zoom-in', label: 'Zoom in', icon: 'plus', shortcut: 'Ctrl +', onClick: props.onZoomIn, disabled: !props.onZoomIn },
    { kind: 'item', key: 'zoom-out', label: 'Zoom out', icon: 'plus', shortcut: 'Ctrl −', onClick: props.onZoomOut, disabled: !props.onZoomOut },
    { kind: 'item', key: 'zoom-reset', label: 'Reset zoom', icon: 'circle-x', shortcut: 'Ctrl 0', onClick: props.onResetZoom, disabled: !props.onResetZoom },
  ];

  const help: DropdownMenuItem[] = [
    {
      kind: 'item',
      key: 'docs',
      label: 'View documentation',
      icon: 'book-open',
      onClick: props.onViewDocumentation,
      disabled: !props.onViewDocumentation,
    },
    {
      kind: 'item',
      key: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: 'help',
      shortcut: '?',
      onClick: props.onKeyboardShortcuts,
      disabled: !props.onKeyboardShortcuts,
    },
  ];

  return (
    <div className="of-doc-menubar" role="menubar" aria-label="Document menu">
      <DropdownMenu label="File" items={file} triggerClassName="of-doc-menubar__trigger" />
      <DropdownMenu label="View" items={view} triggerClassName="of-doc-menubar__trigger" />
      <DropdownMenu label="Help" items={help} triggerClassName="of-doc-menubar__trigger" />
    </div>
  );
}
