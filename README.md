# PhD presentation

Password-protected browser presentation. This repository contains the unlocking application and encrypted presentation assets only. Slides, narration, models, data, figures, and notes are encrypted locally before publication using AES-256-GCM and PBKDF2-SHA-256 (600,000 iterations). The password is never transmitted.

Unlocking keeps a derived key in browser tab session storage, cleared by Lock. Encrypted asset downloads may be cached by the browser; decrypted responses are not stored in that cache. Changing the password cannot revoke previously downloaded copies.

The presentation includes independent browsing, recorded narration, and presenter view. The entrance also offers live following and an encrypted copy of the acknowledgements. Audience fullscreen uses native landscape mode when supported and a rotated interactive viewport on phones that cannot lock orientation.

To broadcast, unlock the site, open **Presenter view**, open its audience window, and enter the separate presenter key before choosing **Start live broadcast**. Viewers choose **Watch presentation live** and follow the presenter's slide and reveal changes. The presenter key is never included in this repository or in the encrypted audience assets. Stop the broadcast when finished; missing heartbeats also pause it automatically.

The acknowledgements complaint form sends messages to a separate authenticated service. The ceremonial bin animation plays only after the server confirms private storage. No complaint text is published in this repository.

This is a published snapshot; presentation-content updates require rebuilding and redeploying.
