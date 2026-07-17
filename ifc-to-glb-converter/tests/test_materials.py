"""Tests for material colour mapping."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ifc_to_glb.materials import get_color, DEFAULT_COLOR, IFC_COLORS


class TestGetColor:
    def test_exact_match(self):
        color = get_color("IfcWall")
        assert color == IFC_COLORS["IfcWall"]

    def test_fuzzy_match(self):
        """IfcWallStandardCase should match IfcWall colour."""
        color = get_color("IfcWallStandardCase")
        assert color == IFC_COLORS["IfcWall"]

    def test_unknown_type_returns_default(self):
        color = get_color("IfcNonExistentType")
        assert color == DEFAULT_COLOR

    def test_no_color_mode(self):
        color = get_color("IfcWall", use_color=False)
        assert color == DEFAULT_COLOR

    def test_fuzzy_match_longest_preferred(self):
        """IfcPipeFitting should match IfcPipeFitting, not IfcPipeSegment."""
        color = get_color("IfcPipeFitting")
        assert color == IFC_COLORS["IfcPipeFitting"]

    def test_empty_string(self):
        color = get_color("")
        assert color == DEFAULT_COLOR

    def test_all_registered_types_return_valid_rgba(self):
        for ifc_type, color in IFC_COLORS.items():
            assert len(color) == 4
            assert all(0 <= c <= 255 for c in color)
