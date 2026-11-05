# Shared CDN scripts

This repository is included as `scripts/shared` by the CDN repositories. Install
its dependencies from the host repository with:

```powershell
cd scripts/shared
npm install
```

The host repository must provide `GITHUB_TOKEN`, `GITHUB_OWNER`, and
`GITHUB_REPO` in its local `.env` file.

The shared directory contains the complete CLI: `manager`, `generateDraft`,
`generateRss`, and `publishDraft`. Run the manager from the CDN repository root
so scripts operate on that repository's drafts, files, media, and `.env`.
