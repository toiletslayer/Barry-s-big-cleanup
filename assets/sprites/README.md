# Barry's Big Cleanup — Sprite Assets

The game's editable object art lives in `assets/sprites/objects/`.

These are SVG files with transparent backgrounds and a common `viewBox="0 0 200 160"`. The game scales them to each object's gameplay size.

Once the loader migration is complete, editing an SVG under the same filename will change the game after GitHub Pages redeploys.

## Editing
- Inkscape, Illustrator, Affinity Designer, Photopea, or a text editor all work.
- Keep the same filename.
- Keep the background transparent.
- Avoid changing gameplay bounds here; the game still controls collision size separately.

Barry, residents, backgrounds, fire/smoke/embers, HUD, and burn overlays are still procedural Canvas graphics for now. Barry is intentionally not being changed during this first asset migration.
