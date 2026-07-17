"""
Build the spatial hierarchy tree from IFC relationship entities.

Traverses IfcRelAggregates (spatial decomposition: Project→Site→Building→Storey)
and IfcRelContainedInSpatialStructure (elements contained in spaces/stories)
to produce a nested tree structure.
"""

from typing import Any

# IFC entity types that act as spatial containers.
# Elements inside these are reached via ContainsElements,
# children of these via IsDecomposedBy.
SPATIAL_CONTAINERS = {
    "IfcProject",
    "IfcSite",
    "IfcBuilding",
    "IfcBuildingStorey",
    "IfcSpace",
}


def _get_contained_elements(entity) -> list:
    """Get building elements contained in a spatial structure element.

    Uses IfcRelContainedInSpatialStructure (ContainsElements inverse).
    """
    elements = []
    for rel in getattr(entity, "ContainsElements", []):
        for elem in getattr(rel, "RelatedElements", []):
            elements.append(elem)
    return elements


def _get_spatial_children(entity) -> list:
    """Get child spatial structure elements.

    Uses IfcRelAggregates (IsDecomposedBy inverse).
    """
    children = []
    for rel in getattr(entity, "IsDecomposedBy", []):
        for child in getattr(rel, "RelatedObjects", []):
            children.append(child)
    return children


def build_spatial_tree(model) -> list[dict[str, Any]]:
    """Build the IFC spatial hierarchy tree.

    Traverses from IfcProject down through IfcSite → IfcBuilding →
    IfcBuildingStorey → IfcSpace, attaching building elements at each
    level via IfcRelContainedInSpatialStructure.

    Args:
        model: An open ifcopenshell.file instance.

    Returns:
        List of root nodes (typically one IfcProject). Each node is a dict:
        {
            "type": "IfcBuildingStorey",
            "expressID": 123,
            "GlobalId": "...",
            "Name": "Level 1",
            "children": [...]
        }
    """

    def _build_node(entity) -> dict[str, Any]:
        node = {
            "type": entity.is_a(),
            "expressID": entity.id(),
            "GlobalId": str(getattr(entity, "GlobalId", "")),
            "Name": str(getattr(entity, "Name", "") or ""),
            "children": [],
        }

        # Spatial children (project→site, site→building, etc.)
        for child in _get_spatial_children(entity):
            node["children"].append(_build_node(child))

        # Contained building elements (walls, slabs, etc.)
        for element in _get_contained_elements(entity):
            element_node = {
                "type": element.is_a(),
                "expressID": element.id(),
                "GlobalId": str(getattr(element, "GlobalId", "")),
                "Name": str(getattr(element, "Name", "") or ""),
                "children": [],
            }
            node["children"].append(element_node)

        return node

    projects = model.by_type("IfcProject")
    return [_build_node(p) for p in projects]


def flatten_tree(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten a hierarchy tree into a list, breadth-first.

    Useful for quick iteration over all nodes regardless of depth.

    Args:
        nodes: List of tree nodes (from build_spatial_tree).

    Returns:
        Flat list of all nodes.
    """
    result = []
    stack = list(nodes)
    while stack:
        node = stack.pop(0)
        result.append(node)
        stack.extend(node.get("children", []))
    return result


def count_by_type(nodes: list[dict[str, Any]]) -> dict[str, int]:
    """Count nodes by IFC type.

    Args:
        nodes: List of tree nodes (flat or nested).

    Returns:
        Dict mapping IFC type → count.
    """
    counts: dict[str, int] = {}
    for node in flatten_tree(nodes):
        t = node["type"]
        counts[t] = counts.get(t, 0) + 1
    return counts
