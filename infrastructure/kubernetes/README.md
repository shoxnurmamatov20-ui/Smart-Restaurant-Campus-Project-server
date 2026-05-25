# Kubernetes manifests (production)

Bu papka kelajakda Kubernetes deploymentlar uchun (Phase 2 yoki 3).

## Hozir nima qilamiz

**Hozir** — Docker Compose ishlatamiz (universitet serverida).

**Keyinroq** (10K+ concurrent user'ga yetganda) — Kubernetes'ga o'tamiz.

## Tuzilma (rejada)

```
kubernetes/
├── base/                    # Asosiy manifestlar (Kustomize base)
│   ├── api/
│   ├── web/
│   ├── admin/
│   ├── ai-services/
│   ├── postgres/
│   ├── redis/
│   └── kustomization.yaml
└── overlays/                # Environment-specific (Kustomize overlays)
    ├── dev/
    ├── staging/
    └── production/
```

## Alternativlar
- **K3s** — lightweight K8s for single server (universitet uchun moskelishi mumkin)
- **Docker Swarm** — oraliq variant (kerak bo'lsa)
