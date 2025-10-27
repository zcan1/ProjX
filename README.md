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
