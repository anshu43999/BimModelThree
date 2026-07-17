#!/usr/bin/env bash
# Convenience script for converting IFC files to GLB.
# Usage: ./convert.sh <input.ifc> [output.glb]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <input.ifc> [output.glb]"
    echo ""
    echo "Examples:"
    echo "  $0 model.ifc"
    echo "  $0 model.ifc result.glb"
    exit 1
fi

INPUT="$1"
OUTPUT="${2:-}"

cd "$PROJECT_DIR"

if [ -n "$OUTPUT" ]; then
    python -m ifc_to_glb.cli convert "$INPUT" --output "$OUTPUT" --color
else
    python -m ifc_to_glb.cli convert "$INPUT" --color
fi
