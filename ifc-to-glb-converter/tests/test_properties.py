"""Tests for BIM property extraction."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ifc_to_glb.properties import extract_properties


class DummyEntity:
    """A minimal mock that mimics an ifcopenshell entity."""

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestExtractProperties:
    def test_basic_extraction(self):
        entity = DummyEntity(
            GlobalId="abc123",
            Name="Test Wall",
            Description="A test wall",
            ObjectType="Standard",
            PredefinedType="SOLIDWALL",
            Tag="W-001",
            LongName="Exterior Wall A",
        )
        props = extract_properties(entity)
        assert props["GlobalId"] == "abc123"
        assert props["Name"] == "Test Wall"
        assert props["Tag"] == "W-001"

    def test_empty_entity(self):
        entity = DummyEntity()
        props = extract_properties(entity)
        assert props == {}

    def test_none_values_skipped(self):
        entity = DummyEntity(GlobalId="abc", Name=None)
        props = extract_properties(entity)
        assert "GlobalId" in props
        assert "Name" not in props

    def test_empty_string_skipped(self):
        entity = DummyEntity(GlobalId="abc", Name="")
        props = extract_properties(entity)
        assert "GlobalId" in props
        assert "Name" not in props

    def test_partial_properties(self):
        entity = DummyEntity(GlobalId="abc", Name="Wall")
        props = extract_properties(entity)
        assert len(props) == 2
        assert props["GlobalId"] == "abc"
        assert props["Name"] == "Wall"
