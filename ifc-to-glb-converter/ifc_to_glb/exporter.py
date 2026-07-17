"""
GLB assembly and export.

Builds a trimesh.Scene from MeshData objects and IFC hierarchy, exports
to .glb, then optionally post-processes with pygltflib to inject BIM
properties into node.extras.

Key design decision: trimesh does not reliably preserve GLB node extras
across round-trip export, so we use pygltflib as a post-processing step
to read the .glb back in, inject extras, and write it out again.
"""

from pathlib import Path
from typing import Optional

import numpy as np
import trimesh

from .geometry import MeshData
from .hierarchy import build_spatial_tree
from .materials import get_color, DEFAULT_COLOR
from .properties import extract_properties


def assemble_glb(
    model,
    meshes: list[MeshData],
    output_path: str,
    use_color: bool = True,
    include_hierarchy: bool = True,
    include_properties: bool = True,
) -> trimesh.Scene:
    """Assemble a trimesh scene from IFC geometry and export to GLB.

    Args:
        model: An open ifcopenshell.file instance.
        meshes: List of MeshData from geometry.iter_geometry().
        output_path: Target .glb file path.
        use_color: Apply per-type material colours.
        include_hierarchy: Build spatial node hierarchy in the GLB.
        include_properties: Inject BIM properties into node extras.

    Returns:
        The assembled trimesh.Scene (before post-processing).
    """
    # ── Build mesh lookup ──────────────────────────────────────
    mesh_map: dict[int, trimesh.Trimesh] = {}
    type_map: dict[int, str] = {}

    for md in meshes:
        if len(md.vertices) == 0 or len(md.faces) == 0:
            continue

        tri_mesh = trimesh.Trimesh(
            vertices=md.vertices.copy(),
            faces=md.faces.copy(),
        )

        # Apply colour
        if use_color:
            rgba = md.color if md.color else get_color(md.ifc_type)
            _apply_vertex_colors(tri_mesh, rgba)

        mesh_map[md.express_id] = tri_mesh
        type_map[md.express_id] = md.ifc_type

    # ── Build scene ────────────────────────────────────────────
    scene = trimesh.Scene()

    if include_hierarchy:
        tree = build_spatial_tree(model)
        _add_hierarchy_nodes(
            scene, tree, mesh_map, type_map, parent_name=None
        )
    else:
        # Flat mode: one node per mesh
        for express_id, tri_mesh in mesh_map.items():
            node_name = _make_node_name(
                type_map.get(express_id, "Unknown"), express_id
            )
            scene.add_geometry(tri_mesh, node_name=node_name)

    # ── Export ─────────────────────────────────────────────────
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    scene.export(output_path, file_type="glb")

    # ── Post-process: inject extras ────────────────────────────
    if include_properties and mesh_map:
        _inject_extras(output_path, model, mesh_map)

    return scene


def _apply_vertex_colors(
    mesh: trimesh.Trimesh, rgba: tuple, normalized: bool = False
) -> None:
    """Apply a flat colour to all vertices of a trimesh.

    Args:
        mesh: The trimesh to colour.
        rgba: (r, g, b[, a]) tuple, 0–255 unless normalized=True.
        normalized: If True, values are already 0.0–1.0.
    """
    if normalized:
        color = np.array(rgba[:3], dtype=np.float64)
    else:
        color = np.array(rgba[:3], dtype=np.uint8)

    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        vertex_colors=np.tile(color, (len(mesh.vertices), 1)),
    )


def _make_node_name(ifc_type: str, express_id: int) -> str:
    """Create a GLB node name that encodes IFC type and express ID.

    The format is: {ifc_type}_{expressID}
    This is later parsed by _inject_extras to match nodes to IFC entities.
    """
    return f"{ifc_type}_{express_id}"


def _add_hierarchy_nodes(
    scene: trimesh.Scene,
    tree_nodes: list[dict],
    mesh_map: dict[int, trimesh.Trimesh],
    type_map: dict[int, str],
    parent_name: Optional[str] = None,
) -> None:
    """Recursively add hierarchy nodes to the scene.

    Spatial container nodes that have no mesh of their own are created
    as empty transforms in the scene graph (via add_geometry with a
    dummy empty mesh so trimesh registers the node).
    """
    for node in tree_nodes:
        express_id = node["expressID"]
        node_name = node.get("Name") or node["type"]
        # Always encode express ID so _inject_extras can map nodes back to IFC
        node_name = f"{node_name}_{express_id}"

        if express_id in mesh_map:
            scene.add_geometry(
                mesh_map[express_id],
                node_name=node_name,
                parent_node_name=parent_name,
            )
        else:
            # Spatial container without own geometry: create a small
            # placeholder so trimesh registers the transform node.
            # This preserves the hierarchy even for containers.
            placeholder = _create_placeholder_mesh()
            scene.add_geometry(
                placeholder,
                node_name=node_name,
                parent_node_name=parent_name,
            )

        # Recurse into children
        children = node.get("children", [])
        if children:
            _add_hierarchy_nodes(
                scene,
                children,
                mesh_map,
                type_map,
                parent_name=node_name,
            )


def _create_placeholder_mesh() -> trimesh.Trimesh:
    """Create a tiny invisible mesh to act as a group node placeholder.

    trimesh does not natively support empty transform nodes in GLB
    export, so we create a single degenerate triangle at origin.
    """
    verts = np.array([[0.0, 0.0, 0.0]], dtype=np.float64)
    faces = np.array([[0, 0, 0]], dtype=np.int64)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces)
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        vertex_colors=np.array([[0, 0, 0]], dtype=np.uint8),
    )
    return mesh


def _inject_extras(
    glb_path: str,
    model,
    mesh_map: dict[int, trimesh.Trimesh],
) -> None:
    """Post-process a GLB to inject BIM properties into node.extras.

    Uses pygltflib to read the exported GLB, match nodes by name to
    their IFC entities, and write extras containing GlobalId, Name,
    Description, etc.

    Args:
        glb_path: Path to the exported .glb file.
        model: The ifcopenshell.file (for looking up entities).
        mesh_map: Dict of express_id → trimesh (used to know which
            express_ids were actually included in the GLB).
    """
    try:
        import pygltflib
        from pygltflib import GLTF2
    except ImportError:
        return

    # Build properties map for all entities that have meshes
    props_map: dict[int, dict[str, str]] = {}
    for express_id in mesh_map:
        entity = model.by_id(express_id)
        props_map[express_id] = extract_properties(entity)

    if not props_map:
        return

    gltf = GLTF2().load(glb_path)

    for node in gltf.nodes:
        if not node.name:
            continue
        # Node name format: "IfcWall_12345" — extract trailing number
        parts = node.name.rsplit("_", 1)
        if len(parts) == 2 and parts[-1].isdigit():
            express_id = int(parts[-1])
            if express_id in props_map:
                node.extras = props_map[express_id]

    gltf.save(glb_path)
