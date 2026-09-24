# Exploring the Unseen

Edis Devin Tireli's PhD defence, 10 September 2026.

- Live slides: `app/decks/phd-defense.spiral`
- Recorded edition: `app/decks/phd-defense.recorded.spiral`
- Speaker cues: `app/decks/phd-defense.speaker-cues.json`
- References: `app/decks/references.bib`
- Scientific scenes: `extensions/`
- Hosted entrance, password and offline integration: `site/`

Run `npm start -- defense` from the root for local rehearsal without the hosted password service. Build the hosted edition with `npm run build -- defense --pages`.

The scientific content and referenced media were retained. Temporary dedication/music and standalone acknowledgement-site effects were removed. Actual acknowledgement slides and normal narration remain.

[Model and asset sources](ASSET-SOURCES.md).

## Attribution overlay

Every defence slide displays a central copyright notice and repository link. **Remove watermark** opens a password prompt. A successful check hides the overlay for the current tab's session, including reloads, and for same-origin frames within that tab. It works offline once the updated presentation has been prepared.

This is a client-side attribution feature, not DRM, content encryption or recording detection. The password is checked locally against a digest and is not sent to a server or stored in browser storage. It is separate from the existing hosted presenter-access service. The generic engine and starter do not include this overlay.
