"""
Geometry extraction from IFC files using IfcOpenShell.

Wraps the IfcOpenShell geometry iterator to produce structured MeshData
objects with numpy arrays, ready for trimesh scene assembly.
"""

from dataclasses import dataclass
from typing import Iterator, Optional

import numpy as np

import ifcopenshell
import ifcopenshell.geom


@dataclass
class MeshData:
    """Geometry data for a single IFC element.

    Attributes:
        express_id: IFC entity instance ID (step file line number).
        ifc_type: IFC class name (e.g. "IfcWall", "IfcSlab").
        global_id: IFC GlobalId (GUID), empty string if absent.
        name: IFC Name attribute, empty string if absent.
        vertices: (N, 3) float32 array of vertex positions in world space.
        faces: (M, 3) int32 array of triangle indices.
        matrix: (4, 4) float64 transformation matrix (row-major).
        color: Optional (r, g, b, a) tuple from IFC material, 0-255 range.
    """

    express_id: int
    ifc_type: str
    global_id: str
    name: str
    vertices: np.ndarray  # (N, 3) float32
    faces: np.ndarray  # (M, 3) int32
    matrix: np.ndarray  # (4, 4) float64
    color: Optional[tuple] = None


def create_geometry_settings(
    weld_vertices: bool = True,
    world_coords: bool = True,
) -> ifcopenshell.geom.settings:
    """Create IfcOpenShell geometry extraction settings.

    Args:
        weld_vertices: Merge coincident vertices (reduces mesh size).
        world_coords: Apply local-to-world transform so vertices are
            already in world space. The per-element matrix is still
            returned for hierarchy placement reference.

    Returns:
        Configured ifcopenshell.geom.settings instance.
    """
    settings = ifcopenshell.geom.settings()
    try:
        settings.set(settings.USE_PYTHON_OPENCASCADE, True)
    except AttributeError:
        # Python OpenCASCADE not available (common on Windows pip install).
        # Fall back to default backend — geometry will still work.
        pass
    if weld_vertices:
        try:
            settings.set(settings.WELD_VERTICES, True)
        except AttributeError:
            pass
    if world_coords:
        try:
            settings.set(settings.USE_WORLD_COORDS, True)
        except AttributeError:
            pass
    return settings


def _safe_str(value) -> str:
    """Convert an IFC attribute value to string, handling None."""
    if value is None:
        return ""
    return str(value)


def iter_geometry(
    model: ifcopenshell.file,
    settings: Optional[ifcopenshell.geom.settings] = None,
) -> Iterator[MeshData]:
    """Iterate over all IFC elements that have geometry, yielding MeshData.

    Uses IfcOpenShell's geometry iterator which processes elements one at a
    time, keeping memory usage manageable even for large files.

    Args:
        model: An open ifcopenshell.file instance.
        settings: Geometry settings. Defaults to create_geometry_settings().

    Yields:
        MeshData for each element with geometric representation.
    """
    if settings is None:
        settings = create_geometry_settings()

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        return

    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)

        geo = shape.geometry
        verts = np.array(geo.verts, dtype=np.float32).reshape(-1, 3)
        faces = np.array(geo.faces, dtype=np.int32).reshape(-1, 3)

        # Transformation matrix (stored as 16 floats, row-major).
        # With Python OCC this is shape.transformation.matrix.data.
        # Without OCC the matrix may be returned directly as a tuple/list.
        raw_matrix = shape.transformation.matrix
        if hasattr(raw_matrix, "data"):
            raw_matrix = raw_matrix.data
        matrix = np.array(raw_matrix, dtype=np.float64).reshape(4, 4)

        # Attempt to extract IFC material colour if present
        color = _extract_ifc_color(entity)

        yield MeshData(
            express_id=shape.id,
            ifc_type=entity.is_a(),
            global_id=_safe_str(getattr(entity, "GlobalId", "")),
            name=_safe_str(getattr(entity, "Name", "")),
            vertices=verts,
            faces=faces,
            matrix=matrix,
            color=color,
        )

        if not iterator.next():
            break


def _extract_ifc_color(entity) -> Optional[tuple]:
    """Try to extract a diffuse colour from an IFC entity's material.

    Walks: entity → HasAssociations → IfcRelAssociatesMaterial →
           IfcMaterial → IfcMaterialDefinitionRepresentation →
           IfcStyledItem → surface style → diffuse colour.

    Returns (r, g, b, a) 0-255 or None.
    """
    try:
        for rel in getattr(entity, "HasAssociations", []):
            if not rel.is_a("IfcRelAssociatesMaterial"):
                continue
            material_select = rel.RelatingMaterial
            if material_select is None:
                continue

            # Could be IfcMaterial, IfcMaterialLayerSetUsage, etc.
            materials = _get_materials_from_select(material_select)
            for material in materials:
                color = _get_colour_from_material(material)
                if color is not None:
                    return color
    except Exception:
        pass
    return None


def _get_materials_from_select(material_select) -> list:
    """Extract a flat list of IfcMaterial from any material select type."""
    import ifcopenshell

    if material_select.is_a("IfcMaterial"):
        return [material_select]
    if material_select.is_a("IfcMaterialLayerSetUsage"):
        layer_set = material_select.ForLayerSet
        if layer_set:
            return getattr(layer_set, "MaterialLayers", []) or []
    if material_select.is_a("IfcMaterialLayerSet"):
        return getattr(material_select, "MaterialLayers", []) or []
    if material_select.is_a("IfcMaterialList"):
        return getattr(material_select, "Materials", []) or []
    return []


def _get_colour_from_material(material) -> Optional[tuple]:
    """Extract diffuse RGB from an IfcMaterial via its styled representation."""
    try:
        for rep in getattr(material, "HasRepresentation", []):
            for item in getattr(rep, "Items", []):
                if not item.is_a("IfcStyledItem"):
                    continue
                for style_assign in getattr(item, "Styles", []):
                    surface_style = None
                    for style_attr in getattr(style_assign, "Styles", []):
                        if style_attr.is_a("IfcSurfaceStyle"):
                            surface_style = style_attr
                            break
                    if surface_style is None:
                        continue
                    for style_elem in getattr(surface_style, "Styles", []):
                        if not style_elem.is_a(
                            "IfcSurfaceStyleRendering"
                        ):
                            continue
                        diffuse = getattr(
                            style_elem, "DiffuseColour", None
                        )
                        if diffuse is None:
                            continue
                        return _parse_ifc_colour(diffuse)
    except Exception:
        pass
    return None


def _parse_ifc_colour(diffuse) -> tuple:
    """Parse an IFC colour value into (r, g, b, a).

    Handles IfcColourRgb (with optional IfcNormalisedRatioMeasure)
    and IfcColourOrFactor (which may be a normalised ratio or a factor).
    """
    if diffuse is None:
        return None
    if diffuse.is_a("IfcColourRgb"):
        r = int(min(max(float(diffuse.Red), 0.0), 1.0) * 255)
        g = int(min(max(float(diffuse.Green), 0.0), 1.0) * 255)
        b = int(min(max(float(diffuse.Blue), 0.0), 1.0) * 255)
        return (r, g, b, 255)

    # IfcColourOrFactor — could be a direct colour or a factor
    if hasattr(diffuse, "Red"):
        r = int(min(max(float(diffuse.Red), 0.0), 1.0) * 255)
        g = int(min(max(float(diffuse.Green), 0.0), 1.0) * 255)
        b = int(min(max(float(diffuse.Blue), 0.0), 1.0) * 255)
        return (r, g, b, 255)

    # If it's a normalised ratio measure (single float factor)
    if hasattr(diffuse, "wrappedValue"):
        v = int(min(max(float(diffuse.wrappedValue), 0.0), 1.0) * 255)
        return (v, v, v, 255)

    # Fallback: try to convert directly
    try:
        v = int(min(max(float(diffuse), 0.0), 1.0) * 255)
        return (v, v, v, 255)
    except (ValueError, TypeError):
        pass

    return None
