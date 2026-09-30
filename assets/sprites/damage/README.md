# Five-stage damage sprites

Each of the 21 objects has a transparent RGBA PNG sheet (2172 × 724) in this directory. Frames are five virtual equally sized columns: full HP, >50%, >25%, >0%, and destroyed, with the full HP stage applying only above 75% HP. See `damageStage()` in `index.html` for exact boundaries. Canvas accepts fractional source coordinates (2172/5).

The game loads each object sheet on demand. If a PNG is unavailable, the existing object SVG and procedural burn/destroyed renderer remain in place. Barry, residents, gameplay physics and scoring are unchanged.
