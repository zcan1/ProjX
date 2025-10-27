# Assets

Place the converted GLB/GLTF files generated from the `joy v23.lib4d` archive in this directory.
You can export them locally with `c4dpy` or download the artifacts produced by
the `Convert Joy LIB4D` GitHub Action if you have a self-hosted runner with
Cinema 4D support.

Expected files:

- `joy-character.glb` – skinned mesh for the protagonist/antagonist with baked animations.
- (Optional) `joy-character.bin` and textures if you export a `.gltf` package instead of a `.glb`.

These assets are ignored by Git via the root `.gitignore` and must be supplied locally before running the prototype.
