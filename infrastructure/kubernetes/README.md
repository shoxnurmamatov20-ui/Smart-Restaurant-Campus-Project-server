# Kubernetes manifests (production)

Bu papka production/K3s deploymentlar uchun baseline manifestlarni saqlaydi.

## Hozirgi holat

**Local/dev** - Docker Compose.

**Production path** - K3s yoki Kubernetes, `base/` manifestlari va environment overlaylar orqali.

## Tuzilma

```text
kubernetes/
  base/
    namespace.yaml
    configmap.yaml
    secret.example.yaml
    api.yaml
    web.yaml
    admin.yaml
    ai-services.yaml
    hpa.yaml
    pdb.yaml
    kustomization.yaml
  overlays/
    staging/
    production/
```

## Qo'llash

```bash
kubectl apply -f base/secret.example.yaml # faqat real secret qiymatlar bilan almashtirilgandan keyin
kubectl apply -k base
```

## Muhim eslatma

`restaurant-campus-api` hozir PHP-FPM container sifatida ishlaydi. HTTP ingress uchun production overlayda Nginx/FastCGI gateway yoki alohida gateway deployment qo'shiladi. `base/` workload, scaling, secret/config va disruption policy standartini belgilaydi.
