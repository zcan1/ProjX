# Labyrinth Echo – Web Horror Prototype

This repository contains a static Three.js experience set inside a claustrophobic
hallway maze. A creature, supplied as an FBX model, stalks the corridors while
you hunt for whispering shrines. Everything runs client-side, so the site can be
hosted anywhere that can serve static files (including GitHub Pages).

## Getting started

1. **Install optional dev tooling** (only required for the helper HTTP server):
# Joy – Web Horror Prototype

This project serves as a lightweight WebGL prototype for exploring the "Joy"
character contained in the provided `joy v23.lib4d` asset library. The site is
entirely static and powered by Three.js, featuring a foggy forest arena,
interactable shrines, positional ambience, and support for skeletal animation.

## Getting started

1. **Install dependencies** (optional – only required if you want the helper dev server):

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
2. **Convert the Cinema 4D library** to a format the browser understands. You
   must have Cinema 4D with `c4dpy` available locally. The helper script will
   extract the asset named `Joy` (adjust `--preset` if your asset uses a different
   name) and export it to GLB:

   ```bash
   c4dpy tools/convert_lib4d_to_gltf.py \
     --lib "./joy v23.lib4d" \
     --preset Joy \
     --output ./assets/joy-character.glb
   ```

   The exported GLB (and any external textures) should be placed in the
   `assets/` directory. These files are ignored by Git but loaded at runtime by
   the scene.

   > **Prefer automation?** If you operate a self-hosted runner that already has
   > Cinema 4D and `c4dpy` installed, you can trigger the `Convert Joy LIB4D`
   > workflow (`.github/workflows/convert-lib4d.yml`) from the Actions tab. It
   > will export the GLB and, optionally, create a `.gltf`/`.bin` pair via
   > `gltf-pipeline`, uploading the results as artifacts for download.

3. **Run the prototype**. After the GLB exists, start a local server (any static
   file server works). If you installed the dev dependency you can use:

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
- Mouse – Look around (after clicking to lock the pointer)
- `Shift` – Sprint
- `Space` – Interact with shrines scattered throughout the fog

## Implementation notes

- Uses CDN-hosted Three.js modules, DRACO decoding, and PointerLock controls.
- The ground plane is procedurally displaced using Simplex noise to create an
  uneven surface.
- Mist particles drift through the scene and are updated every frame for depth.
- Lighting flickers via sinusoidal oscillation to reinforce the horror tone.
- If the GLB contains animation clips, the first (or "Idle") clip will
  automatically play using an `AnimationMixer`.

## Troubleshooting

- If the page reports a missing asset, verify that `assets/joy-character.glb`
  exists relative to the site root and that it contains meshes/animations.
- Three.js modules are loaded from a CDN. Ensure you have network access the
  first time the page is opened, or download the modules and update the import
  paths to use local copies for offline deployments.
