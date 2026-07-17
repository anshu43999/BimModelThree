"""
Main conversion orchestrator.

Ties together IFC parsing → geometry extraction → GLB assembly into
a single high-level function with progress reporting and statistics.
"""

import time
from pathlib import Path

import ifcopenshell

from .geometry import (
    create_geometry_settings,
    iter_geometry,
    MeshData,
)
from .exporter import assemble_glb


def convert_ifc_to_glb(
    input_path: str,
    output_path: str,
    use_color: bool = True,
    include_hierarchy: bool = True,
    include_properties: bool = True,
) -> dict:
    """Convert an IFC file to GLB.

    Args:
        input_path: Path to the input .ifc file.
        output_path: Path for the output .glb file.
        use_color: Apply per-type material colours to geometry.
        include_hierarchy: Build spatial node hierarchy in GLB.
        include_properties: Embed BIM properties in node extras.

    Returns:
        Dict with conversion statistics (timing, counts, sizes).
    """
    t_total_start = time.perf_counter()

    # ── Open IFC ───────────────────────────────────────────────
    print(f"Opening IFC: {input_path}")
    t0 = time.perf_counter()
    model = ifcopenshell.open(input_path)
    t1 = time.perf_counter()
    schema = model.schema
    print(f"  Schema: {schema}")
    print(f"  Open time: {t1 - t0:.1f}s")

    # ── Extract geometry ───────────────────────────────────────
    print("Extracting geometry...")
    t0 = time.perf_counter()
    meshes: list[MeshData] = []
    settings = create_geometry_settings()

    element_count = 0
    for md in iter_geometry(model, settings):
        meshes.append(md)
        element_count += 1
        if element_count % 500 == 0:
            print(f"  ... {element_count} elements processed")

    t1 = time.perf_counter()
    total_verts = sum(len(m.vertices) for m in meshes)
    total_faces = sum(len(m.faces) for m in meshes)
    extraction_time = t1 - t0
    print(f"  {len(meshes)} elements with geometry")
    print(f"  {total_verts:,} vertices, {total_faces:,} triangles")
    print(f"  Extraction time: {extraction_time:.1f}s")

    if not meshes:
        print("  WARNING: No geometry found in IFC file.")
        return {
            "elements": 0,
            "vertices": 0,
            "faces": 0,
            "extraction_time": extraction_time,
            "assembly_time": 0,
            "total_time": time.perf_counter() - t_total_start,
            "output_size_bytes": 0,
        }

    # ── Assemble GLB ───────────────────────────────────────────
    print("Assembling GLB...")
    t0 = time.perf_counter()
    assemble_glb(
        model=model,
        meshes=meshes,
        output_path=output_path,
        use_color=use_color,
        include_hierarchy=include_hierarchy,
        include_properties=include_properties,
    )
    t1 = time.perf_counter()

    # ── Statistics ─────────────────────────────────────────────
    output_size = Path(output_path).stat().st_size
    input_size = Path(input_path).stat().st_size
    t_total_end = time.perf_counter()

    print()
    print(f"Done: {output_path}")
    print(f"  IFC size:     {input_size / 1024 / 1024:.1f} MB")
    print(f"  GLB size:     {output_size / 1024 / 1024:.1f} MB")
    if output_size > 0:
        print(f"  Ratio:        {input_size / output_size:.1f}:1")
    print(f"  Assembly:     {t1 - t0:.1f}s")
    print(f"  Total time:   {t_total_end - t_total_start:.1f}s")

    return {
        "elements": len(meshes),
        "vertices": total_verts,
        "faces": total_faces,
        "extraction_time": extraction_time,
        "assembly_time": t1 - t0,
        "total_time": t_total_end - t_total_start,
        "input_size_bytes": input_size,
        "output_size_bytes": output_size,
    }
