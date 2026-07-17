"""Tests for hierarchy tree building."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ifc_to_glb.hierarchy import (
    SPATIAL_CONTAINERS,
    flatten_tree,
    count_by_type,
)


class TestSpatialContainers:
    def test_expected_types_present(self):
        assert "IfcProject" in SPATIAL_CONTAINERS
        assert "IfcSite" in SPATIAL_CONTAINERS
        assert "IfcBuilding" in SPATIAL_CONTAINERS
        assert "IfcBuildingStorey" in SPATIAL_CONTAINERS


class TestFlattenTree:
    def test_flatten_empty(self):
        assert flatten_tree([]) == []

    def test_flatten_single_node(self):
        node = {
            "type": "IfcProject",
            "expressID": 1,
            "GlobalId": "abc",
            "Name": "Project",
            "children": [],
        }
        result = flatten_tree([node])
        assert len(result) == 1
        assert result[0]["type"] == "IfcProject"

    def test_flatten_nested(self):
        tree = [
            {
                "type": "IfcProject",
                "expressID": 1,
                "GlobalId": "a",
                "Name": "P",
                "children": [
                    {
                        "type": "IfcSite",
                        "expressID": 2,
                        "GlobalId": "b",
                        "Name": "S",
                        "children": [
                            {
                                "type": "IfcBuilding",
                                "expressID": 3,
                                "GlobalId": "c",
                                "Name": "B",
                                "children": [],
                            }
                        ],
                    }
                ],
            }
        ]
        result = flatten_tree(tree)
        assert len(result) == 3
        types = [n["type"] for n in result]
        assert types == ["IfcProject", "IfcSite", "IfcBuilding"]


class TestCountByType:
    def test_count_empty(self):
        assert count_by_type([]) == {}

    def test_count_mixed(self):
        nodes = [
            {"type": "IfcWall", "expressID": 1, "GlobalId": "a", "Name": "", "children": []},
            {"type": "IfcWall", "expressID": 2, "GlobalId": "b", "Name": "", "children": []},
            {"type": "IfcSlab", "expressID": 3, "GlobalId": "c", "Name": "", "children": []},
        ]
        counts = count_by_type(nodes)
        assert counts["IfcWall"] == 2
        assert counts["IfcSlab"] == 1
