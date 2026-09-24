# Deployment

## Ordinary presentations

Build with `npm run build -- <project-name>`, then publish `dist/<project-name>/` to a static host. The starter needs no service, password or network download during building.

## Defence website

Source: **main**. Generated site: **gh-pages**, https://edtireli.github.io/presentation/.

```sh
npm run build -- defense --pages
npm run check
npm test
```

Publish only `dist/pages/`. Keep Pages configured to the root of `gh-pages`. The build preserves `watch/` URLs and service-worker-served `app/` URLs.

Unchanged offline blobs are reused from the previous `dist/pages/` build. For a fresh checkout, add `--reuse /absolute/path/to/a/previous/site`. Only the previous public package and validated blob paths are read. Its key is public and **not access control**.

The previous generation stays available for open tabs. New presenter sessions verify the current package. Prepare each laptop online before relying on offline playback; a first visit does not download every large file.

Presenter access/live following use the existing service in `projects/defense/app/live-config.json`. No private presenter credential belongs in source control. The password protects presenter/broadcast controls, not the public scientific content.

`npm start -- defense` provides local rehearsal without the hosted service. The hosted entrance adds authentication and verified offline preparation.

No GitHub Actions build is needed: build locally and push the finished site.
