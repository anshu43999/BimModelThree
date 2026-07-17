"""
Material colour mapping for IFC element types.

Provides a dictionary of IFC type → RGBA colour and a fuzzy-matching
lookup function so that subtypes (e.g. IfcWallStandardCase) resolve
to their base type colour (e.g. IfcWall).

Colours are chosen to be visually distinct and follow common BIM
viewer conventions: greys for structure, blues for MEP, browns for
architectural elements, etc.
"""

from typing import Tuple

RGBA = Tuple[int, int, int, int]

# ── Architectural ──────────────────────────────────────────────
IFC_COLORS: dict[str, RGBA] = {
    # Walls
    "IfcWall": (192, 192, 192, 255),
    "IfcWallStandardCase": (192, 192, 192, 255),
    # Slabs / Floors
    "IfcSlab": (176, 176, 176, 255),
    "IfcSlabStandardCase": (176, 176, 176, 255),
    # Roofs
    "IfcRoof": (205, 133, 63, 255),
    # Beams
    "IfcBeam": (160, 160, 160, 255),
    "IfcBeamStandardCase": (160, 160, 160, 255),
    # Columns
    "IfcColumn": (208, 208, 208, 255),
    "IfcColumnStandardCase": (208, 208, 208, 255),
    # Members
    "IfcMember": (160, 82, 45, 255),
    "IfcMemberStandardCase": (160, 82, 45, 255),
    # Plates
    "IfcPlate": (192, 192, 192, 255),
    "IfcPlateStandardCase": (192, 192, 192, 255),

    # ── Openings & Fillings ───────────────────────────────────
    "IfcWindow": (135, 206, 235, 200),
    "IfcDoor": (139, 69, 19, 255),
    "IfcOpeningElement": (255, 255, 0, 80),
    "IfcCurtainWall": (173, 216, 230, 255),

    # ── Stairs & Ramps ────────────────────────────────────────
    "IfcStair": (218, 165, 32, 255),
    "IfcStairFlight": (218, 165, 32, 255),
    "IfcRamp": (218, 165, 32, 255),
    "IfcRampFlight": (218, 165, 32, 255),
    "IfcRailing": (112, 128, 144, 255),

    # ── Furniture & Fixtures ──────────────────────────────────
    "IfcFurniture": (222, 184, 135, 255),
    "IfcCovering": (245, 222, 179, 255),

    # ── MEP / Building Services ───────────────────────────────
    # HVAC
    "IfcFlowSegment": (100, 149, 237, 255),
    "IfcFlowFitting": (100, 149, 237, 255),
    "IfcFlowTerminal": (100, 149, 237, 255),
    "IfcFlowController": (100, 149, 237, 255),
    "IfcDuctSegment": (70, 130, 180, 255),
    "IfcDuctFitting": (70, 130, 180, 255),
    "IfcDuctSilencer": (70, 130, 180, 255),
    "IfcAirTerminal": (70, 130, 180, 255),
    "IfcFan": (70, 130, 180, 255),
    "IfcDamper": (70, 130, 180, 255),
    # Piping
    "IfcPipeSegment": (50, 205, 50, 255),
    "IfcPipeFitting": (50, 205, 50, 255),
    "IfcValve": (50, 205, 50, 255),
    # Electrical
    "IfcCableSegment": (255, 215, 0, 255),
    "IfcCableFitting": (255, 215, 0, 255),
    "IfcCableCarrierSegment": (255, 215, 0, 255),
    "IfcCableCarrierFitting": (255, 215, 0, 255),
    "IfcElectricFlowTerminal": (255, 215, 0, 255),
    "IfcLightFixture": (255, 255, 128, 255),

    # ── Spaces ────────────────────────────────────────────────
    "IfcSpace": (255, 255, 255, 30),

    # ── Site / Civil ──────────────────────────────────────────
    "IfcSite": (50, 150, 50, 255),
    "IfcBuilding": (200, 200, 200, 255),
    "IfcBuildingStorey": (230, 230, 250, 80),

    # ── Structural ────────────────────────────────────────────
    "IfcFooting": (128, 128, 128, 255),
    "IfcPile": (128, 128, 128, 255),
    "IfcReinforcingBar": (100, 100, 100, 255),
    "IfcReinforcingMesh": (100, 100, 100, 255),

    # ── Generic / Proxy ───────────────────────────────────────
    "IfcBuildingElementProxy": (169, 169, 169, 255),
    "IfcBuildingElementPart": (192, 192, 192, 255),
    "IfcDiscreteAccessory": (128, 128, 128, 255),
    "IfcFastener": (128, 128, 128, 255),
    "IfcMechanicalFastener": (128, 128, 128, 255),
    "IfcElementAssembly": (169, 169, 169, 255),
}

DEFAULT_COLOR: RGBA = (128, 128, 128, 255)
"""Fallback colour for unrecognized IFC types."""


def get_color(ifc_type: str, use_color: bool = True) -> RGBA:
    """Return the RGBA colour for an IFC type.

    Performs exact match first, then falls back to prefix matching so
    that subtypes (e.g. IfcWallStandardCase) inherit from their base
    type (IfcWall).

    Args:
        ifc_type: The IFC class name (e.g. "IfcWallStandardCase").
        use_color: If False, returns DEFAULT_COLOR regardless.

    Returns:
        (r, g, b, a) tuple, each channel 0–255.
    """
    if not use_color:
        return DEFAULT_COLOR

    if ifc_type in IFC_COLORS:
        return IFC_COLORS[ifc_type]

    # Fuzzy match: check if the type starts with any known key,
    # preferring the longest (most specific) match
    best_match = None
    best_len = 0
    for base_type in IFC_COLORS:
        if ifc_type.startswith(base_type) and len(base_type) > best_len:
            best_match = base_type
            best_len = len(base_type)

    if best_match:
        return IFC_COLORS[best_match]

    return DEFAULT_COLOR
