# Positioning images

Drop an image at `public/positioning/<module-slug>/<team-id>/<boss-slug>.png` and it
appears in a POSITIONING section under that boss's assignments — nothing to register
in code. Extra images for the same boss go in `-2`, `-3`, … and stack in order;
`.png`, `.jpg`, `.jpeg` and `.webp` all work, and an optional `<boss-slug>.txt`
sidecar's first line becomes the caption.

Module and boss file names are the module/boss tab labels in kebab-case (lowercase,
apostrophes dropped, spaces → hyphens): `Kaz'rogal` → `kazrogal.png`. Team folders are
the team route ids, `team-dick` and `team-balls`.

## Every team folder holds a full set

The two teams fight some bosses differently, so each team gets its own complete copy
of every image — no sharing, no fallback to reason about:

```
black-temple/team-dick/supremus.png    ← Team Dick sees this
black-temple/team-balls/supremus.png   ← Team Balls sees this
```

Most of these pairs are currently identical files. That is on purpose: **whichever team's
image you replace, only that team's page changes.** The tradeoff is the other side of the
same coin — when a change really does apply to both teams, you have to drop it into both
folders or the two will silently drift apart.

Only three Black Temple fights actually differ today: Supremus, Teron Gorefiend and
Illidari Council.

## Fallback

An image at the module root (`black-temple/supremus.png`, no team folder) still shows for
both teams. Nothing uses that anymore — every current image lives in a team folder — but
it means a file dropped in the wrong place degrades to "both teams see it" instead of
vanishing. A team folder always wins over the root, and wins outright: if it has an image
for that boss, the whole stack and captions come from the team folder.

Kara is teamless and only ever reads the module root.

## Uploading from the admin view

Black Temple and Mount Hyjal admins have an **Upload Raid Positioning Image** button
under each boss. Uploads do not touch this folder — the bytes go to Vercel Blob and an
index of them lives in Firestore at `raid/{teamId}/{moduleKey}/positioning`, so a new
map appears on everyone's public page immediately, with no commit and no redeploy.

An upload wins outright over the file committed here, the same way a team folder wins
over the module root: once a boss has any uploaded image, the whole stack comes from the
uploads. Removing every upload for that boss restores the committed image, which is why
the files in this folder are still worth keeping as the known-good baseline.

Images are resized to 2400px on the long edge and converted to WebP in the browser
before upload, so a 4MB screenshot lands as a few hundred KB.
