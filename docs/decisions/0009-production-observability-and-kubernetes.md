# ADR-0009: Production observability and Kubernetes baseline

**Status:** accepted
**Date:** 2026-05-26
**Decision makers:** Project owner + architect

## Context

Docker Compose is enough for local development and early single-server rollout. A 30-module platform needs a defined production path with alerts, scalable workers, and repeatable manifests.

## Decision

Keep Docker Compose as the default developer environment. Add Kubernetes/K3s manifests as the production baseline and wire Prometheus alert rules plus Alertmanager for observability.

## Consequences

Positive:

- production path is visible before the codebase grows further
- app replicas, queue workers, and AI services can scale independently
- alerting becomes part of the repository, not tribal knowledge

Negative:

- Kubernetes manifests require environment-specific image tags and secrets
- stateful services still need explicit backup and restore operations

## Alternatives considered

| Option                              | Reason not chosen                                |
| ----------------------------------- | ------------------------------------------------ |
| Compose only forever                | Not enough for zero-downtime deploys and scaling |
| Full managed Kubernetes immediately | Too heavy before first institution rollout       |
| Docker Swarm                        | Smaller ecosystem and weaker long-term path      |
