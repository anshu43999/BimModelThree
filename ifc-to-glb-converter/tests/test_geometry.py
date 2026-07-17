"""Tests for geometry extraction module."""

import sys
from pathlib import Path

import pytest

# Ensure the package is importable even without pip install -e
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import ifcopenshell
except ImportError:
    pytest.skip("ifcopenshell not installed", allow_module_level=True)

from ifc_to_glb.geometry import (
    create_geometry_settings,
    iter_geometry,
    MeshData,
    _extract_ifc_color,
    _parse_ifc_colour,
)


class TestGeometrySettings:
    """Tests for geometry settings creation."""

    def test_default_settings(self):
        settings = create_geometry_settings()
        assert settings is not None

    def test_no_weld(self):
        settings = create_geometry_settings(weld_vertices=False)
        assert settings is not None

    def test_no_world_coords(self):
        settings = create_geometry_settings(world_coords=False)
        assert settings is not None


class TestMeshData:
    """Tests for MeshData dataclass."""

    def test_create_minimal(self):
        import numpy as np
        md = MeshData(
            express_id=1,
            ifc_type="IfcWall",
            global_id="abc123",
            name="Wall-01",
            vertices=np.zeros((4, 3), dtype=np.float32),
            faces=np.array([[0, 1, 2]], dtype=np.int32),
            matrix=np.eye(4, dtype=np.float64),
        )
        assert md.express_id == 1
        assert md.ifc_type == "IfcWall"
        assert md.vertices.shape == (4, 3)

    def test_default_color(self):
        import numpy as np
        md = MeshData(
            express_id=1,
            ifc_type="IfcWall",
            global_id="",
            name="",
            vertices=np.zeros((1, 3), dtype=np.float32),
            faces=np.zeros((0, 3), dtype=np.int32),
            matrix=np.eye(4, dtype=np.float64),
        )
        assert md.color is None


class TestParseIfcColour:
    """Tests for IFC colour parsing."""

    def test_parse_rgb(self):
        """_parse_ifc_colour should handle IfcColourRgb."""
        # This test requires an actual IfcColourRgb instance,
        # which can only be created via ifcopenshell.  In a unit
        # test context we'd mock it; for now it's a placeholder.
        pass

    def test_parse_none_returns_none(self):
        assert _parse_ifc_colour(None) is None
