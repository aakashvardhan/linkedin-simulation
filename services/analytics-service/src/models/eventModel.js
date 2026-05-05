const mongoose = require('mongoose');

// The events collection is the single source of truth for all analytics.
// Every domain event from every service flows into this collection via the Kafka consumer.
// Shape matches the agreed standard Kafka envelope so no transformation is needed on write.
const eventSchema = new mongoose.Schema({
  event_type:      { type: String, required: true },  // e.g. "job.viewed", "application.submitted"
  trace_id:        { type: String, default: null },   // end-to-end workflow ID
  timestamp:       { type: Date,   required: true },  // when the event happened (from envelope)
  actor_id:        { type: String, default: null },   // member_id or recruiter_id who triggered it
  entity_type:     { type: String, default: null },   // "job", "application", "thread", etc.
  entity_id:       { type: String, default: null },   // the specific entity ID
  payload:         { type: mongoose.Schema.Types.Mixed, default: {} }, // domain-specific fields
  idempotency_key: { type: String, required: true },  // unique per event — prevents double-writes
  kafka_topic:     { type: String, default: null },   // which topic this came from
  kafka_partition: { type: Number, default: null },   // which partition — useful for debugging
  ingested_at:     { type: Date,   default: Date.now }, // when M6 wrote it to Mongo
});

// ── Indexes ───────────────────────────────────────────────────────────────────

// UNIQUE on idempotency_key — this is the idempotency enforcement at the DB layer.
// Even if the consumer check-then-write has a tiny race, MongoDB will reject
// a second document with the same key via this unique constraint.
// eventSchema.index({ idempotency_key: 1 }, { unique: true }); // Index already created by api-backend

// Compound index for the most common query pattern:
// "give me all events of type X within time window Y"
// This covers: top jobs, funnel, geo, saves-per-day, profile-views queries.
// eventSchema.index({ event_type: 1, timestamp: -1 });

// Index for entity-specific queries — "all events for job_id X"
// Used by the funnel and geo endpoints.
// eventSchema.index({ entity_type: 1, entity_id: 1, timestamp: -1 });

// Index for actor-specific queries — "all profile views for member X"
// Used by the member dashboard endpoint.
// eventSchema.index({ actor_id: 1, event_type: 1, timestamp: -1 });

const EventLog = mongoose.model('EventLog', eventSchema, 'events');
// Third argument 'events' forces the collection name to be "events" regardless
// of Mongoose's default pluralisation rules. All services that query this
// collection must use the same name.

module.exports = EventLog;