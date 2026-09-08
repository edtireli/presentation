# PhD presentation

Password-protected browser presentation. This repository contains the unlocking application and encrypted presentation assets only. Slides, narration, models, data, figures, and notes are encrypted locally before publication using AES-256-GCM and PBKDF2-SHA-256 (600,000 iterations). The password is never transmitted.

Unlocking keeps a derived key in browser tab session storage, cleared by Lock. Encrypted asset downloads may be cached by the browser; decrypted responses are not stored in that cache. Changing the password cannot revoke previously downloaded copies.

The presentation uses the same ordinary, narrated, and presenter modes as the local deck. This is a published snapshot; updates require rebuilding and redeploying.
