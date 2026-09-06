# ADR-0010: Real time through SSE and Redis pub/sub

- Status: proposed
- Date: 2026-09-05
- Spec sources: FR-WEB-01, NFR-03, NFR-06, T-40

## Context

The live screen must reflect a confirmed event within 5 seconds with several stateless API instances.

## Decision

After the transaction commits, the API publishes a short event to the Redis channel `site:<id>`. The SSE hub in every instance is subscribed to the channel and fans events out to panel clients, filtering by access scope. The client invalidates cached queries. Fallback mode: polling every 5 seconds.

## Consequences

Traffic is one-way, no WebSocket needed. A missed pub/sub message loses no data because the client re-reads the state. An alert on SSE lag is needed.

## Rejected alternatives

WebSocket: bidirectionality is not needed, harder behind proxies. Polling only: 5 seconds of delay for everyone and needless load.
