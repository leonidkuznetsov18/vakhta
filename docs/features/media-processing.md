# Reliable media processing

Photos received in Telegram are copied to private storage and checked for dimensions, brightness
and suspected duplicates. A low-quality or suspected duplicate photo remains available for human
review; processing does not impose a penalty.

A temporary download, upload or database failure can be retried without asking the worker to send
another photo. Processing status and its completion event are committed together. Repeating an
attempt uses the same storage location, including across a month boundary. Older completed records
missing their completion event can be repaired from saved metadata without downloading again.

Private file access and retention policy are unchanged. Required durable scheduling is being
implemented separately; this first correction protects attempts that reach the media processor.
