"""Create an editable, flat painterly smiley with Blender's native geometry.

Run with Blender --background --factory-startup --python create_smiley.py.
The drawing uses pigment materials and irregular brush ribbons, not 3D lighting.
"""

from pathlib import Path
import math
import random

import bpy


OUTPUT = Path(__file__).resolve().parent
rng = random.Random(236)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene


def linear(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def pigment(name, rgb, variation=0.06, grain=115):
    material = bpy.data.materials.new(name)
    color = tuple(linear(c) for c in rgb)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = grain
    noise.inputs['Detail'].default_value = 2.5
    geometry = nodes.new('ShaderNodeNewGeometry')
    ramp = nodes.new('ShaderNodeValToRGB')
    for element, factor in zip(ramp.color_ramp.elements, (1 - variation, 1 + variation)):
        element.color = (*[min(1, c * factor) for c in color], 1)
    links = material.node_tree.links
    links.new(geometry.outputs['Position'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], output.inputs['Surface'])
    return material


def layer(name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection


def mesh(name, vertices, faces, material, collection):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def brush(name, points, width, z, material, collection, taper=0.5):
    """A flat paint stroke with bristle-like, uneven edges and tapered ends."""
    vertices = []
    count = len(points)
    phase = rng.random() * 6.28
    for i, (x, y) in enumerate(points):
        before = points[max(0, i - 1)]
        after = points[min(count - 1, i + 1)]
        dx, dy = after[0] - before[0], after[1] - before[1]
        length = max(0.0001, math.hypot(dx, dy))
        nx, ny = -dy / length, dx / length
        t = i / (count - 1)
        pressure = (1 - taper) + taper * math.sin(math.pi * t) ** 0.35
        half = width * 0.5 * pressure * (1 + 0.12 * math.sin(t * 15 + phase))
        for side in (-1, 1):
            edge = half * rng.uniform(0.78, 1.19)
            vertices.append((x + side * nx * edge, y + side * ny * edge, z))
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(count - 1)]
    return mesh(name, vertices, faces, material, collection)


paper_layer = layer('01 · Paper')
paint_layer = layer('02 · Yellow brushwork')
features_layer = layer('03 · Eyes and smile')
paper = pigment('Warm textured paper', (247, 242, 227), 0.055, 170)
yellow = pigment('Sunflower yellow underpainting', (242, 192, 40), 0.09)
colors = [
    (246, 197, 45), (248, 200, 48), (244, 193, 39),
    (248, 201, 51), (244, 191, 38), (247, 198, 46),
]
paints = [pigment(f'Yellow pigment {i + 1}', color, 0.10) for i, color in enumerate(colors)]
charcoal = pigment('Charcoal paint', (40, 43, 38), 0.30, 160)
dry_charcoal = pigment('Dry charcoal bristles', (78, 77, 57), 0.28, 190)

mesh('Paper sheet', [(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)],
     [(0, 1, 2, 3)], paper, paper_layer)

# An uneven painted perimeter: all surfaces remain flat and shadowless.
vertices = [(0, 0, 0.01)]
segments = 360
for i in range(segments):
    angle = math.tau * i / segments
    radius = 1.62 + 0.016 * math.sin(7 * angle) + 0.009 * math.sin(19 * angle)
    radius += rng.uniform(-0.008, 0.008)
    vertices.append((radius * math.cos(angle), radius * math.sin(angle), 0.01))
faces = [(0, i + 1, (i + 1) % segments + 1) for i in range(segments)]
mesh('Rough circular underpainting', vertices, faces, yellow, paint_layer)

# Overlapping, slightly diagonal strokes give the pigment a visible direction.
for row in range(43):
    y = -1.55 + row * 0.074
    extent = math.sqrt(max(0, 1.60 ** 2 - y ** 2))
    divisions = [0, rng.uniform(0.24, 0.38), rng.uniform(0.61, 0.78), 1]
    for part in range(3):
        start = max(0, divisions[part] - 0.04)
        stop = min(1, divisions[part + 1] + 0.04)
        bend, tilt = rng.uniform(-0.035, 0.035), rng.uniform(-0.065, 0.065)
        points = []
        for i in range(32):
            local_t = i / 31
            t = start + (stop - start) * local_t
            x = (2 * t - 1) * extent
            points.append((x, y + tilt * (local_t - 0.5)
                           + bend * math.sin(local_t * math.pi)
                           + 0.014 * math.sin(local_t * 7 + row)))
        brush(f'Yellow brushstroke {row + 1:02}.{part}', points, rng.uniform(0.085, 0.15),
              0.02 + row * 0.00015 + part * 0.00003, rng.choice(paints), paint_layer, 0.65)

# Fine, broken streaks suggest the gaps between bristles in a dry brush.
for i in range(190):
    x, y = rng.uniform(-1.5, 1.5), rng.uniform(-1.5, 1.5)
    if x * x + y * y > 1.46 ** 2:
        continue
    length = rng.uniform(0.06, 0.38)
    if (x + length) ** 2 + y * y > 1.53 ** 2:
        continue
    points = [(x + length * t / 9, y + 0.008 * math.sin(t / 2 + i)) for t in range(10)]
    material = paper if i % 19 == 0 else rng.choice(paints)
    brush(f'Fine pigment streak {i:03}', points, rng.uniform(0.002, 0.009),
          0.035 + i * 0.00001, material, paint_layer, 0.85)

for side, x in [('Left', -0.58), ('Right', 0.59)]:
    points = [(x + 0.027 * math.sin(t / 20 * math.pi),
               0.74 - 0.40 * t / 20) for t in range(21)]
    brush(f'{side} eye · painted dab', points, 0.245, 0.06,
          charcoal, features_layer, 0.83)
    for i in range(7):
        offset = rng.uniform(-0.06, 0.06)
        points = [(x + offset + 0.006 * math.sin(t + i),
                   0.68 - 0.26 * t / 10) for t in range(11)]
        brush(f'{side} eye · bristle {i}', points, rng.uniform(0.002, 0.006),
              0.065 + i * 0.0001, dry_charcoal, features_layer, 0.8)

smile = []
for i in range(73):
    t = i / 72
    x = -0.98 + 2.0 * t
    y = -0.32 - 0.61 * math.sin(math.pi * t) ** 0.8 + 0.038 * t
    y += 0.009 * math.sin(t * 15)
    smile.append((x, y))
brush('Smile · sweeping charcoal brushstroke', smile, 0.115, 0.07,
      charcoal, features_layer, 0.55)
for i in range(4):
    start, stop = rng.randrange(3, 13), rng.randrange(59, 71)
    points = [(x, y + (i - 1.5) * 0.017) for x, y in smile[start:stop]]
    brush(f'Smile · dry bristle {i}', points, 0.004, 0.08 + i * 0.0001,
          dry_charcoal, features_layer, 0.85)

bpy.ops.object.camera_add(location=(0, 0, 8))
camera = bpy.context.object
camera.name = 'Front orthographic camera · 2D drawing'
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.35
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.cycles.use_denoising = False
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.filepath = str(OUTPUT / 'smiley.png')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1

bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.shading.color_type = 'MATERIAL'

bpy.ops.render.render(write_still=True)
preview = bpy.data.images.load(str(OUTPUT / 'smiley.png'))
preview.name = 'Smiley · painterly 2D preview'
preview.pack()
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.type = 'IMAGE_EDITOR'
        area.spaces.active.image = preview
        break
scene['artwork'] = 'Flat painterly smiley: editable pigment ribbons on warm paper.'
scene['editing'] = 'Switch the main editor to 3D Viewport to edit the named paint collections.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'smiley.blend'))
print('SMILEY_READY', OUTPUT / 'smiley.blend', OUTPUT / 'smiley.png')
