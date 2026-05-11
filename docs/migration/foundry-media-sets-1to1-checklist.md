# Foundry Media Sets 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's Media Sets and
unstructured-data surface: media set creation, schema and primary-format
configuration, additional input formats, multimodal media sets, media items,
media item paths, path overwrite semantics, media references, direct upload,
Data Connection media syncs, virtual media sets, media transactions,
transactionless media sets, soft deletion, API operations, Pipeline Builder and
Code Repository media transforms, incremental media-set transforms, media-set
outputs, media access patterns, preview/rendering, OCR, audio transcription,
video/document/image/DICOM/raster handling, media in Ontology, media in
Workshop, media in Functions/OSDK handoffs, usage/cost limits, QoS retry
behavior, retention, permissions, and governance.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable media
import/transform/render workflows, compatible resource models where useful, and
OpenFoundry-native implementation details that can be tested locally.

## Parity scope boundary

All checklist work is governed by the
[Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).
OpenFoundry may implement behavior described in public Palantir documentation,
but contributors must not copy private source, decompile bundles, import
tenant-specific exports, use Palantir branding, or reuse proprietary assets.
The product target is functional parity in an OpenFoundry-native implementation,
not a pixel-perfect clone.

This checklist covers the Media Sets resource family and media-specific runtime
semantics. It should integrate with the Data Foundation checklist for dataset
metadata, transactions, builds, schedules, retention, and Data Health; with the
Streaming/Data Connection checklist for source setup, media sync, virtual media
set syncs, and external systems; with the Ontology/Object Views checklist for
media reference properties and object rendering; with the Workshop checklist for
media widgets and upload actions; with the Functions checklist for media item
access; and with the Geospatial/Map checklist for raster media and map tiling.
It should not duplicate those broader product surfaces.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `todo` | Not implemented or not yet verified in OpenFoundry. |
| `partial` | Some surface exists, but behavior is incomplete or not wired end-to-end. |
| `blocked` | Requires a platform dependency, public documentation, or product decision. |
| `done` | Implemented, tested, documented, and verified through UI or API smoke tests. |

## Priority vocabulary

| Priority | Meaning |
| --- | --- |
| `P0` | Required for credible demo and production workflows that ingest, preview, reference, and transform PDF/image/audio/video media. |
| `P1` | Required for Foundry-style Media Sets parity beyond simple uploads and previews. |
| `P2` | Advanced, governance-heavy, high-scale, specialized-format, or cost/retention-oriented parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Media Sets overview and settings

- [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats)
- [Data integration media sets](https://www.palantir.com/docs/foundry/data-integration/media-sets/)
- [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/)
- [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/)
- [Virtual media sets](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/virtual-media-sets/)
- [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/)

### Media Set API

- [Media Set basics API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/media-set-basics)
- [Create Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/create-media-transaction)
- [Commit Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/commit-media-transaction)
- [Abort Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/abort-media-transaction)
- [Put Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/put-media-item/)
- [Get Media Item Info API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-info)
- [Get Media Item Metadata API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-metadata)
- [Get Media Item Reference API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-reference)
- [Get Media Item RID by Path API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-rid-by-path)
- [Read Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/read-media-item)
- [Read Original Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/read-original-media-item)
- [Transform Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/transform-media-item)
- [Get Transformation Job Status API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-transformation-job-status)
- [Get Transformation Job Result API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-transformation-job-result)
- [Upload Media API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/upload-media)

### Import, sync, virtual storage, and data connection

- [Data Connection media set syncs](https://www.palantir.com/docs/foundry/data-connection/media-set-sync)
- [Data Connection core concepts](https://www.palantir.com/docs/foundry/data-connection/core-concepts/)
- [File-based syncs](https://www.palantir.com/docs/foundry/data-connection/file-based-syncs/)
- [External transforms](https://www.palantir.com/docs/foundry/data-connection/external-transforms)

### Transforms, Pipeline Builder, and code repositories

- [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media)
- [Add a media set output](https://www.palantir.com/docs/foundry/pipeline-builder/outputs-add-media-set-output/)
- [Create a media set batch pipeline with Code Repositories](https://www.palantir.com/docs/foundry/building-pipelines/create-batch-pipeline-cr-media-sets/)
- [Use media sets with Python transforms](https://www.palantir.com/docs/foundry/transforms-python/media-sets/)
- [Incremental media sets](https://www.palantir.com/docs/foundry/transforms-python-spark/incremental-media-sets)

### Ontology, Workshop, Functions, OSDK, and raster

- [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/)
- [Using media in Workshop](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-workshop/)
- [Upload media workflow](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/upload-media)
- [Functions media](https://www.palantir.com/docs/foundry/functions/media)
- [Use raster data](https://www.palantir.com/docs/foundry/geospatial/raster_data/)
- [Example media workflows overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-workflows-overview)
- [Add a DICOM media set](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/add-dicom-media-set)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Media set | `media_set` | Project/folder-managed unstructured-data resource with schema type, primary format, additional input formats, storage policy, transaction policy, permissions, and health. |
| Media set schema | `media_schema_type` | Audio, DICOM, document, email, image, spreadsheet, video, and multimodal schema definition with supported primary formats. |
| Primary format | `media_primary_format` | Required canonical format accepted or produced by a media set. |
| Additional input format | `media_additional_input_format` | Optional upload-time conversion input format for non-virtual media sets. |
| Multimodal media set | `multimodal_media_set` | Media set allowing multiple schema/file types with limited preview and access-pattern support for unsupported schemas. |
| Media item | `media_item` | Individual media file entry with RID/ID, path, media set, version, schema, format, content metadata, upload source, deletion state, and storage pointer. |
| Media item path | `media_item_path` | Logical media item path used for path lookup, overwrite, deduplication, and listing. |
| Media reference | `media_reference` | Stable reference to a media item used in datasets, Ontology properties, actions, Functions, OSDK, Object Views, Workshop, and model adapters. |
| Media transaction | `media_transaction` | Transactional upload scope with create, put item, commit, abort, and output-build semantics. |
| Transaction policy | `media_transaction_policy` | `transactional` or `transactionless` write behavior with different rollback, concurrency, and incremental-transform semantics. |
| Storage policy | `media_storage_policy` | Stored-in-OpenFoundry, virtual external-source storage, or transformed-derived storage metadata. |
| Virtual media set | `virtual_media_set` | Media set interface over external media files registered from a supported source without copying originals into OpenFoundry storage. |
| Media sync | `media_set_sync` | Data Connection sync from external file/blob source into a stored or virtual media set. |
| Media transform | `media_transform` | Pipeline Builder or Code Repository transformation over media sets, media references, and media items. |
| Access pattern | `media_access_pattern` | On-demand type-specific operation such as render, OCR, transcription, waveform, HLS, frame extraction, image crop, document text extraction, or metadata read. |
| Media preview | `media_preview` | Permission-aware rendered preview with schema-specific viewer state and cached derived artifacts. |
| Derived media artifact | `media_derived_artifact` | Generated thumbnail, rendered page, tile, waveform, transcript, frame, PDF, OCR output, or transformed item persisted or cached with provenance. |
| Media reference property | `media_reference_property` | Ontology object property pointing to one backing media set and used by Object Views, Workshop, Functions, and OSDK. |
| Media upload action | `media_upload_action` | Action type parameter and writeback flow that uploads media only after successful action submission. |
| Media usage meter | `media_usage_meter` | Compute/storage/download/stream accounting for access patterns, previews, downloads, and transformations. |
| Media QoS event | `media_qos_event` | 429/503-style throttling or overload event that should trigger retry/backoff and health reporting. |

## Milestone A: minimum viable Media Sets parity

### Media set creation and basic browsing

- [ ] `MS.1` Media set CRUD and project placement (`P0`, `todo`)
  - Create, get, list, update metadata, move, archive/delete, and restore media sets.
  - Track name, description, project/folder, owner, created/updated timestamps, schema type, primary format, transaction policy, storage policy, permissions, and usage links.
  - Show media set tabs for Overview, Items, Upload, Syncs, Transactions, References, Transforms, Ontology, Usage, Settings, Health, and History.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Media Set basics API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/media-set-basics), [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/).

- [ ] `MS.2` Schema type and primary format selection (`P0`, `todo`)
  - Support audio, DICOM, document, email, image, spreadsheet, video, and multimodal media set schema types.
  - Validate primary formats against schema type, including PDF, DOCX/PPTX/TXT-as-additional-input, EML, PNG, JPEG, JP2K, BMP, TIFF, NITF, DICOM, XLSX, MP4, MOV, TS, MKV, WAV, FLAC, MP3, NIST SPHERE, and WEBM where locally supported.
  - Explain unsupported PDF/XLSX limitations and unsupported preview behavior in setup and upload flows.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.3` Additional input formats (`P0`, `todo`)
  - Allow compatible additional input formats during creation and from the media set details/settings page.
  - Convert additional input files to the primary format upon upload.
  - Reject additional input formats for virtual media sets and unsupported primary-format combinations.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/).

- [ ] `MS.4` Multimodal media sets (`P0`, `todo`)
  - Support multimodal media sets that accept multiple file/schema types.
  - Mark preview and access-pattern support as available only for supported schema types.
  - Require validation/filtering before type-specific access patterns run on multimodal items.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.5` Media item browser and detail view (`P0`, `todo`)
  - List media items by path, upload source, schema, format, size, created time, deletion state, transaction, and latest-by-path state.
  - Provide path search, filters, sort, pagination, item preview, metadata panel, reference copy, original download/read, transformed read, and delete controls.
  - Show overwritten and directly referenced historical items when deduplication is disabled or a saved reference points to them.
  - Docs: [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/), [Get Media Item Info API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-info), [Get Media Item RID by Path API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-rid-by-path).

### Uploads, transactions, references, and deletion

- [ ] `MS.6` Direct upload flow (`P0`, `todo`)
  - Upload files by drag-and-drop and file picker from empty and populated media set pages.
  - Validate file extension, schema, primary/additional input format, path length, file size, permissions, and transaction policy before upload.
  - Show upload progress, conversion progress, successful item list, failed item list, retry actions, and final item links.
  - Docs: [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/), [Put Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/put-media-item/).

- [ ] `MS.7` Path overwrite and deduplication semantics (`P0`, `todo`)
  - Overwrite the latest visible item when uploading a new item at the same path.
  - Do not require confirmation before overwrite when mirroring documented path behavior, but show clear warnings in OpenFoundry UI.
  - Preserve direct media references to overwritten items and allow transforms/listing to include overwritten items when deduplication is disabled.
  - Docs: [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.8` Transactional media set lifecycle (`P0`, `todo`)
  - Support create media transaction, put media items in transaction, commit transaction, abort transaction, list history, and expose transaction state in item details.
  - Ensure committed items become readable only after transaction commit.
  - Ensure aborted transaction items do not appear in current media set views.
  - Docs: [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/), [Create Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/create-media-transaction), [Commit Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/commit-media-transaction), [Abort Media Transaction API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/abort-media-transaction).

- [ ] `MS.9` Transactionless media set lifecycle (`P0`, `todo`)
  - Support immediate-read uploads and concurrent writers for transactionless media sets.
  - Make failed-build behavior explicit: successfully written items remain visible when a build fails.
  - Disable replace/snapshot behavior and empty-view reset flows that are not supported for transactionless media sets.
  - Docs: [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/), [Incremental media sets](https://www.palantir.com/docs/foundry/transforms-python-spark/incremental-media-sets).

- [ ] `MS.10` Media references (`P0`, `todo`)
  - Generate stable media references for items by RID/ID and path.
  - Store references in datasets using media reference column metadata/typeclass.
  - Ensure references to overwritten items keep rendering the original media item.
  - Provide copy reference, API reference, and dataset-output helper actions.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Get Media Item Reference API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/get-media-item-reference).

- [ ] `MS.11` Soft deletion and delete limitations (`P0`, `todo`)
  - Soft-delete media items from the UI with explicit confirmation.
  - Hide deleted items from normal browsing while preserving direct reference access according to local retention/security policy.
  - Block media item deletion for build-updated media sets when documented behavior requires that limitation.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

### Preview and basic access patterns

- [ ] `MS.12` Media preview shell (`P0`, `todo`)
  - Provide schema-specific previews for documents, images, audio, video, spreadsheets, DICOM, email, multimodal supported items, and unsupported fallback downloads.
  - Support original media read and transformed/preview media read where applicable.
  - Enforce permissions and do not cache preview artifacts across user security contexts.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Read Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/read-media-item), [Read Original Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/read-original-media-item).

- [ ] `MS.13` Document and image preview transformations (`P0`, `todo`)
  - Render PDF pages and page regions as images.
  - Generate image thumbnails, rotate/resize/crop/chip/contrast/grayscale derived views where locally supported.
  - Support raw text extraction and OCR for documents/images when configured.
  - Docs: [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

- [ ] `MS.14` Audio and video preview transformations (`P0`, `todo`)
  - Stream audio/video with browser-compatible playback and HLS-derived artifacts when needed.
  - Generate waveform/transcription for audio where configured.
  - Extract audio, frames at timestamp, scene frame timestamps, and representative scene frames from video where locally supported.
  - Docs: [Using media in Workshop](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-workshop/), [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

- [ ] `MS.15` Spreadsheet, email, and DICOM preview basics (`P0`, `todo`)
  - Preview XLSX spreadsheets with documented limitations around advanced formulas and embedded files.
  - Render email metadata/body/attachments where locally supported.
  - Render DICOM image layers and metadata where locally supported.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Add a DICOM media set](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/add-dicom-media-set), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

## Milestone B: credible Foundry-style Media Sets parity

### Data Connection media syncs and virtual media sets

- [ ] `MS.16` Media set sync setup from Data Connection (`P1`, `todo`)
  - Create media set syncs from supported file/blob sources.
  - Select media file types, output media set, build schedule, source subfolder, and filters such as exclude already synced, path matches, file size limit, and ignore items not matching schema.
  - Allow run-now and history viewing from the media set and source overview pages.
  - Docs: [Data Connection media set syncs](https://www.palantir.com/docs/foundry/data-connection/media-set-sync), [File-based syncs](https://www.palantir.com/docs/foundry/data-connection/file-based-syncs/).

- [ ] `MS.17` Media sync run history and output semantics (`P1`, `todo`)
  - Track build ID, schedule ID, source path, filter results, files discovered, files imported, files ignored, bytes imported, conversion failures, item paths, output transaction, and logs.
  - Link run history to Data Foundation build/schedule history and Data Health.
  - Docs: [Data Connection media set syncs](https://www.palantir.com/docs/foundry/data-connection/media-set-sync), [Data Connection core concepts](https://www.palantir.com/docs/foundry/data-connection/core-concepts/).

- [ ] `MS.18` Virtual media set sync setup (`P1`, `todo`)
  - Create virtual media set syncs for locally supported source types without copying original files into OpenFoundry backing storage.
  - Reject agent connections and unsupported credential/source combinations when virtual media sets do not support them.
  - Disable additional input formats for virtual media sets.
  - Docs: [Virtual media sets](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/virtual-media-sets/), [Data Connection media set syncs](https://www.palantir.com/docs/foundry/data-connection/media-set-sync).

- [ ] `MS.19` Virtual media item registration from transforms (`P1`, `todo`)
  - Register virtual media items from code transforms using source references and physical paths.
  - Persist physical path, logical media item path, source RID/ID, source configuration version, registration run, and access errors.
  - Allow custom sync/filtering logic when default virtual media sync filters are insufficient.
  - Docs: [Virtual media sets](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/virtual-media-sets/), [External transforms](https://www.palantir.com/docs/foundry/data-connection/external-transforms).

- [ ] `MS.20` Virtual media limitations and derived storage (`P1`, `todo`)
  - Show that virtual media sets are not aware of external source updates/deletions unless refreshed by a sync/registration job.
  - Surface broken virtual item access when external files are deleted or credentials change.
  - Persist transformed outputs and derived artifacts in OpenFoundry storage with cost/retention metadata.
  - Docs: [Virtual media sets](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/virtual-media-sets/), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

### Pipeline Builder and Code Repository transforms

- [ ] `MS.21` Pipeline Builder media inputs and transformations (`P1`, `todo`)
  - Add media set inputs to Pipeline Builder graphs.
  - Provide common boards/nodes for text extraction/OCR, audio transcription, image processing, LLM-with-media handoffs, and media reference generation.
  - Preview selected media transform outputs before build where feasible.
  - Docs: [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.22` Pipeline Builder media set outputs (`P1`, `todo`)
  - Add media set outputs from the outputs panel or selected media-producing node.
  - Configure output media set name, media type/schema, primary format, save folder, and build behavior.
  - Enforce that Pipeline Builder media set outputs are transactional only where that limitation is mirrored.
  - Docs: [Add a media set output](https://www.palantir.com/docs/foundry/pipeline-builder/outputs-add-media-set-output/).

- [ ] `MS.23` Code Repository media set batch transforms (`P1`, `todo`)
  - Support `MediaSetInput` and `MediaSetOutput`-style transform contracts in OpenFoundry-native code transforms.
  - Allow get media item by RID/path, list items by path with media references, stream item bytes, and write output media items.
  - Require output media set existence before code references it unless a local auto-create policy is implemented.
  - Docs: [Create a media set batch pipeline with Code Repositories](https://www.palantir.com/docs/foundry/building-pipelines/create-batch-pipeline-cr-media-sets/), [Use media sets with Python transforms](https://www.palantir.com/docs/foundry/transforms-python/media-sets/).

- [ ] `MS.24` Incremental media set transforms (`P1`, `todo`)
  - Support incremental media set inputs/outputs with v2-style semantics.
  - Implement read modes `added`, `previous`, and `current`, plus deduplicate-by-path controls.
  - Implement output write modes `modify` and `replace` with transactionless restrictions.
  - Docs: [Incremental media sets](https://www.palantir.com/docs/foundry/transforms-python-spark/incremental-media-sets).

- [ ] `MS.25` Incremental eligibility and branch behavior (`P1`, `todo`)
  - Detect when media set outputs cannot run incrementally because another transform modified them, user uploads/deletes occurred, or input contents were replaced.
  - Recommend snapshot builds on new branches when the output is empty and incremental fallback branches are unsupported.
  - Fail transactionless media set outputs when the transform cannot run incrementally and `replace` would be required.
  - Docs: [Incremental media sets](https://www.palantir.com/docs/foundry/transforms-python-spark/incremental-media-sets), [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/).

- [ ] `MS.26` Incremental batch limits and abort semantics (`P1`, `todo`)
  - Support batch limits for incremental media set inputs before path deduplication.
  - Prevent aborting individual media set outputs during incremental builds and provide whole-job abort guidance.
  - Preserve future incremental build eligibility after safe aborts.
  - Docs: [Incremental media sets](https://www.palantir.com/docs/foundry/transforms-python-spark/incremental-media-sets), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

### Ontology, Workshop, Functions, and OSDK integration

- [ ] `MS.27` Media references in datasets (`P1`, `todo`)
  - Create metadata datasets with media reference columns and inline thumbnails where supported.
  - Preserve media references across path overwrites and media set transformations.
  - Validate media reference columns in schema/preview and make them usable by Pipeline Builder, Ontology Manager, and model adapters.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/).

- [ ] `MS.28` Ontology media reference properties (`P1`, `todo`)
  - Add media reference properties to object types and declare backing media set capabilities.
  - Render media references efficiently in Object Views, Object Explorer, Workshop, and Map.
  - Warn against media reference lists and multiple backing media sets for action-upload workflows when unsupported.
  - Docs: [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/), [Use raster data](https://www.palantir.com/docs/foundry/geospatial/raster_data/).

- [ ] `MS.29` Media upload actions (`P1`, `todo`)
  - Support action parameters of media reference type for single and bulk media uploads.
  - Upload media to the backing media set only after successful form submission to avoid orphaned media from canceled or failed actions.
  - Pre-fill or update object media reference properties after action success.
  - Docs: [Upload media workflow](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/upload-media), [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/).

- [ ] `MS.30` Workshop media widgets (`P1`, `todo`)
  - Provide Media preview, Audio recorder, Image annotation, PDF viewer, Spreadsheet display, Video display, and Audio/transcription display widgets where locally supported.
  - Bind widgets to media reference properties, media item references, action uploads, and object selections.
  - Degrade gracefully when a media schema has no specialized viewer.
  - Docs: [Using media in Workshop](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-workshop/), [Upload media workflow](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/upload-media).

- [ ] `MS.31` Functions media item operations (`P1`, `todo`)
  - Provide function APIs for reading raw media data and running common type-specific media operations.
  - Support media items passed from object media reference properties or media reference action parameters where local function runtime supports it.
  - Enforce memory limits and recommend small-media interaction patterns for function execution.
  - Docs: [Functions media](https://www.palantir.com/docs/foundry/functions/media), [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/).

- [ ] `MS.32` OSDK/media application handoff (`P1`, `todo`)
  - Expose media reference read/preview/download helpers in generated SDKs where OpenFoundry supports OSDK-style clients.
  - Ensure SDK media reads enforce object/media set permissions and do not expose backing storage URLs without policy checks.
  - Docs: [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

### Specialized formats and geospatial/raster

- [ ] `MS.33` Raster media set support (`P1`, `todo`)
  - Support TIFF/GeoTIFF, NITF, and JPEG2000 raster media set workflows where locally supported.
  - Generate media references usable by Ontology object types and Map layers.
  - Enforce map display limits and fallback to transform-level processing for unsupported raster formats such as PNG/JPEG when needed.
  - Docs: [Use raster data](https://www.palantir.com/docs/foundry/geospatial/raster_data/).

- [ ] `MS.34` DICOM workflow support (`P1`, `todo`)
  - Import DICOM media sets, map DICOM files/items, preview DICOM image layers, and expose DICOM metadata to transforms and object properties where locally supported.
  - Provide medical-imaging-specific unsupported-feature messages without copying proprietary viewer behavior.
  - Docs: [Add a DICOM media set](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/add-dicom-media-set), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.35` Audio transcription workflows (`P1`, `todo`)
  - Transcribe audio media sets from Pipeline Builder, Code Repositories, Functions, or access-pattern services.
  - Store transcript artifacts, optional timestamps, language/performance mode metadata, and provenance back to datasets or object properties.
  - Docs: [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Functions media](https://www.palantir.com/docs/foundry/functions/media), [Example media workflows overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-workflows-overview).

- [ ] `MS.36` Document OCR and text extraction workflows (`P1`, `todo`)
  - Extract machine-readable text and OCR text from documents/images.
  - Store raw text, OCR text, page-level metadata, table of contents, form fields, and extraction provenance in output datasets.
  - Support LLM and model-adapter handoffs using media references or derived text datasets.
  - Docs: [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/), [Functions media](https://www.palantir.com/docs/foundry/functions/media).

## Milestone C: advanced scale, governance, and operations

### Usage, limits, QoS, and performance

- [ ] `MS.37` Media usage metering (`P2`, `todo`)
  - Track compute-seconds-like usage for download/stream, render, OCR, transcription, HLS streaming, video frame extraction, image operations, document operations, and DICOM rendering.
  - Attribute usage to media set, media item, transform/build, user, application, function, and access pattern.
  - Show usage panels and exportable metrics for cost-aware operations.
  - Docs: [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

- [ ] `MS.38` Media set limits enforcement (`P2`, `todo`)
  - Enforce item path length limits, max item file size, transaction item limits for transactional media sets, and unsupported incremental batch-size assumptions.
  - Provide user-facing errors that include media set, item path, limit type, and remediation.
  - Docs: [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

- [ ] `MS.39` QoS throttling and retries (`P2`, `todo`)
  - Treat 429/503 or local QoS overload responses as retryable for upload, transform, preview, registration, and read operations.
  - Provide exponential backoff, retry budgets, partial-success reporting, and resumable batch behavior for large media imports.
  - Surface persistent QoS failures in Data Health.
  - Docs: [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

- [ ] `MS.40` Derived artifact cache and invalidation (`P2`, `todo`)
  - Cache derived thumbnails, rendered pages, waveforms, transcripts, HLS segments, tiles, OCR text, and extracted frames with provenance.
  - Invalidate or version derived artifacts when source item, access pattern version, permissions, or transformation parameters change.
  - Ensure virtual media derived artifacts persist in OpenFoundry storage and follow retention policy.
  - Docs: [Virtual media sets](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/virtual-media-sets/), [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/).

### Security, policy, and retention

- [ ] `MS.41` Media set permissions and object security (`P2`, `todo`)
  - Enforce media set view/edit/manage/upload/delete permissions independently from object type and object instance permissions.
  - Ensure media references in objects do not grant access to inaccessible media items.
  - Propagate restricted-view/object-security decisions to Object Views, Workshop, Functions, OSDK, Map, and previews.
  - Docs: [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.42` Granular media item policies (`P2`, `blocked`)
  - Support item-level access policies and per-item policy configuration when OpenFoundry security/governance primitives are available.
  - Include policy-aware preview, transform, function, and download behavior.
  - Mark blocked until local object/media policy model is defined.
  - Docs: [Example media workflows overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-workflows-overview), [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/).

- [ ] `MS.43` Retention and deletion lifecycle (`P2`, `todo`)
  - Configure media item retention and retention policy previews from media set settings.
  - Distinguish soft deletion, hard deletion/expiration, direct-reference availability, derived artifact deletion, and virtual item registration deletion.
  - Integrate with Data Foundation retention and audit logs.
  - Docs: [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/), [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats).

- [ ] `MS.44` Sensitive data and redaction hooks (`P2`, `blocked`)
  - Add hooks for scanning media OCR text, transcripts, metadata, filenames, and extracted document fields for sensitive content.
  - Redact previews and derived text where policy requires it.
  - Mark blocked until sensitive-data scanner/media policy integration is implemented locally.
  - Docs: [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media), [Using media in the Ontology](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-ontology/).

### Advanced API, interoperability, and operations

- [ ] `MS.45` Media Sets API compatibility surface (`P2`, `todo`)
  - Provide OpenFoundry-native API endpoints for media set basics, create/commit/abort transactions, put item, upload media, get item info/metadata, get reference, path-to-ID lookup, read item, read original item, transform item, and transformation job status/result.
  - Return stable errors for unsupported schema, invalid path, item not found, transaction not open, transaction policy mismatch, permission denied, QoS throttling, and virtual source inaccessible.
  - Docs: [Media Set basics API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/media-set-basics), [Put Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/put-media-item/), [Transform Media Item API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/transform-media-item), [Upload Media API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/upload-media).

- [ ] `MS.46` Bulk migration from datasets and external files (`P2`, `todo`)
  - Convert unstructured dataset files into media sets through transforms or guided migration.
  - Preserve original file path, source dataset transaction, checksum, metadata, and optional generated media references.
  - Support rollback or dry-run reports for large migrations.
  - Docs: [Importing media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/importing-media/), [Use media sets with Python transforms](https://www.palantir.com/docs/foundry/transforms-python/media-sets/).

- [ ] `MS.47` Media model-adapter and AIP handoffs (`P2`, `todo`)
  - Support media references as inputs to model adapters and LLM/media transformations where OpenFoundry AI services support them.
  - Track derived text/image/audio/video artifacts and model inputs for reproducibility.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Transforming media](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/transforming-media).

- [ ] `MS.48` Media operational health (`P2`, `todo`)
  - Monitor upload failures, conversion failures, preview failures, transform failures, source sync failures, virtual source broken items, QoS throttling, usage spikes, retention failures, and permission mismatches.
  - Surface media set health in Data Health, media set overview, source overview, build history, and Object View/Workshop diagnostics.
  - Docs: [Media usage costs and limits](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-usage-limits/), [Data Connection media set syncs](https://www.palantir.com/docs/foundry/data-connection/media-set-sync).

- [ ] `MS.49` Audit trail (`P2`, `todo`)
  - Emit immutable audit events for media set creation, settings changes, upload, transaction commit/abort, deletion, reference generation, preview/read/download, transform, sync, virtual registration, policy change, and retention action.
  - Filter audit by media set, item, path, reference, user, source, transform, object, action, function, and time window.
  - Docs: [Media Set basics API](https://www.palantir.com/docs/foundry/api/media-sets-v2-resources/media-sets/media-set-basics), [Advanced media set settings](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-set-settings/).

- [ ] `MS.50` Marketplace and product packaging hooks (`P2`, `todo`)
  - Package media set definitions, media reference property dependencies, Object Views/Workshop media widgets, and derived transform pipelines into product bundles where DevOps/Marketplace support exists.
  - Exclude raw customer media by default unless an explicit OpenFoundry product policy permits packaging sample media.
  - Docs: [Media sets overview](https://www.palantir.com/docs/foundry/media-sets-advanced-formats), [Using media in Workshop](https://www.palantir.com/docs/foundry/media-sets-advanced-formats/media-in-workshop/).

## Implementation inventory to collect before coding

- [ ] `INV.1` Identify existing OpenFoundry media set, media item, file storage, object storage, and dataset unstructured-file primitives.
- [ ] `INV.2` Identify existing API routes and SDKs for media set CRUD, item upload/read, transaction creation/commit/abort, and media reference generation.
- [ ] `INV.3` Identify existing Data Connection media sync, file sync, virtual media, source registration, credential, and egress primitives.
- [ ] `INV.4` Identify existing Pipeline Builder and Code Repository media input/output transform support, including Python sidecar libraries and media set output committers.
- [ ] `INV.5` Identify existing incremental transform, branch, build, schedule, transaction, abort, and batch-limit primitives that can support incremental media sets.
- [ ] `INV.6` Identify existing preview/render services for PDFs, images, audio, video, spreadsheets, DICOM, email, raster, HLS, thumbnails, OCR, transcription, and waveforms.
- [ ] `INV.7` Identify existing Ontology media reference property, Object View rendering, Object Explorer, Map, and Workshop widget support.
- [ ] `INV.8` Identify existing action upload, media reference parameter, function media item, OSDK media helper, and object edit flows.
- [ ] `INV.9` Identify existing permissions, markings, object security, restricted view, retention, audit, and sensitive-data scanning primitives that must protect media.
- [ ] `INV.10` Identify existing usage metering, QoS throttling, retry/backoff, Data Health, notification, and operational metrics support.
- [ ] `INV.11` Identify existing geospatial/raster support and limitations for TIFF/GeoTIFF, NITF, JPEG2000, map tiling, and Object View/Map rendering.
- [ ] `INV.12` Produce a machine-readable parity matrix sibling JSON after inventory, following the pattern of [foundry-feature-parity-matrix.json](./foundry-feature-parity-matrix.json).

## Suggested service boundaries

| Surface | Responsibilities |
| --- | --- |
| `media-set-service` | Media set CRUD, schema/format settings, transaction policy, item metadata, path lookup, reference generation, soft deletion, read/original read APIs. |
| `media-storage-service` | Object storage, virtual storage pointers, checksum/size metadata, conversion outputs, derived artifact storage, retention deletion, storage policy enforcement. |
| `media-transform-service` | Access patterns, OCR, transcription, document/image/video/audio transformations, DICOM render, raster tiling, derived artifact provenance. |
| `connector-management-service` | Media set sync source setup, virtual media set syncs, source credentials, egress, agent compatibility, sync filters. |
| `pipeline-build-service` | Pipeline Builder media inputs/outputs, media transform nodes, media output commits, build/run history, incremental eligibility, batch limits. |
| `dataset-versioning-service` | Media reference metadata datasets, table columns with media reference typeclass, lineage to source datasets and media sets. |
| `ontology-definition-service` | Media reference object properties, backing media set capabilities, object type validation, action media parameter definitions. |
| `ontology-actions-service` | Action uploads, transactional action media writes, function-backed media action handoff, orphan prevention. |
| `functions service` | Media item runtime access, raw read, type-specific operations, memory guardrails, function media reference parameters. |
| `workshop service` | Media preview widgets, audio recorder, image annotation, specialized viewers, upload action forms. |
| `geospatial/map service` | Raster media references, map tiling, geospatial image previews, map display limits. |
| `security/governance service` | Media permissions, object security propagation, item policies, sensitive-data redaction, checkpoints, audit policy. |
| `data-health service` | Media sync health, preview/transform health, usage spikes, QoS throttling, broken virtual item health, retention failures. |
| `apps/web` | Media set UI, upload flow, item browser, preview viewers, sync setup handoff, settings, usage, health, transaction/history panels. |

## Acceptance criteria for first complete Media Sets milestone

- [ ] A user can create a media set with schema type, primary format, additional input formats, transaction policy, storage policy, and project/folder placement.
- [ ] A user can directly upload media, see validation/conversion progress, browse media items, preview them, download/read originals, and retrieve media references.
- [ ] Path overwrites preserve old direct references and show latest-by-path behavior in normal browsing.
- [ ] Transactional media sets support create transaction, put items, commit, abort, and committed-only visibility.
- [ ] Transactionless media sets expose immediate-read behavior and clearly warn about failed-build partial writes.
- [ ] A user can create a media set sync from a supported source, configure filters, run it, and see media items plus sync run history.
- [ ] A user can create a virtual media set from a supported source, register items without copying originals, and see broken-source limitations when external files disappear.
- [ ] Pipeline Builder can read media sets, run at least one media transform, and write a transactional media set output.
- [ ] Code transforms can read media items by RID/path, list media references, and write output media items.
- [ ] Ontology object types can use media reference properties backed by a media set, and Object Views/Workshop can render the referenced media.
- [ ] Workshop can upload media through an action without creating orphaned media when the action is canceled or fails.
- [ ] Functions can read small media items and run at least one type-specific media operation with memory guardrails.
- [ ] Data Health surfaces media sync failures, preview failures, transform failures, virtual source broken items, and QoS throttling.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for media set schema/format validation, additional input format compatibility, path overwrite semantics, media reference stability, transaction state transitions, transactionless write behavior, soft deletion, item path limits, and permission checks.
- API tests for media set CRUD, create/commit/abort transaction, put item, get item info, get item reference, get item by path, read item, read original item, delete item, upload validation, and virtual item registration.
- Integration tests for direct upload conversion, media set sync from Data Connection, virtual media set registration, Pipeline Builder media output commit, Code Repository media transforms, incremental media transform eligibility, media reference datasets, Ontology media properties, Workshop upload actions, and Functions media operations.
- E2E tests for create media set, upload/preview/delete item, path overwrite/reference behavior, media sync setup/run, virtual media set setup, Pipeline Builder media output, Object View media rendering, Workshop media upload action, and usage/health panels.
- Regression tests proving aborted transaction items are not visible, failed action uploads do not leave orphan media, unauthorized users cannot preview/read referenced media, virtual source deletion does not corrupt media metadata, and QoS retry logic does not duplicate committed items unexpectedly.
