# GCP Infrastructure

This folder contains GCP deployment automation for Horus.AI.

The deployment is intentionally parameterized. It does not assume a project,
region, domain, local host, or operating system. Run it from any OS with Node.js,
Docker-compatible Cloud Build access, and the Google Cloud CLI authenticated.

## Cloud Run

Required inputs:

```text
GCP_PROJECT_ID=<google-cloud-project-id>
GCP_REGION=<cloud-run-region>
GCP_SERVICE_NAME=<cloud-run-service-name>
GCP_ARTIFACT_REPOSITORY=<artifact-registry-repository-name>
```

Optional inputs:

```text
GCP_IMAGE_TAG=<image-tag>
GCP_RUN_ALLOW_UNAUTHENTICATED=true|false
HORUS_ENV=preview|production
```

Run:

```bash
pnpm infra:deploy:gcp
```

You can also pass arguments instead of environment variables:

```bash
pnpm infra:deploy:gcp -- \
  --project <google-cloud-project-id> \
  --region <cloud-run-region> \
  --service <cloud-run-service-name> \
  --repository <artifact-registry-repository-name>
```

Extra runtime variables can be passed with repeated `--env KEY=value` arguments.
Secrets can be mounted from Secret Manager with repeated
`--secret KEY=SECRET_NAME:VERSION` arguments.

Example:

```bash
pnpm infra:deploy:gcp -- \
  --project <google-cloud-project-id> \
  --region <cloud-run-region> \
  --service <cloud-run-service-name> \
  --repository <artifact-registry-repository-name> \
  --env LLM_PROVIDER=openai \
  --secret OPENAI_API_KEY=horus-openai-api-key:latest
```

The default runtime mode is `HORUS_ENV=preview`, which keeps the deployed demo
usable without browser-side bearer-token wiring. For hardened production, set
`HORUS_ENV=production` and provide the required auth configuration expected by
the API.
