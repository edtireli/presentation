# PhD presentation

Public browser presentation at https://edtireli.github.io/presentation/. No audience password is required. The entrance offers live following, thesis download, acknowledgements, recorded narration, and presenter view.

The existing thesis QR points to https://edtireli.github.io/thesis/, which redirects to this shared entrance. The thesis PDF is available directly at https://edtireli.github.io/thesis/Edis_Tireli_PhD_Thesis.pdf.

Presentation assets retain their compressed AES-GCM bundle format to reuse existing browser caches and keep large media portable. **The asset key is deliberately public in access.json; the presentation is not private or password protected.** A service worker decodes the public package. It does not expose the private presenter key.

To present, choose **Give presentation** and enter the presenter password. This checks for the latest published version and automatically saves and verifies every required file before opening notes and controls. The password is verified by the service; the public site contains no presenter credential.

To broadcast, open **Give presentation**, choose **Open audience presentation**, then choose **Start live broadcast**. The signed presenter session authorizes publishing automatically. Viewers choose **Follow presentation live** and follow slide and reveal changes. Stop the broadcast when finished; missing heartbeats also pause it automatically.

Audience fullscreen uses native landscape mode when supported and a rotated interactive viewport on phones that cannot lock orientation.

The acknowledgements complaint form sends messages to a separate service. The ceremonial bin animation plays only after the server confirms private storage. The public audience can submit a complaint and read live state, but cannot read saved complaints or control the broadcast. No complaint text or presenter key is published in this repository or the audience assets.

This is a published snapshot; presentation-content updates require rebuilding and redeploying. Each presenter startup checks for those updates. A completed update replaces the saved copy atomically; an interrupted download can be resumed. An existing talk remains pinned to its loaded revision. If an update cannot be checked or completed, a saved version is identified explicitly.

Offline access works in the browser that completed the download, including after restarting it. First sign in while online to save a local password verifier, then allow the automatic file download to finish. Browser storage is device-specific: prepare each backup laptop once while connected. Clearing site data or using a private browser session removes that saved copy.

The audience narration option opens at 17:00 Europe/Copenhagen on 10 September 2026 (15:00 UTC). Direct narrated entry is gated too. Local slide presentation and live following are available before then. The restored narration uses complete original recordings at natural speed, with cues remapped to the recording timeline.

Live followers check the shared state on a 500 ms cadence, allowing only one request at a time. The presenter sends one small state update per change plus a heartbeat; audience devices load presentation assets directly from GitHub.
