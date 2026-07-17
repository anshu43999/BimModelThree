import struct, json

glb_path = r'E:\BimModelThree\ifc-to-glb-converter\output\北辰长沙A2项目-结构-1#楼.glb'

with open(glb_path, 'rb') as f:
    # Read GLB header
    magic = f.read(4)
    version = struct.unpack('<I', f.read(4))[0]
    length = struct.unpack('<I', f.read(4))[0]
    print(f'GLB Magic: {magic}')
    print(f'Version: {version}')
    print(f'Total length: {length:,} bytes ({length/1024/1024:.1f} MB)')

    # Read JSON chunk
    chunk_len = struct.unpack('<I', f.read(4))[0]
    chunk_type = f.read(4)
    json_data = json.loads(f.read(chunk_len))

    # Analyze
    nodes = json_data.get('nodes', [])
    meshes_data = json_data.get('meshes', [])
    print(f'Nodes: {len(nodes)}')
    print(f'Meshes: {len(meshes_data)}')

    # Check node hierarchy (depth)
    def max_depth(node_idx, nodes, depth=0):
        node = nodes[node_idx]
        children = node.get('children', [])
        if not children:
            return depth
        return max(max_depth(c, nodes, depth+1) for c in children)

    if nodes:
        # Find root nodes (not referenced as children)
        all_children = set()
        for n in nodes:
            all_children.update(n.get('children', []))
        roots = [i for i in range(len(nodes)) if i not in all_children]
        print(f'Root nodes: {len(roots)}')
        if roots:
            d = max_depth(roots[0], nodes)
            print(f'Max hierarchy depth: {d}')

        # Sample node names
        print('\nSample nodes:')
        for n in nodes[:10]:
            name = n.get('name', 'N/A')
            extras = n.get('extras', {})
            has_extras = len(extras) > 0
            has_children = len(n.get('children', [])) > 0
            has_mesh = 'mesh' in n
            flags = []
            if has_extras:
                flags.append('PROPS')
            if has_children:
                flags.append('CHILDREN')
            if has_mesh:
                flags.append('MESH')
            flag_str = ", ".join(flags) if flags else "no flags"
            print(f'  {name} [{flag_str}]')

        # Count nodes with extras
        with_extras = sum(1 for n in nodes if n.get('extras'))
        with_mesh = sum(1 for n in nodes if 'mesh' in n)
        print(f'\nNodes with BIM properties: {with_extras}')
        print(f'Nodes with geometry: {with_mesh}')

    # Check if extras contain useful data
    extras_nodes = [n for n in nodes if n.get('extras')]
    if extras_nodes:
        sample_extras = extras_nodes[0].get('extras', {})
        keys = list(sample_extras.keys())[:10]
        print(f'\nSample extras keys ({len(extras_nodes)} nodes have extras): {keys}')
        # Print a couple of extras in full
        for i in range(min(3, len(extras_nodes))):
            print(f'\n  Node: {extras_nodes[i].get("name", "N/A")}')
            print(f'  Extras: {extras_nodes[i].get("extras", {})}')
