# Shared CDN scripts

This repository is included as `scripts/shared` by the CDN repositories. Install
its dependencies from the host repository with:

```powershell
cd scripts/shared
npm install
```

The host repository must provide `GITHUB_TOKEN`, `GITHUB_OWNER`, and
`GITHUB_REPO` in its local `.env` file.
