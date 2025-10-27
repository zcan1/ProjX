# Assets

Drop `Archive.zip` here. The runtime expects the ZIP to include a single FBX file
for the monster plus any textures it references. All paths are resolved relative
to the root of the archive, so preserve the folder layout you used when exporting
from your DCC tool.

Example contents:

```
Archive.zip
├── Monster.fbx
├── textures/
│   ├── Monster_BaseColor.png
│   └── Monster_Normal.tga
└── emissive.jpg
```

> The loader searches case-insensitively for texture filenames. If a map still
> fails to appear, verify the expected names inside the FBX and rename the files
> in the archive accordingly.
