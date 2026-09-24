# Spiral

A browser presentation engine, with Edis Tireli's PhD defence as a separate project.

[Watch the defence](https://edtireli.github.io/presentation/) · [Model and asset sources](projects/defense/ASSET-SOURCES.md)

## Make your own presentation

Install Node.js 20 or newer. No npm dependencies, API key, account or backend are needed.

```sh
npm start
```

Open **http://127.0.0.1:8793/**. Edit `examples/starter/app/decks/starter.spiral`, then restart the command to rebuild.

For your own project:

```sh
cp -R examples/starter projects/my-talk
# Change "name" to "my-talk" in projects/my-talk/project.json.
npm start -- my-talk
```

Put slides, notes, images and data in that project's `app/` directory. Its `project.json` selects the deck and optional extensions.

## Source layout

```text
engine/                 renderer, background, layouts, editor and speaker view
examples/starter/       small presentation with no defence assets or services
projects/defense/
  project.json          deck selection, extensions and speaker emphasis
  app/                  decks, notes, recordings, figures and model data
  extensions/           defence-specific anatomy, kinetics and p-Brain scenes
  site/                 entrance and hosted/offline presenter integration
tools/                  build, local server, validation and Pages packaging
dist/                   generated websites (not tracked)
```

Source lives on `main`. The generated defence website lives on `gh-pages`, at the same URL. Duplicate encrypted bundles, temporary dedication audio and standalone acknowledgement effects are not source files.

## Present and edit

- Arrow keys or Page Up/Page Down: move one click.
- **C**: contents. **S**: appearance. **F**: fullscreen.
- **E**: edit text and layout. Export the edited deck to keep changes.
- **P**: speaker view, including half-slide/half-notes layout.
- Notes save in this browser. Export notes JSON to move edits between devices.

Serve over HTTP/HTTPS rather than opening HTML with `file://`.

## Build and publish

```sh
npm run build -- starter
npm start -- defense
npm run build -- defense --pages
npm run check
npm test
```

An ordinary project builds to `dist/<name>/`. Deploy that directory to any static host. The starter uses local files, without a CDN.

The defence additionally builds to `dist/pages/`, retaining `watch/` audience URLs and prepared `app/` presenter routes. See [deployment](docs/DEPLOYMENT.md).

The defence password and live broadcast use its existing external service. They are **not engine requirements** and are absent from the starter. The public asset key packages public files for offline use; it is not a privacy mechanism. Use **Give presentation** online once per browser and wait for verification before relying on offline mode.

The live and recorded editions intentionally have separate decks. Do not reorder the recorded deck without remapping its audio.

## Reuse

See [engine documentation](engine/README.md) and [third-party notices](THIRD-PARTY-NOTICES.md). Figures, anatomical data, participant-derived outputs, thesis text and recordings have separate provenance and permissions. They are not covered by a blanket software licence.

No original-code licence is added by this restructuring pending the author's choice.
