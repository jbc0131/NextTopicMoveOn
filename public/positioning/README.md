# Positioning images

Drop an image at `public/positioning/<module-slug>/<boss-slug>.png` and it appears
in a POSITIONING section under that boss's assignments — nothing to register in code.
Extra images for the same boss go in `-2`, `-3`, … and stack in order; `.png`, `.jpg`,
`.jpeg` and `.webp` all work, and an optional `<boss-slug>.txt` sidecar's first line
becomes the caption. Folder and file names are the module/boss tab labels in
kebab-case (lowercase, apostrophes dropped, spaces → hyphens): `Kaz'rogal` → `kazrogal.png`.
