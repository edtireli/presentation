# PhD presentation staging

Local plaintext staging copy for review. No publication or deployment has been performed. Privacy and publication approval remain separate.

Open `start.html` through a local HTTP server to choose the current presentation, the preserved recorded edition or presenter view. `index.html` defaults to the current PhD defense; the narrated entry explicitly loads `decks/phd-defense.recorded.spiral`, whose slide sequence matches the recording. Omitted slides and backups remain in each authored edition. For example, run `python3 -m http.server 8790` in this directory.

The live literature-classification feed is a static snapshot in this export. Narration contains only the audio referenced by the included editions. Local narration generation/editing tooling, raw source data, development outputs and historical audio are excluded. Detailed hashes, dependencies and exclusions are in `presentation-export-manifest.json`.
