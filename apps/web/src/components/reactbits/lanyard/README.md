# React Bits Lanyard

Complete JavaScript/CSS component supplied by the project owner on 20 October 2026.
The original procedural card, ring, clamp, ribbon, materials and rigid-body solver
are retained. The only dependency, Three.js, was already installed and remains
controlled by the existing npm lockfile.

BorrowBuddy integration adds keyboard flip control, readiness/error callbacks,
live reduced-motion changes, explicit hidden/offscreen pausing, context-loss
fallback and capture diagnostics. `member-id-card.tsx` creates personalized front,
back and strap artwork using the site's original fonts, colors and profile data.
It supplies an accessible static card while loading and when WebGL is unavailable.

`member-card-profile.ts` explicitly projects the public card fields before they
cross the server/client boundary. Private email, phone, verification notes and
uploaded student-ID paths are not part of that projection. The printed membership
code and decorative stripes are not a handover code or an access credential.

The Android exporter reuses the original card/clamp/ring geometry. Native Kotlin
implements the same four-node physics and 72-sample ribbon; Filament renders it
with personalized artwork and the source's eight-panel studio environment.
