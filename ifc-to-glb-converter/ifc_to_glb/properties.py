"""
Extract BIM properties from IFC entities.

Reads standard IFC attributes (GlobalId, Name, Description, etc.)
and returns them as a flat dict suitable for embedding in GLB
node.extras.
"""

from typing import Any

# Attribute names to extract from each IFC entity.
# These are the most commonly useful identifiers and descriptors.
PROPERTY_KEYS = [
    "GlobalId",
    "Name",
    "Description",
    "ObjectType",
    "PredefinedType",
    "Tag",
    "LongName",
]


def extract_properties(entity) -> dict[str, str]:
    """Extract key BIM properties from an IFC entity.

    Only non-empty values are included in the result so that node
    extras stay compact.

    Args:
        entity: An ifcopenshell entity instance.

    Returns:
        Dict mapping property name → string value. May be empty.
    """
    props: dict[str, str] = {}
    for key in PROPERTY_KEYS:
        value = getattr(entity, key, None)
        if value is not None:
            s = str(value).strip()
            if s:
                props[key] = s
    return props


def extract_property_sets(entity) -> dict[str, dict[str, Any]]:
    """Extract IFC property sets (IfcPropertySet) attached to an entity.

    Walks entity → IsDefinedBy → IfcRelDefinesByProperties →
    IfcPropertySet → IfcPropertySingleValue to build a nested dict.

    Args:
        entity: An ifcopenshell entity instance.

    Returns:
        Dict of {pset_name: {prop_name: value}}.
    """
    psets: dict[str, dict[str, Any]] = {}

    for rel in getattr(entity, "IsDefinedBy", []):
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = rel.RelatingPropertyDefinition
        if pset is None or not pset.is_a("IfcPropertySet"):
            continue

        pset_name = getattr(pset, "Name", "") or ""
        props: dict[str, Any] = {}

        for prop in getattr(pset, "HasProperties", []):
            if not prop.is_a("IfcPropertySingleValue"):
                continue
            prop_name = getattr(prop, "Name", "") or ""
            nominal = getattr(prop, "NominalValue", None)
            if nominal is not None:
                props[prop_name] = str(nominal)
            else:
                props[prop_name] = None

        if props:
            psets[pset_name] = props

    return psets
