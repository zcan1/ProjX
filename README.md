# Labyrinth Echo – Web Horror Prototype

This repository contains a static Three.js experience set inside a claustrophobic
hallway maze. A creature, supplied as an FBX model, stalks the corridors while
you hunt for whispering shrines. Everything runs client-side, so the site can be
hosted anywhere that can serve static files (including GitHub Pages).

## Getting started

1. **Install optional dev tooling** (only required for the helper HTTP server):

   ```bash
   npm install
   ```

2. **Provide the monster archive.** Place `Archive.zip` inside the `assets/`
   directory. The archive should contain one FBX file for the monster and any
   textures it depends on (PNG/JPG/TGA/BMP/WEBP). The runtime unpacks the ZIP in
   the browser, resolves the textures, and feeds the FBX to Three.js' `FBXLoader`.
   A minimal layout looks like this:

   ```
   assets/Archive.zip
     ├── Monster.fbx
     ├── BaseColor.png
     └── Normal.tga
   ```

   > The filenames inside the archive should match whatever the FBX references.
   > Keep them in the same relative folders you used when exporting.

3. **Run the prototype.** Launch any static file server from the project root.
   With the provided dependency you can run:

   ```bash
   npm run dev
   ```

   Then open <http://localhost:4173> in a modern browser and click the canvas to
   enter pointer-lock mode.

## Controls

- `WASD` – Move forward/left/back/right
- Mouse – Look around once the pointer is locked
- `Shift` – Sprint (drains quickly in tight spaces)
- `Space` – Quieten a whispering shrine when you are close enough

## Implementation notes

- The monster is streamed from `assets/Archive.zip`. The game decompresses the
  archive on the fly using `fflate`, maps embedded textures to Blob URLs, and
  hands the FBX data straight to `FBXLoader`.
- Skeletal animation clips are auto-detected. The loader looks for idle, walk,
  and attack clips (with sensible fallbacks) and blends them as the AI moves
  between patrol and chase states.
- The labyrinth is generated from a small grid layout that extrudes walls,
  ceilings, collision volumes, and lighting fixtures to create a winding hallway
  maze with flickering red spotlights.
- Mist particles drift through the corridors to add depth. Point lights and the
  monster audio emitter all respond dynamically when you silence shrines.
- Everything is static HTML/CSS/JS, so deployment is as simple as copying the
  project to any static host.

## Troubleshooting

- If you see “Place assets/Archive.zip…” in the HUD, ensure the ZIP exists and
  that it contains exactly one FBX file plus the textures referenced by that FBX.
- Texture paths are resolved case-insensitively. If a texture still fails to
  load, inspect the FBX in a DCC tool to confirm the expected filenames.
- Three.js modules are loaded from a CDN. For offline or air-gapped deployments,
  download the modules locally and adjust the import URLs accordingly.
