"""HTTP clients for downstream domain services.

Thin wrappers around `httpx.AsyncClient` so route handlers and the Kafka
consumer can fetch/post domain data without repeating URL construction
or error mapping. Tests mock these modules rather than patching httpx.
"""
