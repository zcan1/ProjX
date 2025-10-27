"""Cinema 4D batch export helper.

Run this script with `c4dpy` (Cinema 4D's Python interpreter) to extract models from
`joy v23.lib4d`, bake the first animation track, and export a GLB that the web
prototype expects.

Example:
    c4dpy tools/convert_lib4d_to_gltf.py --lib /path/to/joy\ v23.lib4d --output assets/joy-character.glb
"""

import argparse
import os
import sys

try:
    import c4d
    from c4d import documents
except ImportError as exc:  # pragma: no cover - only runs inside Cinema 4D
    raise SystemExit('This script must be executed with c4dpy (Cinema 4D).') from exc


def extract_asset(doc: 'c4d.documents.BaseDocument', output_path: str) -> None:
    """Export the active document to GLB with baked animation."""
    settings = c4d.documents.SaveProjectOptions()
    settings['saveanimation'] = True
    settings['savetextures'] = True

    export_flags = c4d.SAVEDOCUMENTFLAGS_NONE
    result = documents.SaveDocument(doc, output_path, export_flags, c4d.FORMAT_GLTFEXPORT, settings)
    if not result:
        raise RuntimeError(f'Failed to export GLB to {output_path}')


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description='Convert LIB4D asset into GLB for the web prototype.')
    parser.add_argument('--lib', required=True, help='Path to joy v23.lib4d')
    parser.add_argument('--preset', default='Joy', help='Name of the preset/asset inside the library to export')
    parser.add_argument('--output', required=True, help='Destination .glb file path')
    args = parser.parse_args(argv)

    if not os.path.exists(args.lib):
        parser.error(f'LIB4D file not found: {args.lib}')

    lib = c4d.documents.LoadLibDocument(args.lib, args.preset, c4d.SCENEFILTER_OBJECTS)
    if lib is None:
        parser.error(f'Failed to locate preset "{args.preset}" in {args.lib}')

    lib.SetDocumentName(args.preset)

    # Ensure the document is active so that animation tracks are accessible
    doc = documents.IsolateObjects(lib, lib.GetObjects())
    if doc is None:
        parser.error('Could not isolate objects for export.')

    documents.InsertBaseDocument(doc)
    documents.SetActiveDocument(doc)

    try:
        extract_asset(doc, args.output)
    finally:
        documents.KillDocument(doc)

    print(f'Exported {args.output}')
    return 0


if __name__ == '__main__':  # pragma: no cover - entry point for c4dpy
    sys.exit(main(sys.argv[1:]))
