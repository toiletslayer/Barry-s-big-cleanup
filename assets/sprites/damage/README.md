# Canonical damage sprite sheets

This directory contains the 21 original 2172×724 RGBA PNG sprite sheets. Each sheet
contains five left-to-right stages: full, 3/4, 1/2, 1/4, destroyed. `manifest.json`
maps game type names (including `gasPump`) to filenames and image-space crop rectangles.

The renderer loads the manifest first and then loads PNG sheets as object types appear.
Its stage selection is based on current HP / max HP. Image-space frames are cropped
to avoid transparent padding and drawn with one per-object scale and a shared ground
baseline; flames and smoke already painted into the sprites are not overlaid with
the original procedural burn system.

If the manifest or a sheet is missing or fails to decode, the existing SVG/procedural
renderers and old burn/destroyed fallbacks remain available. Barry, residents, collision,
scoring, and gameplay data are unchanged.

To verify after modifying assets: run `node tests/damage-sprites.test.js` from the
repository root.