"""Five original Boost Circuit venues, modeled and rendered in Blender 4.3+.

    blender -b -t 2 --python-exit-code 1 -P scripts/create-arena-pack.py -- all
    blender -b -t 2 --python-exit-code 1 -P scripts/create-arena-pack.py -- coast

No downloaded models, textures, generators or paid services. Source collections
retain editable props; only the web export is merged into material batches.
Coordinates are metres, Z up; glTF converts to the game's Y-up coordinates.
The regulation pitch, walls, goals and boost pads are supplied by the game.
"""
import bpy
import hashlib
import json
import math
import random
import subprocess
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist/assets/maps'
ART = ROOT / 'art'
TAU = math.tau
VENUES = {
    'yuletide': ('Yuletide Market', 'Christmas market, clocktower, snow and lanterns'),
    'halloween': ('Halloween Hollow', 'Pumpkin harvest, gothic manor and moonlit bare trees'),
    'coast': ('Sunset Coast', 'Seaside promenade, lighthouse, palms and sailboats'),
    'canyon': ('Red Rock Canyon', 'Layered sandstone, natural arch and desert rail bridge'),
    'orbital': ('Orbital Station', 'Observation ring, solar arrays and an Earthrise'),
}
CUBE = [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),
        (-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
FACES = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]


def build(venue):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(2400 + list(VENUES).index(venue))
    materials, parts = {}, []
    collections = {}
    for name in ['Architecture', 'Landscape', 'Venue props', 'Calibration', 'Preview only']:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        collections[name] = col

    def material(name, color, metal=0, rough=.8, glow=0):
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Metallic'].default_value = metal
        p.inputs['Roughness'].default_value = rough
        if glow:
            p.inputs['Emission Color'].default_value = (*color, 1)
            p.inputs['Emission Strength'].default_value = glow
        materials[name] = m
        return m

    # One restrained, coherent palette per venue. Materials export directly;
    # no unsupported procedural shader nodes or runtime texture downloads.
    palettes = {
        'yuletide': [( .07,.13,.13),(.32,.18,.105),(.10,.28,.18),(.65,.075,.08),(.85,.91,.90),(.69,.51,.20)],
        'halloween':[(.09,.08,.14),(.22,.12,.18),(.16,.22,.18),(.67,.22,.035),(.48,.46,.44),(.37,.23,.45)],
        'coast':    [(.11,.27,.29),(.53,.37,.23),(.09,.37,.28),(.75,.24,.16),(.92,.83,.65),(.10,.42,.55)],
        'canyon':   [(.18,.20,.20),(.30,.18,.105),(.21,.32,.20),(.64,.25,.12),(.77,.55,.32),(.45,.20,.12)],
        'orbital':  [(.055,.085,.14),(.18,.24,.32),(.055,.21,.36),(.65,.26,.09),(.65,.75,.80),(.16,.35,.55)],
    }
    colors = palettes[venue]
    dark = material('Venue structural steel', colors[0], .45, .48)
    timber = material('Timber or panel substrate', colors[1], .15 if venue=='orbital' else 0)
    green = material('Foliage or secondary panels', colors[2], .1)
    accent = material('Signature vermilion', colors[3], .12)
    pale = material('Pale stone or snow', colors[4])
    detail = material('Secondary venue accent', colors[5], .2)
    silver = material('Satin rail metal', (.34,.42,.46), .72, .34)
    blue = material('Blue end seating', (.035,.28,.50), .12)
    orange = material('Orange end seating', (.95,.32,.055), .1)
    light = material('Warm lamps', (1,.68,.25), .1, .4, 2.5)
    cool = material('Cool lamps', (.24,.73,.90), .1, .4, 1.7)
    ivory = material('Venue lettering', (.91,.91,.80))
    ground = material('Scenery ground', {'yuletide':(.61,.73,.78),'halloween':(.10,.14,.12),
        'coast':(.70,.53,.34),'canyon':(.48,.30,.16),'orbital':(.035,.055,.09)}[venue])

    def mesh(name, vertices, faces, mat, pos=(0,0,0), scale=(1,1,1), rot=None, category='Venue props'):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.materials.append(mat)
        data.update()
        obj = bpy.data.objects.new(name, data)
        collections[category].objects.link(obj)
        obj.location = pos
        obj.scale = scale
        if rot: obj.rotation_euler = rot
        obj['originalArtwork'] = True
        obj['venue'] = venue
        parts.append(obj)
        return obj

    def box(name, pos, size, mat, yaw=0, category='Venue props'):
        return mesh(name, CUBE, FACES, mat, pos, size, (0,0,yaw), category)

    def cylinder(name, pos, radius, height, mat, sides=10, top=None, category='Venue props'):
        if top is None: top = radius
        if top == 0:
            verts=[(radius*math.cos(i*TAU/sides),radius*math.sin(i*TAU/sides),-height/2) for i in range(sides)]
            verts.append((0,0,height/2))
            faces=[tuple(range(sides-1,-1,-1))]+[(i,(i+1)%sides,sides) for i in range(sides)]
            return mesh(name,verts,faces,mat,pos,category=category)
        verts = [(r*math.cos(i*TAU/sides), r*math.sin(i*TAU/sides), z)
                 for r,z in [(radius,-height/2),(top,height/2)] for i in range(sides)]
        faces = [tuple(range(sides-1,-1,-1)),tuple(range(sides,sides*2))]
        faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        return mesh(name, verts, faces, mat, pos, category=category)

    def beam(name, a, b, radius, mat, sides=6):
        delta = Vector(b)-Vector(a)
        obj = cylinder(name, (Vector(a)+Vector(b))/2, radius, delta.length, mat, sides)
        obj.rotation_euler = delta.to_track_quat('Z','Y').to_euler()
        return obj

    def sphere(name, pos, radius, mat, scale=(1,1,1), segments=12, rings=6):
        # UV ellipsoid with explicit pole fans avoids degenerate triangles.
        verts = [(0,0,-radius)]
        for j in range(1,rings):
            phi=-math.pi/2+j*math.pi/rings
            verts += [(radius*math.cos(phi)*math.cos(i*TAU/segments),
                       radius*math.cos(phi)*math.sin(i*TAU/segments),radius*math.sin(phi)) for i in range(segments)]
        verts.append((0,0,radius))
        faces = [(0,1+(i+1)%segments,1+i) for i in range(segments)]
        for j in range(rings-2):
            a=1+j*segments;b=a+segments
            faces += [(a+i,a+(i+1)%segments,b+(i+1)%segments,b+i) for i in range(segments)]
        top=len(verts)-1;base=top-segments
        faces += [(base+i,base+(i+1)%segments,top) for i in range(segments)]
        return mesh(name,verts,faces,mat,pos,scale)

    def ribbon(name, points, width, mat):
        verts=[]
        for x,y,z in points: verts += [(x-width/2,y,z),(x+width/2,y,z)]
        return mesh(name,verts,[(i,i+1,i+3,i+2) for i in range(0,len(verts)-2,2)],mat)

    def lettering(label, pos, size=1.4, mat=ivory, yaw=0):
        curve=bpy.data.curves.new('Lettering '+label,'FONT')
        curve.body=label;curve.align_x='CENTER';curve.size=size;curve.extrude=.008
        curve.resolution_u=3
        obj=bpy.data.objects.new('Lettering '+label,curve);collections['Architecture'].objects.link(obj)
        obj.location=pos;obj.rotation_euler=(math.pi/2,0,yaw);curve.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH');obj=bpy.context.object;obj['originalArtwork']=True;obj['venue']=venue;parts.append(obj)

    # Compact stands: the end terraces start behind the entire 8.8m goal room.
    # No scenery occupies the driving cage, its roof, or either goal interior.
    box('Venue foundation',(0,0,-1.2),(220,235,1.6),ground,category='Landscape')
    for axis,sign,length in [('x',-1,112),('x',1,112),('y',-1,88),('y',1,88)]:
        boundary=44 if axis=='x' else 65
        def point(out,along,h): return (sign*out,along,h) if axis=='x' else (along,sign*out,h)
        def dimensions(out,along,h): return (out,along,h) if axis=='x' else (along,out,h)
        for row in range(5):
            out=boundary+1.8+row*1.85;h=.65+row*.8
            box('Stepped terrace',point(out,0,h/2),dimensions(1.9,length,h),pale,category='Architecture')
            for col in range(int(length/2.2)):
                along=(col-(int(length/2.2)-1)/2)*2.2
                if abs(along)%17<2.2: continue
                mat=blue if along<0 else orange
                box('Moulded seat',point(out,along,h+.19),dimensions(.85,1.18,.18),mat,category='Architecture')
                box('Seat back',point(out+.4,along,h+.6),dimensions(.14,1.18,.65),dark,category='Architecture')
        for along in range(-int(length/2)+5,int(length/2),16):
            beam('Roof upright',point(boundary+12,along,0),point(boundary+12,along,17),.16,dark)
            beam('Roof cantilever',point(boundary+12,along,16),point(boundary+.4,along,18.8),.15,dark)
            beam('Roof diagonal',point(boundary+12,along,12),point(boundary+3,along,18.1),.08,silver)
            box('Floodlight lens',point(boundary+1.2,along,18.5),dimensions(.8,2,.12),light)
        box('Thin canopy',point(boundary+7,0,18.8),dimensions(14,length+2,.22),dark,category='Architecture')
        box('Front fascia',point(boundary+.2,0,1.8),dimensions(.25,length,1.65),dark,category='Architecture')
        box('Team ribbon',point(boundary,0,2.5),dimensions(.3,length,.12),blue if sign<0 else orange)
    title=VENUES[venue][0].upper()
    for sign in [-1,1]:
        box('Venue sign board',(0,sign*65,12),(30,.6,5.6),dark,category='Architecture')
        lettering(title,(0,sign*64.65,12.5),1.15,yaw=0 if sign>0 else math.pi)
        lettering('BOOST CIRCUIT  /  ORIGINAL VENUES',(0,sign*64.6,10.8),.42,yaw=0 if sign>0 else math.pi)

    def pine(x,y,h,lights=False):
        cylinder('Pine trunk',(x,y,h*.18),.32,h*.4,timber,7)
        for layer in range(3):
            z=h*(.3+layer*.22);r=h*(.26-layer*.055)
            cylinder('Evergreen tiers',(x,y,z),r,h*.43,green,8,0)
            if venue=='yuletide':cylinder('Snow on branches',(x,y,z+h*.06),r*.8,h*.34,pale,8,0)
        if lights:
            for i in range(40):
                t=i/40;angle=i*2.4;r=h*.24*(1-t)
                sphere('Tree bauble',(x+math.cos(angle)*r,y+math.sin(angle)*r,h*(.18+t*.7)),.17,light if i%3 else accent,segments=6,rings=3)
            # A modeled five-point star rather than a floating sphere.
            star=[]
            for i in range(10):
                a=math.pi/2+i*TAU/10;r=.95 if i%2==0 else .42
                star.append((math.cos(a)*r,0,math.sin(a)*r))
            mesh('Tree topper star',star,[tuple(range(10))],light,(x,y,h*1.02))

    def cabin(x,y,w=7,d=5,h=5,market=False):
        box('Timber chalet',(x,y,h/2),(w,d,h),timber)
        for side in [-1,1]:
            roof=box('Pitched roof',(x+side*w*.25,y,h+.6),(w*.6,d+1,.3),pale if venue=='yuletide' else dark)
            roof.rotation_euler.y=side*.35
        for xx in [-w*.26,w*.26]:
            box('Lit chalet window',(x+xx,y-d/2-.03,h*.62),(w*.2,.08,1.35),light)
            box('Window mullion',(x+xx,y-d/2-.1,h*.62),(.075,.1,1.35),dark)
        box('Chalet door',(x,y-d/2-.06,h*.33),(1.15,.1,h*.66),dark)
        if market:
            for i in range(9):box('Striped market awning',(x-w*.48+i*w*.12,y-d*.65,h*.78),(w*.12,2,.13),accent if i%2 else pale)
            box('Market counter',(x,y-d*.8,1.2),(w,1.2,.25),timber)
            for i in range(5):sphere('Market produce',(x-w*.35+i*w*.17,y-d*.8,1.55),.28,accent if i%2 else detail,segments=8,rings=4)

    if venue=='yuletide':
        # Holiday 1: a warm continental town square, distinct from Frostvale.
        for x,y,w in [(-78,-44,11),(-78,-20,9),(-78,6,12),(-78,34,10),(78,-36,11),(78,-9,9),(78,22,12),(78,48,10)]:
            cabin(x,y,w,8,7,True)
        for x in [-38,-19,19,38]:cabin(x,91,12,9,8,True)
        # Clock tower with a stone plinth, timber belfry, roof and clock hands.
        box('Clock tower plinth',(0,96,2),(12,12,4),pale)
        box('Clock tower',(0,96,14),(8,8,24),timber)
        for z in [6,12,20,25]:box('Tower cornice',(0,96,z),(9,9,.35),pale)
        cylinder('Clock face',(0,91.9,20),2.45,.12,ivory,24).rotation_euler.x=math.pi/2
        for i in range(12):
            a=i*TAU/12
            box('Clock hour mark',(math.sin(a)*1.95,91.8,20+math.cos(a)*1.95),(.13,.08,.32),dark)
        beam('Clock minute hand',(0,91.65,20),(-1.2,91.65,21.2),.075,dark)
        beam('Clock hour hand',(0,91.65,20),(.85,91.65,20.4),.09,dark)
        cylinder('Tower roof',(0,96,29),7,8,accent,4,0).rotation_euler.z=math.pi/4
        for sign in [-1,1]:
            pine(sign*34,84,18,True)
            for y in [-56,-28,0,28,56]:pine(sign*95,y,rng.uniform(10,16))
        for side in [-1,1]:
            for y in range(-54,55,12):
                beam('Market lantern post',(side*62,y,0),(side*62,y,6),.1,dark)
                box('Lantern housing',(side*62,y,5.8),(.8,.8,1.1),dark)
                box('Lantern warm glass',(side*62,y,5.8),(.6,.6,.75),light)
                if y<54:
                    points=[(side*62,y+i*.5,6-math.sin(i/24*math.pi)*.8) for i in range(25)]
                    for a,b in zip(points,points[1:]):beam('Garland cord',a,b,.035,green)
                    for i in range(0,25,3):sphere('Garland bulb',points[i],.13,light,segments=6,rings=3)
        for i in range(25):
            x=rng.choice([-1,1])*rng.uniform(69,99);y=rng.uniform(-80,95)
            sphere('Snowbank',(x,y,-.1),1,pale,(rng.uniform(2,5),rng.uniform(2,5),rng.uniform(.6,1.2)))
        for x,y in [(-65,-58),(65,57)]:
            for z,r in [(.7,.95),(1.85,.68),(2.75,.47)]:sphere('Snowman',(x,y,z),r,pale)
            cylinder('Snowman hat brim',(x,y,3.2),.66,.12,dark)
            cylinder('Snowman top hat',(x,y,3.5),.42,.6,dark)
            for xx in [-.16,.16]:sphere('Snowman coal eye',(x+xx,y-.43,2.86),.065,dark,segments=6,rings=3)
            nose=cylinder('Snowman carrot',(x,y-.65,2.7),.13,.55,orange,6,0);nose.rotation_euler.x=math.pi/2

    elif venue=='halloween':
        # Holiday 2: gothic silhouettes and a harvest carnival, no reused art.
        cabin(0,103,24,16,18)
        for sign in [-1,1]:
            cylinder('Manor octagonal tower',(sign*17,103,13),5,26,timber,8)
            cylinder('Manor slate spire',(sign*17,103,30),7,11,dark,8,0)
            for z in [8,15,22]:box('Tower amber window',(sign*17,98.2,z),(1.6,.08,2.3),light)
        for x in [-7,0,7]:
            box('Manor tall window',(x,94.9,13),(2,.1,4.8),light)
            box('Manor window cross',(x,94.7,13),(.15,.1,4.9),dark)
        beam('Manor ridge finial',(0,103,20),(0,103,28),.16,silver)
        beam('Manor finial cross',(-1.5,103,26),(1.5,103,26),.13,silver)
        for side in [-1,1]:
            for i in range(12):
                x=side*rng.uniform(73,100);y=-70+i*13
                h=rng.uniform(8,15)
                beam('Bare tree trunk',(x,y,0),(x+.7,y,h),.42,timber)
                for j in range(4):
                    z=h*(.35+j*.13);dx=rng.choice([-1,1])*rng.uniform(2.5,5);dy=rng.uniform(-2,2)
                    beam('Bare tree branch',(x,y,z),(x+dx,y+dy,z+3),.18,timber)
                    beam('Crooked twig',(x+dx,y+dy,z+3),(x+dx*.85,y+dy+1.2,z+4.7),.08,timber)
            for i in range(12):
                x=side*rng.uniform(62,70);y=-60+i*11
                r=rng.uniform(.65,1.15)
                sphere('Harvest pumpkin',(x,y,r*.7),r,accent,(1,1,.75))
                for a in [-.34,.34]:
                    # Triangular cutout-like lantern eyes and a broad grin.
                    mesh('Jack-o-lantern eye',[(-.17,0,-.1),(.17,0,-.1),(0,0,.25)],[(0,1,2)],light,(x+a*r,y-r*.94,r*.9),(r,1,r))
                box('Jack-o-lantern smile',(x,y-r*.95,r*.48),(r*.7,.04,r*.15),light)
                cylinder('Pumpkin stalk',(x,y,r*1.52),.1,.45,green,6)
            for i in range(10):
                x=side*(82+(i%2)*7);y=-63+i*13
                box('Gravestone plinth',(x,y,.12),(2.1,1,.25),pale)
                box('Weathered gravestone',(x,y,1.1),(1.4,.45,1.7),pale)
                sphere('Gravestone rounded top',(x,y,1.95),.7,pale,(1,.34,.7),segments=10,rings=4)
                box('Gravestone inset',(x,y-.24,1.1),(.08,.03,.65),dark)
        moon=material('Harvest moon',(.90,.61,.26),glow=.7)
        sphere('Harvest moon',(42,150,41),12,moon,segments=24,rings=12)
        for i in range(12):
            a=i*TAU/12;x=-23+math.cos(a)*8;z=18+math.sin(a)*8
            beam('Carnival wheel spoke',(-23,-98,18),(x,-98,z),.07,silver)
            sphere('Carnival bulb',(x,-98,z),.23,light,segments=6,rings=3)
            b=(i+1)*TAU/12
            beam('Carnival wheel rim',(x,-98,z),(-23+math.cos(b)*8,-98,18+math.sin(b)*8),.12,detail)
        for dx in [-5,5]:beam('Carnival wheel leg',(-23+dx,-98,0),(-23,-98,18),.25,dark)

    elif venue=='coast':
        water=material('Atlantic teal',(.055,.31,.40),.2,.27)
        box('Ocean basin',(0,190,-1.0),(650,220,.3),water,category='Landscape')
        for i in range(34):
            x=rng.uniform(-210,210);y=rng.uniform(105,275)
            box('Ocean whitecap',(x,y,-.82),(rng.uniform(3,14),.13,.03),pale)
        def palm(x,y,h):
            beam('Palm leaning trunk',(x,y,0),(x+1.4,y,h),.42,timber,8)
            for i in range(7):
                a=i*TAU/7
                verts=[(0,0,0)]
                for j in range(1,5):
                    t=j/4;r=5*t;w=.9*math.sin(t*math.pi)
                    centre=Vector((math.cos(a)*r,math.sin(a)*r,1.4*math.sin(t*math.pi)-1.8*t*t))
                    side=Vector((-math.sin(a)*w,math.cos(a)*w,0))
                    verts += [tuple(centre+side),tuple(centre-side)]
                faces=[(0,1,2)]+[(1+j*2,3+j*2,4+j*2,2+j*2) for j in range(3)]
                leaf=mesh('Palm frond',verts,faces,green,(x+1.4,y,h))
                # glTF double-sided foliage, with no alpha sorting.
                green.use_backface_culling=False
            for dx in [-.5,.4]:sphere('Coconut',(x+1.4+dx,y,h-.3),.35,timber,segments=8,rings=4)
        for side in [-1,1]:
            for i in range(9):palm(side*(73+(i%2)*8),-67+i*17,rng.uniform(11,17))
            for i in range(8):
                x=side*63;y=-55+i*16
                cylinder('Sun umbrella pole',(x,y,2.4),.055,4.8,silver,6)
                for j in range(8):
                    a=j*TAU/8;b=(j+1)*TAU/8
                    mesh('Striped parasol',[(0,0,0),(math.cos(a)*3,math.sin(a)*3,-.8),(math.cos(b)*3,math.sin(b)*3,-.8)],[(0,1,2)],accent if j%2 else pale,(x,y,4.9))
                box('Promenade picnic table',(x,y,1.1),(3,1.4,.18),timber)
                for dy in [-1.2,1.2]:box('Promenade bench',(x,y+dy,.62),(3,.5,.15),timber)
        for i in range(7):
            z=2+i*3.4
            cylinder('Lighthouse painted bands',(-31,101,z),4.7-i*.34,3.4,pale if i%2 else accent,16,4.36-i*.34)
        cylinder('Lighthouse balcony',(-31,101,25),4,.45,dark,16)
        cylinder('Lighthouse lantern',(-31,101,27),2.5,3.3,light,12)
        cylinder('Lighthouse roof',(-31,101,30),3.8,2,dark,16,0)
        for i in range(12):
            a=i*TAU/12
            beam('Lantern mullion',(-31+math.cos(a)*2.6,101+math.sin(a)*2.6,25),(-31+math.cos(a)*2.6,101+math.sin(a)*2.6,29),.055,dark)
        for x,y in [(11,134),(62,160),(-82,166)]:
            # A shaped hull and two sewn triangular sails.
            mesh('Sailboat hull',[(-5,-2,0),(5,-2,0),(6,1,0),(-6,1,0),(-3,0,-1.5),(3,0,-1.5)],[(0,1,2,3),(0,4,5,1),(1,5,2),(2,5,4,3),(3,4,0)],dark,(x,y,.2))
            beam('Boat mast',(x,y,0),(x,y,15),.12,timber)
            mesh('Mainsail',[(0,0,1),(0,0,15),(8,0,2)],[(0,1,2)],pale,(x,y,0))
            mesh('Jib sail',[(-.5,0,2),(-.5,0,12),(-5,0,2)],[(0,1,2)],detail,(x,y,0))
        cabin(36,-96,18,12,8)
        for x in [-9,9]:
            beam('Lifeguard stilts',(x+36,-96,0),(x+36,-96,8),.2,timber)

    elif venue=='canyon':
        def mesa(x,y,r,h,seed):
            local=random.Random(seed);n=12
            radii=[r*local.uniform(.87,1.13) for i in range(n)]
            levels=[(-1,1.15),(h*.28,1),(h*.33,1.03),(h*.62,.86),(h*.67,.89),(h,.66)]
            for layer in range(len(levels)-1):
                z0,s0=levels[layer];z1,s1=levels[layer+1]
                verts=[(math.cos(i*TAU/n)*radii[i]*s,math.sin(i*TAU/n)*radii[i]*s,z) for z,s in [(z0,s0),(z1,s1)] for i in range(n)]
                faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
                if layer==len(levels)-2:faces.append(tuple(range(n,n*2)))
                mesh('Eroded sandstone stratum',verts,faces,[accent,pale,detail,pale,accent][layer],(x,y,0),category='Landscape')
        for i in range(18):
            a=i*TAU/18;x=math.cos(a)*rng.uniform(118,160);y=math.sin(a)*rng.uniform(135,170)
            mesa(x,y,rng.uniform(13,22),rng.uniform(22,51),i+2400)
        # Freestanding natural arch behind the north goal, using wedge stones.
        for side in [-1,1]:mesa(side*17,96,6,18,side+25)
        for i in range(14):
            a=i*math.pi/14;b=(i+1)*math.pi/14
            verts=[]
            for y in [-3,3]:
                for r,angle in [(15,a),(15,b),(21,b),(21,a)]:verts.append((math.cos(angle)*r,y,18+math.sin(angle)*r))
            mesh('Natural bridge sandstone',verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],pale,(0,96,0))
        for side in [-1,1]:
            for i in range(18):
                x=side*rng.uniform(66,101);y=rng.uniform(-92,93);h=rng.uniform(2.5,5.8)
                cylinder('Saguaro trunk',(x,y,h/2),.42,h,green,8)
                sphere('Cactus crown',(x,y,h),.42,green,segments=8,rings=4)
                for dx,z in [(-1.5,h*.6),(1.4,h*.4)]:
                    beam('Cactus elbow',(x,y,z),(x+dx,y,z),.25,green,8)
                    beam('Cactus arm',(x+dx,y,z),(x+dx,y,z+1.6),.25,green,8)
            for i in range(9):
                x=side*91;y=-70+i*17
                cylinder('Desert boulder',(x,y,1),rng.uniform(1.5,3.5),rng.uniform(2,4),accent,7,rng.uniform(1,2))
        # Timber trestle railroad behind the south terrace.
        box('Railway deck',(0,-98,11),(115,5,.5),timber)
        for x in range(-54,55,6):
            box('Railway sleeper',(x,-98,11.4),(.6,5.4,.18),dark)
            for y in [-99.7,-96.3]:
                beam('Trestle leg',(x,y,0),(x,y,11),.18,timber)
                if x<54:beam('Trestle diagonal',(x,y,1),(x+6,y,10.7),.13,timber)
        for y in [-99.5,-96.5]:beam('Steel rail',(-57,y,11.6),(57,y,11.6),.09,silver)
        for x in [-15,-3,9]:
            box('Freight wagon',(x,-98,13.3),(10,3.3,3.2),accent)
            for dx in [-3.2,3.2]:
                for y in [-99.7,-96.3]:
                    wheel=cylinder('Freight wagon wheel',(x+dx,y,11.9),.65,.25,dark,10);wheel.rotation_euler.x=math.pi/2

    elif venue=='orbital':
        # Curved station architecture, not a skybox. Ring is above the cage.
        for i in range(48):
            a=i*TAU/48;b=(i+1)*TAU/48
            beam('Station orbital ring',(math.cos(a)*94,math.sin(a)*112,34),(math.cos(b)*94,math.sin(b)*112,34),1.5,dark,8)
            if i%2==0:
                beam('Ring illuminated guide',(math.cos(a)*92,math.sin(a)*110,34),(math.cos(b)*92,math.sin(b)*110,34),.13,cool)
            if i%6==0:
                x=math.cos(a)*94;y=math.sin(a)*112
                beam('Station structural pylon',(x,y,-1),(x,y,34),1,dark,8)
                box('Pylon status lamp',(x,y-1.1,17),(.6,.15,12),cool)
        solar=material('Solar cell navy',(.025,.08,.18),.55,.35)
        earth=material('Ocean blue planet',(.045,.22,.48),.1,.65, .18)
        land=material('Planet continents',(.20,.43,.35),rough=.95,glow=.15)
        for side in [-1,1]:
            for y in [-70,-30,10,50,90]:
                x=side*125
                box('Solar wing frame',(x,y,15),(36,17,.4),silver)
                for row in range(3):
                    for col in range(8):box('Photovoltaic cell',(x-15.5+col*4.4,y-5.4+row*5.4,15.24),(4.15,5.1,.08),solar)
                beam('Solar wing boom',(side*92,y,15),(x,y,15),.35,silver)
        sphere('Earthrise',(5,215,70),51,earth,segments=48,rings=24)
        # Surface-conforming low polygon continent patches and cloud ribbons.
        planet=Vector((5,215,70));radius=51.35
        def globe(lat,lon,r=radius):
            return (r*math.cos(lat)*math.sin(lon),-r*math.cos(lat)*math.cos(lon),r*math.sin(lat))
        for region,(lat,lon,rad) in enumerate([(.3,-.45,.37),(-.2,-.2,.32),(.48,.5,.38),(-.4,.55,.24)]):
            verts=[globe(lat,lon)]
            # Subdivide the spherical surface so broad flat triangle chords
            # cannot sink through the ocean mesh and produce torn coastlines.
            n=36;steps=8
            for ring in range(1,steps+1):
                for i in range(n):
                    a=i*TAU/n;k=1+.12*math.sin(3*a+region)+.08*math.cos(5*a)
                    r=rad*k*ring/steps
                    verts.append(globe(lat+math.sin(a)*r,lon+math.cos(a)*r))
            faces=[(0,i+1,(i+1)%n+1) for i in range(n)]
            for ring in range(steps-1):
                a=1+ring*n;b=a+n
                faces += [(a+i,b+i,b+(i+1)%n,a+(i+1)%n) for i in range(n)]
            mesh('Stylized continent',verts,faces,land,planet)
        for i in range(12):
            lat=rng.uniform(-.75,.8);lon=rng.uniform(-.8,.8)
            pts=[globe(lat+.04*math.sin(j),lon+(j-4)*.055,51.5) for j in range(9)]
            # Slim cloud shapes float just over the globe; all behind stadium.
            for a,b in zip(pts,pts[1:]):beam('Planet cloud band',Vector(a)+planet,Vector(b)+planet,.55,ivory,6)
        for i in range(110):
            x=rng.uniform(-230,230);y=rng.choice([-1,1])*rng.uniform(160,245);z=rng.uniform(28,130)
            sphere('Distant star',(x,y,z),rng.uniform(.10,.27),cool if i%4 else light,segments=4,rings=3)
        for side in [-1,1]:
            for y in [-90,90]:
                box('Docking pod',(side*55,y,9),(12,15,15),pale)
                box('Pod observation glass',(side*55,y-7.6,10),(9,.15,5),green)
                for k in range(3):box('Pod rib',(side*55,y,4+k*5),(12.5,15.5,.3),dark)

    # Save source props with descriptive names and editable transforms. A
    # temporary copy is joined for GLB, so web performance doesn't flatten art.
    for name,pos in [('Pitch_Center',(0,0,0)),('Pitch_Side_Left',(-40.96,0,0)),
                     ('Pitch_Side_Right',(40.96,0,0)),('Goal_Blue',(0,51.2,0)),('Goal_Orange',(0,-51.2,0))]:
        obj=bpy.data.objects.new(name,None);collections['Calibration'].objects.link(obj);obj.location=pos
    scene=bpy.context.scene
    scene['artwork']='Original Boost Circuit geometry modeled in Blender'
    scene['generator']='scripts/create-arena-pack.py'
    scene['venue']=venue
    originals=list(parts)
    export_col=bpy.data.collections.new('Web export temporary');scene.collection.children.link(export_col)
    copies=[]
    for obj in originals:
        copy=obj.copy();copy.data=obj.data.copy();export_col.objects.link(copy);copies.append(copy)
    bpy.ops.object.select_all(action='DESELECT')
    batches=[]
    for mat in materials.values():
        objects=[obj for obj in export_col.objects if obj.data.materials[0]==mat and obj not in batches]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
        obj.name=venue+'_'+mat.name.replace(' ','_');obj['originalArtwork']=True;obj['venue']=venue
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);batches.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in batches:obj.select_set(True)
    for obj in collections['Calibration'].objects:obj.select_set(True)
    OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
    target=OUT/(venue+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
        export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
    raw=target.read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')])
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    for obj in list(export_col.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(export_col)

    # Preview pitch is a separate source collection and never exported. In
    # game the shared renderer supplies accurate rounded walls and goal rooms.
    turf_colors={'yuletide':(.41,.56,.56),'halloween':(.16,.23,.16),'coast':(.10,.32,.26),
                 'canyon':(.37,.30,.19),'orbital':(.06,.17,.23)}
    turf=material('Preview pitch',turf_colors[venue])
    box('Preview pitch',(0,0,-.08),(81.92,102.4,.12),turf,category='Preview only')
    for i in range(10):
        if i%2==0:box('Preview turf stripe',(0,-46.08+i*10.24,-.01),(81.92,10.24,.012),green,category='Preview only')
    for x in [-40,40]:box('Preview touchline',(x,0,.015),(.13,100,.025),ivory,category='Preview only')
    for y in [-50,0,50]:box('Preview field line',(0,y,.02),(80,.13,.025),ivory,category='Preview only')
    for i in range(64):
        a=i*TAU/64;b=(i+1)*TAU/64
        beam('Preview centre circle',(9.15*math.cos(a),9.15*math.sin(a),.03),(9.15*math.cos(b),9.15*math.sin(b),.03),.05,ivory)
    for y in [-51.2,51.2]:
        for x in [-8.92755,8.92755]:
            beam('Preview goal upright',(x,y,0),(x,y,6.42775),.12,blue if y>0 else orange)
            beam('Preview goal side',(x,y,6.42775),(x,y+math.copysign(8.8,y),6.42775),.09,dark)
        beam('Preview crossbar',(-8.92755,y,6.42775),(8.92755,y,6.42775),.12,blue if y>0 else orange)
    # Camera captures the arena and hero architecture, with field foreground.
    bpy.ops.object.camera_add(location=(89,-111,72))
    camera=bpy.context.object;camera.name='Venue overview camera';camera.data.lens=33
    camera_target=(0,30,9)
    if venue=='orbital':camera.location=(112,-150,105);camera.data.lens=30;camera_target=(0,70,30)
    camera.rotation_euler=(Vector(camera_target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    bpy.ops.object.light_add(type='SUN',location=(0,0,80));sun=bpy.context.object
    sun.rotation_euler=(.5,-.55,-.65);sun.data.energy=2.1 if venue in ['halloween','orbital'] else 3
    sun.data.color=(.73,.80,1) if venue=='orbital' else (1,.77,.55) if venue=='coast' else (1,.92,.8)
    sun.data.angle=.22
    world=bpy.data.worlds.new('Venue atmosphere');world.use_nodes=True
    sky={'yuletide':(.13,.23,.32),'halloween':(.035,.025,.065),'coast':(.45,.25,.20),
         'canyon':(.30,.38,.47),'orbital':(.006,.012,.03)}[venue]
    world.node_tree.nodes['Background'].inputs[0].default_value=(*sky,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.7
    scene.world=world;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=False;scene.render.resolution_x=960;scene.render.resolution_y=540
    scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/(venue+'-cover.png'))
    # Saving compressed is lossless, and retains every source mesh/material.
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(venue+'.blend')),compress=True)
    report={'id':venue,'name':VENUES[venue][0],'description':VENUES[venue][1],
        'author':'Boost Circuit project','license':'MIT','originalArtwork':True,
        'source':'scripts/create-arena-pack.py','sourceBlend':'art/'+venue+'.blend',
        'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':triangles,
        'materialBatches':len(doc['materials']),'textures':0,'sourceProps':len(originals),
        'collision':'Shared regulation field; decoration outside cage and goal rooms',
        'blenderVersion':bpy.app.version_string}
    target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
    print('EXPORTED '+json.dumps(report),flush=True)
    bpy.ops.render.render(write_still=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',scene.render.filepath,
        '-c:v','libwebp','-quality','86','-frames:v','1',str(OUT/(venue+'-cover.webp'))],check=True)
    Path(scene.render.filepath).unlink()
    print('FINISHED '+venue,flush=True)


args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
selected=list(VENUES) if 'all' in args else args
for venue in selected:
    if venue not in VENUES:raise ValueError('Unknown venue '+venue)
    build(venue)
