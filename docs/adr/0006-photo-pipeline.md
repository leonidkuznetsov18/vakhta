# ADR-0006: Photo pipeline in the worker with private storage

- Status: proposed
- Date: 2026-09-05
- Spec sources: 5.7, 12.2, 13, FR-PHO-02…06, T-24…T-26, T-39

## Context

Photos are the evidence base of a zone handover, but Telegram does not guarantee the capture moment, and files cannot be served through public URLs. A technical quality check and repeat detection are needed, and they must not punish automatically.

## Decision

The webhook stores only `file_id` and `file_unique_id` and puts a job into the `media` queue. The worker downloads the file through `getFile`, puts it into a private bucket of an S3-compatible store, computes dimensions, brightness, SHA-256 and a perceptual hash, looks for exact and near duplicates and sets `quality_status`. A suspicion moves the photo to manual review and does not reduce the score. Delivery only through a presigned GET with a 5-minute TTL; every view and export is audited.

## Consequences

The webhook stays fast. A handover draft with already uploaded photos survives a disconnect on the third photo. Media retention with a legal hold on deletion is required. A stricter capture mode is possible through a Mini App at a later stage.

## Rejected alternatives

Synchronous download in the webhook: slow, breaks p95 ≤ 2 s. Storing only the Telegram `file_id`: the file may disappear, access is not controlled.
