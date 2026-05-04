#!/bin/bash
# Create all required Kafka topics
# Run this once after Kafka starts
# Usage: bash scripts/create_kafka_topics.sh <kafka_container_name>

CONTAINER=${1:-kafka3}
BROKER="localhost:9092"

topics=(
  "job.viewed"
  "job.saved"
  "connection.requested"
  "profile.viewed"
  "application.submitted"
  "application.statusChanged"
  "message.sent"
  "ai.requests"
  "ai.results"
)

for topic in "${topics[@]}"; do
  docker exec $CONTAINER /opt/kafka/bin/kafka-topics.sh \
    --create --bootstrap-server $BROKER \
    --topic "$topic" \
    --partitions 1 \
    --replication-factor 1 \
    --if-not-exists 2>/dev/null
  echo "Created topic: $topic"
done

echo "All topics created!"
docker exec $CONTAINER /opt/kafka/bin/kafka-topics.sh \
  --list --bootstrap-server $BROKER
