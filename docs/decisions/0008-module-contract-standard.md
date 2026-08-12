# ADR-0008: Module contract standard

**Status:** accepted
**Date:** 2026-05-26
**Decision makers:** Project owner + architect

## Context

The platform will grow from 10 Phase-1 modules to 30 modules. Without a contract standard, module boundaries will blur and future extraction to services will be expensive.

## Decision

Every module must expose functionality through API routes, services, events, jobs, resources, policies, and tests following `docs/architecture/module-contracts.md`.

## Consequences

Positive:

- module ownership is clear
- API and event behavior stays predictable
- microservice extraction remains possible
- QA can use the same acceptance checklist for every module

Negative:

- new modules require more upfront structure
- small CRUD modules still need tests and policies

## Alternatives considered

| Option                          | Reason not chosen                                    |
| ------------------------------- | ---------------------------------------------------- |
| Free-form module implementation | Faster initially, but breaks at 30 modules           |
| Microservices contracts now     | Too much operational weight before Phase 1 is stable |
