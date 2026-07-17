"""Integration tests for the full conversion pipeline.

NOTE: These tests require ifcopenshell and a test IFC file.
Set the TEST_IFC_PATH environment variable to point to an IFC file,
or the tests will be skipped.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TEST_IFC = os.environ.get("TEST_IFC_PATH", "")

requires_ifc = pytest.mark.skipif(
    not TEST_IFC or not Path(TEST_IFC).exists(),
    reason="TEST_IFC_PATH not set or file not found",
)

try:
    import ifcopenshell
except ImportError:
    pytest.skip("ifcopenshell not installed", allow_module_level=True)

from ifc_to_glb.converter import convert_ifc_to_glb


class TestEndToEnd:
    @requires_ifc
    def test_basic_conversion(self):
        """Full conversion should produce a GLB file."""
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            output_path = f.name

        try:
            stats = convert_ifc_to_glb(
                input_path=TEST_IFC,
                output_path=output_path,
                use_color=False,
                include_hierarchy=True,
                include_properties=True,
            )
            assert stats["elements"] > 0
            assert Path(output_path).exists()
            assert Path(output_path).stat().st_size > 0
        finally:
            Path(output_path).unlink(missing_ok=True)

    @requires_ifc
    def test_flat_mode(self):
        """Flat mode (--no-hierarchy) should still produce valid GLB."""
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            output_path = f.name

        try:
            stats = convert_ifc_to_glb(
                input_path=TEST_IFC,
                output_path=output_path,
                use_color=False,
                include_hierarchy=False,
                include_properties=False,
            )
            assert stats["elements"] > 0
            assert Path(output_path).exists()
        finally:
            Path(output_path).unlink(missing_ok=True)

    @requires_ifc
    def test_color_mode(self):
        """Colour mode should produce valid GLB."""
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            output_path = f.name

        try:
            stats = convert_ifc_to_glb(
                input_path=TEST_IFC,
                output_path=output_path,
                use_color=True,
                include_hierarchy=False,
                include_properties=False,
            )
            assert Path(output_path).exists()
        finally:
            Path(output_path).unlink(missing_ok=True)
