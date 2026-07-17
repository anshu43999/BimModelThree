"""
CLI entry point using Typer.

Provides two commands:

    ifc-to-glb convert <input.ifc> [--output <out.glb>] [--color]
        [--no-hierarchy] [--no-properties]

    ifc-to-glb info <input.ifc>

When installed via pip, the ``ifc-to-glb`` console script routes here.
During development, use ``python -m ifc_to_glb.cli``.
"""

from pathlib import Path

import typer

app = typer.Typer(
    name="ifc-to-glb",
    help="Convert IFC building models to glTF Binary (.glb).",
    no_args_is_help=True,
)


@app.command()
def convert(
    input: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Input IFC file path (.ifc).",
    ),
    output: Path = typer.Option(
        None,
        "--output",
        "-o",
        help="Output .glb file path. Defaults to output/<stem>.glb.",
    ),
    color: bool = typer.Option(
        False,
        "--color",
        help="Apply per-type material colours to geometry.",
    ),
    no_hierarchy: bool = typer.Option(
        False,
        "--no-hierarchy",
        help="Disable spatial hierarchy; output flat node list.",
    ),
    no_properties: bool = typer.Option(
        False,
        "--no-properties",
        help="Skip BIM property embedding in node extras.",
    ),
) -> None:
    """Convert an IFC file to GLB."""
    from .converter import convert_ifc_to_glb

    if output is None:
        output = Path("output") / f"{input.stem}.glb"

    convert_ifc_to_glb(
        input_path=str(input.resolve()),
        output_path=str(output.resolve()),
        use_color=color,
        include_hierarchy=not no_hierarchy,
        include_properties=not no_properties,
    )


@app.command()
def info(
    input: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="IFC file path (.ifc).",
    ),
) -> None:
    """Print summary information about an IFC file."""
    import ifcopenshell

    model = ifcopenshell.open(str(input.resolve()))

    print(f"File:       {input.resolve()}")
    print(f"Schema:     {model.schema}")

    # Count entity types
    type_counts: dict[str, int] = {}
    for entity in model:
        t = entity.is_a()
        type_counts[t] = type_counts.get(t, 0) + 1

    print(f"Entities:   {len(type_counts)} types, {sum(type_counts.values())} total")

    # Print top types
    print("\nTop entity types:")
    sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
    for i, (t, count) in enumerate(sorted_types):
        if i >= 20:
            remainder = len(sorted_types) - 20
            if remainder > 0:
                print(f"  ... and {remainder} more types")
            break
        print(f"  {t:40s} {count:>6d}")

    # Spatial structure
    from .hierarchy import build_spatial_tree, count_by_type

    tree = build_spatial_tree(model)
    spatial_counts = count_by_type(tree)
    building_elements = {
        k: v
        for k, v in spatial_counts.items()
        if k not in {"IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcSpace"}
    }

    if spatial_counts:
        print("\nSpatial structure:")
        for t in ["IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey"]:
            if t in spatial_counts:
                print(f"  {t:40s} {spatial_counts[t]:>6d}")

        print(f"\n  Building elements: {sum(building_elements.values())}")

    # Estimate geometry
    try:
        from .geometry import create_geometry_settings, iter_geometry

        settings = create_geometry_settings()
        geom_count = 0
        for _ in iter_geometry(model, settings):
            geom_count += 1
        print(f"\nGeometry:   {geom_count} elements have geometric representation")
    except Exception as e:
        print(f"\nGeometry:   extraction not available ({e})")


def main():
    """Package entry point registered in pyproject.toml."""
    app()


if __name__ == "__main__":
    main()
