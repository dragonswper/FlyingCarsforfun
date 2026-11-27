"""Original Playdock promotional illustration. Run with Blender in background."""
import bpy, math, os
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name, color, metallic=0.0, roughness=.65, glow=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=roughness
    if glow: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=glow
    return m
turfa=mat('Mint turf',(.16,.39,.28)); turfb=mat('Alternating turf',(.19,.46,.30))
blue=mat('Original electric blue car',(.018,.42,.90),.2,.32); blue2=mat('Deep blue trim',(.02,.14,.29),.2,.45)
glass=mat('Dark ink glass',(.018,.05,.07),.3,.2); rubber=mat('Charcoal rubber',(.025,.038,.041),0,.87)
rim=mat('Warm magnesium wheel',(.78,.85,.69),.6,.28); white=mat('Warm white',(.92,.95,.82),0,.45)
black=mat('Ball dark panels',(.016,.055,.065),.05,.5); lamp=mat('Headlights',(.87,1,.59),.2,.3,2)
violet=mat('Violet boost',(.53,.2,.95),.1,.35,1.5); lime=mat('Lime stadium accents',(.61,.88,.30),0,.55,1)
stand=mat('Dark teal stadium',(.027,.09,.105)); pale=mat('Pale pitch markings',(.63,.82,.67))
def box(name,p,scale,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
    if bevel: mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def cyl(name,p,r,depth,m,rotation=(0,0,0),vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p,rotation=rotation); o=bpy.context.object;o.name=name;o.data.materials.append(m)
    mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=.035;mod.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def tube(name,a,b,r,m):
    a,b=Vector(a),Vector(b);d=b-a;o=cyl(name,(a+b)/2,r,d.length,m,vertices=12);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
for i in range(16):box('Mown field stripe',(i*2-12,0,-.12),(2,26,.2),turfa if i%2 else turfb)
for x in [-11,17]:box('Sideline',(x,0,.005),(.055,25,.018),pale)
for y in [-10,10]:box('Baseline',(3,y,.005),(28,.055,.018),pale)
box('Halfway line',(3,0,.012),(28,.065,.02),pale)
bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=8,location=(3,0,.025),major_radius=3,minor_radius=.035);bpy.context.object.data.materials.append(pale)
# Place the car in the right half so the landing-page title has room.
cx,cy=5,-2
box('Original car body',(cx,cy,.87),(3.5,1.82,.62),blue,.14)
box('Side sill',(cx,cy,.61),(3.55,1.87,.17),blue2,.05)
cab=box('Cabin',(cx-.32,cy,1.48),(1.7,1.58,.67),glass,.18)
box('Roof',(cx-.4,cy,1.85),(1.6,1.54,.1),blue,.05)
box('Bonnet',(cx+1.05,cy,1.21),(1.15,1.68,.13),blue,.06)
for y in [-.63,.63]:box('Warm front lamp',(cx+1.77,cy+y,1.04),(.06,.41,.14),lamp,.015)
box('Front bumper',(cx+1.8,cy,.78),(.15,1.75,.18),blue2,.035)
for y in [-.53,.53]:box('Rear brake lights',(cx-1.77,cy+y,1.03),(.055,.36,.12),violet,.01)
for y in [-.56,.56]:box('Rear wing bracket',(cx-1.4,cy+y,1.48),(.09,.08,.4),blue2,.02)
box('Original rear wing',(cx-1.49,cy,1.68),(.47,2.05,.12),blue,.04)
for x in [-1.12,1.12]:
    for y in [-.95,.95]:
        cyl('Tyre',(cx+x,cy+y,.59),.55,.30,rubber,(math.pi/2,0,0))
        cyl('Wheel rim',(cx+x,cy+y*1.17,.59),.36,.04,rim,(math.pi/2,0,0))
        cyl('Wheel hub',(cx+x,cy+y*1.20,.59),.15,.045,blue2,(math.pi/2,0,0))
        for j in range(8):
            angle=j*math.tau/8
            cyl('Wheel hardware',(cx+x+.25*math.cos(angle),cy+y*1.20,.59+.25*math.sin(angle)),.026,.045,glass,(math.pi/2,0,0),12)
# Violet geometric exhaust, with a few quiet streaks leading into the car.
for y in [-.45,.45]:
    cyl('Exhaust nozzle',(cx-1.8,cy+y,.68),.14,.2,glass,(0,math.pi/2,0))
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.015,radius2=.22,depth=2.2,location=(cx-2.85,cy+y,.68),rotation=(0,math.pi/2,0));bpy.context.object.data.materials.append(violet)
for i in range(5):tube('Boost streak',(cx-5-i*.4,cy-1+i*.5,.12),(cx-3-i*.25,cy-1+i*.5,.12),.027,violet)
# A spherical ball with original pentagonal patches projected onto its surface.
centre=Vector((7,2,2.0)); radius=1.35
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,radius=radius,location=centre);ball=bpy.context.object;ball.name='Original football';ball.data.materials.append(white)
for p in ball.data.polygons:p.use_smooth=True
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);ico=bpy.context.object;dirs=[v.co.normalized() for v in ico.data.vertices];bpy.data.objects.remove(ico,do_unlink=True)
for n in dirs:
    u=n.cross(Vector((0,0,1)))
    if u.length<.1:u=n.cross(Vector((0,1,0)))
    u.normalize();v=n.cross(u);verts=[centre+n*(radius+.065)]
    for i in range(5):
        a=i*math.tau/5;p=n*math.cos(.30)+(u*math.cos(a)+v*math.sin(a))*math.sin(.30);verts.append(centre+p*(radius+.065))
    mesh=bpy.data.meshes.new('Pentagonal ball patch');mesh.from_pydata(verts,[],[(0,i+1,(i+1)%5+1) for i in range(5)]);o=bpy.data.objects.new('Ball patch',mesh);bpy.context.collection.objects.link(o);mesh.materials.append(black)
# Stadium, goal and soft graphic seating blocks.
for x in range(-11,19,2):
    for row in range(3):
        box('Far stand',(x,12+row*.6,.5+row*.7),(1.9,.6,.28),lime if (x+row)%4 else violet,.035)
box('Far stadium wall',(3,14,1.5),(34,.5,4),stand)
for x in [-12,18]:box('Arena wall',(x,1,1),(1,27,2),stand)
for x in [-12,18]:tube('Side luminous trim',(x, -12,2.02),(x,14,2.02),.065,lime)
for x in [1,9]:tube('Goal upright',(x,9.5,.1),(x,9.5,4),.11,lime)
tube('Goal crossbar',(1,9.5,4),(9,9.5,4),.11,lime)
for i in range(17):tube('Goal net',(1+i*.5,10.1,0),(1+i*.5,10.1,4),.016,pale)
for i in range(9):tube('Goal net',(1,10.1,i*.5),(9,10.1,i*.5),.016,pale)
for x in [-9,15]:
    tube('Floodlight mast',(x,13,0),(x,13,10),.1,stand)
    box('Floodlight housing',(x,13,10),(3,.4,.6),stand,.1)
    for j in range(5):box('Floodlight',(x-1+j*.5,12.75,10),(.3,.1,.3),lamp,.03)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.max_bounces=4;scene.cycles.diffuse_bounces=2;scene.cycles.glossy_bounces=2;scene.cycles.use_denoising=False
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.color=(.12,.18,.22);scene.view_settings.view_transform='AgX'
def area(name,p,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((4,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm soft key',(3,-4,14),2400,10,(.85,1,.9));area('Violet rim',(1,10,9),3000,8,(.58,.47,1));area('Front fill',(15,-10,8),1500,7,(.5,.8,1))
bpy.ops.object.camera_add(location=(18,-18,14));camera=bpy.context.object;camera.rotation_euler=(Vector((2.5,1.5,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=25;camera.data.lens=42;scene.camera=camera
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=88;scene.render.filepath=os.path.join(ROOT,'dist/hub/assets/hero.jpg')
bpy.context.preferences.filepaths.save_version=0;os.makedirs(os.path.join(ROOT,'art'),exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art/playdock-hero.blend'))
bpy.ops.render.render(write_still=True)
