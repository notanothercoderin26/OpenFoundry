# NotImplemented parity audit

This audit covers every Go catalog row whose handler status is
`not_implemented`. The runtime short-circuits `not_implemented` before
handler dispatch and returns the stable `NOT_IMPLEMENTED` transform
envelope with `compute_seconds: 0`, no output payload, and the catalog
reason verbatim.

`geo_tile` and `render_sheet` intentionally left this audit when their
Go adapters were wired: `geo_tile` now uses `libs/geospatial-tiles` for
XYZ coordinate validation, tile paths, and descriptors before rendering
PNG raster tiles; `render_sheet` is an explicit in-process CSV/JSON
adapter because notebook-runtime-service has no spreadsheet-render HTTP
route to call today.

| Key | Reason | Parity decision |
| --- | --- | --- |
| `embedding` | `Image embeddings depend on libs/ai-kernel which is not yet wired.` | Keep as `not_implemented`; no AI-kernel image embedding handler is wired. |
| `transcription` | `Transcription depends on libs/ai-kernel (Whisper / VLM) which is not yet wired.` | Keep as `not_implemented`; no Whisper/VLM sidecar is wired. |
| `layout_aware_v2` | `Layout-aware extraction depends on libs/ai-kernel which is not yet wired.` | Keep as `not_implemented`; no layout-aware AI-kernel handler is wired. |
| `vlm_extract` | `VLM extraction depends on libs/ai-kernel which is not yet wired.` | Keep as `not_implemented`; no VLM extraction handler is wired. |

Regression coverage lives in:

- `internal/catalog/catalog_test.go`, which pins the remaining audited
  catalog subset and canonical reasons.
- `internal/server/server_test.go`, which asserts that each audited key
  returns the `NOT_IMPLEMENTED` transform envelope.
- `internal/handlers/image_ops_test.go` and `internal/server/server_test.go`,
  which exercise the native `geo_tile` and `render_sheet` adapters.
