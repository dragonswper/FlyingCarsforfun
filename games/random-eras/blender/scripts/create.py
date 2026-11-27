"""Build editable source scenes for the original Random Eras art."""
from pathlib import Path
from math import cos, pi, sin, radians
import random
import bpy
from mathutils import Vector

SOURCE = Path(__file__).resolve().parents[1] / 'src'
SOURCE.mkdir(parents=True, exist_ok=True)
rng = random.Random(4471)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0


def mat(name, color, metallic=0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = 0.82 if not metallic else 0.5
    shader.inputs['Metallic'].default_value = metallic
    return material


def attach(obj, name, paint=None, parent=None, location=(0, 0, 0)):
    obj.name = name
    obj.parent = parent
    obj.location = location
    if paint:
        obj.data.materials.append(paint)
    return obj


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return attach(obj, name, parent=parent, location=location)


def mark_edges(obj, width):
    bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new('Worn edges', 'BEVEL')
    bevel.width = width
    bevel.segments = 1
    bevel.affect = 'EDGES'
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def box(name, position, dimensions, paint, parent=None, angle=0, bevel=True):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    for vertex in obj.data.vertices:
        for axis, dimension in enumerate(dimensions):
            vertex.co[axis] *= dimension
    attach(obj, name, paint, parent, position)
    obj.rotation_euler.y = angle
    return mark_edges(obj, min(dimensions) * 0.125) if bevel else obj


def cone(name, position, bottom, top, length, paint, parent=None, sides=7):
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=bottom, radius2=top, depth=length)
    return attach(bpy.context.object, name, paint, parent, position)


def lump(name, position, dimensions, paint, parent=None, detail=1, rough=0.08):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=1)
    obj = bpy.context.object
    for vertex in obj.data.vertices:
        vertex.co *= 1 + rng.uniform(-rough, rough)
        for axis, dimension in enumerate(dimensions):
            vertex.co[axis] *= dimension
    return attach(obj, name, paint, parent, position)


def rod(name, start, end, r1, r2, paint, parent=None):
    delta = Vector(end) - Vector(start)
    obj = cone(name, (Vector(start) + Vector(end)) * 0.5, r1, r2, delta.length, paint, parent)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    return obj


def save(name):
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')), compress=True)


def weapon(root, kind, steel, wood, trim):
    shaft = 1.92 if kind == 'spear' else 1.06 if kind in ('club', 'mace', 'axe') else .28
    cone('haft', (0, 0, shaft / 2 - .15), .049, .038, shaft, wood, root, 8)
    if kind in ('club', 'mace'):
        head = lump('striking head', (.026, 0, .99), (.17, .13, .26), steel, root, 2)
        head.rotation_euler.y = .17
        for z in (.77, .83):
            cone('binding', (0, 0, z), .071, .074, .032, trim, root)
        tip = (0, 0, 1.24)
    elif kind == 'axe':
        box('wedge', (.14, 0, .91), (.33, .075, .27), steel, root, .20)
        box('edge', (.301, 0, .94), (.053, .082, .33), trim, root, .20)
        tip = (.32, 0, 1.1)
    elif kind == 'spear':
        cone('socket', (0, 0, 1.74), .058, .043, .22, trim, root)
        head = lump('point', (0, 0, 1.98), (.092, .051, .25), steel, root)
        head.rotation_euler.z = pi / 4
        tip = (0, 0, 2.23)
    else:
        length = .43 if kind == 'dagger' else 1.27 if kind == 'long' else 1.09
        width = .052 if kind == 'dagger' else .068
        curve = .12 if kind == 'curved' else 0
        box('crossguard', (0, 0, .15), (width * 4.1, .071, .045), trim, root, -.08)
        verts = []
        for fraction, half in ((0, width), (.51, width*.92), (.91, width*.73), (1, .001)):
            x = curve * fraction**2
            z = .18 + fraction * length
            verts.extend([(x-half, 0, z), (x, -.024, z), (x+half, 0, z), (x,.024,z)])
        faces = [(j*4+i, j*4+(i+1)%4, (j+1)*4+(i+1)%4, (j+1)*4+i)
                 for j in range(3) for i in range(4)] + [(3,2,1,0),(12,13,14,15)]
        mesh = bpy.data.meshes.new('Forged facets')
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new('forged blade', mesh)
        bpy.context.collection.objects.link(obj)
        attach(obj, 'forged blade', steel, root)
        for j, face in enumerate(mesh.polygons):
            if j % 4 in (1, 2):
                face.material_index = 1
        mesh.materials.append(trim)
        lump('pommel', (0, 0, -.16), (.065,.061,.055), trim, root)
        tip = (curve, 0, .18 + length)
    root['tipY'] = tip[2]
    empty(root.name + '_tip', tip, root)


def knight():
    reset()
    plate = mat('Hand-rubbed steel', (.27,.31,.32), .37)
    bright = mat('Filed edges', (.46,.50,.47), .31)
    dark = mat('Seams', (.042,.059,.061))
    cloth = mat('Night-blue wool', (.063,.146,.179))
    leather = mat('Brown leather', (.17,.092,.053))
    trim = mat('Dull brass', (.40,.24,.09), .26)
    body = empty('body')
    lump('breastplate', (0,0,1.38), (.287,.178,.307), plate, body, 2, .023)
    box('spine plate', (0,.109,1.43), (.295,.097,.42), bright, body)
    cone('collar', (0,0,1.63), .158,.111,.115, dark, body, 10)
    for j in range(3):
        box('lame', (.008*j, -.025, 1.152-j*.066), (.49+j*.037,.27,.086), plate, body, -.047*j)
    box('belt', (0,-.025,1.0), (.59,.28,.064), leather, body, .015)
    box('worn buckle', (.062,-.177,1.01), (.106,.031,.089), trim, body, -.12)
    helm = empty('helm')
    lump('helmet', (.007,-.008,1.872), (.151,.144,.226), plate, helm, 2, .017)
    box('eye slit', (0,-.139,1.901), (.234,.028,.039), dark, helm)
    box('visor brow', (.008,-.151,1.939), (.242,.047,.037), bright, helm, -.025)
    box('cheek plate', (-.002,-.134,1.816), (.196,.084,.112), plate, helm, .036)
    for x in (-.069,-.023,.023,.069):
        box('vent', (x,-.177,1.81), (.013,.006,.031), dark, helm, .18)
    cape = empty('cape',(0,.116,1.56))
    for j in range(5):
        box('cloak fold', (j*.093-.191,.054+j%2*.026,-.39), (.106,.053,.81+(j%3)*.047), cloth, cape, (j-2)*.076)
    box('patched hem', (.13,.097,-.63), (.116,.014,.23), leather, cape, -.07)
    sheath = empty('sheath',(.274,.093,.98))
    sheath.rotation_euler.y = 2.9
    box('scabbard', (0,0,.274), (.099,.075,.431), leather, sheath)
    box('scabbard throat', (0,0,.149), (.11,.09,.053), trim, sheath)
    dagger = empty('dagger',(0,0,-.052),sheath)
    weapon(dagger,'dagger',bright,leather,trim)
    for side, tag in ((-1,'negative'),(1,'positive')):
        upper = empty('upper-'+tag,(side*.223,.012,1.578))
        fore = empty('forearm-'+tag,(side*.118,.018,-.28),upper)
        hand = empty('hand-'+tag,(side*.105,-.084,-.246),fore)
        rod('padded upper arm',(0,0,0),fore.location,.079,.062,cloth,upper)
        lump('pauldron',(side*.035,-.009,-.049),(.137,.13,.141),plate,upper,2,.027)
        box('pauldron lip',(side*.082,-.009,-.157),(.122,.191,.083),bright,upper,side*.18)
        rod('sleeve',(0,0,0),hand.location,.065,.054,cloth,fore)
        rod('vambrace',(side*.017,-.025,-.053), hand.location*.92+Vector((side*.018,-.018,0)),.082,.046,plate,fore)
        lump('elbow cup',(.003,.015,-.008),(.088,.079,.083),plate,fore,1)
        lump('closed gauntlet',(side*.009,-.04,-.055),(.066,.072,.083),leather,hand,2,.02)
        box('knuckle plate',(side*.016,-.083,-.057),(.112,.048,.078),bright,hand,side*.1)
        grip = empty('sword-grip' if side < 0 else 'shield-grip',(side*.008,-.060,-.07),hand)
        if side < 0:
            grip.rotation_euler.x = .52
            sword = empty('sword',parent=grip)
            weapon(sword,'long',bright,leather,trim)
        else:
            shield = empty('shield',parent=grip)
            vertices=[(-.26,-.07,.26),(.237,-.07,.247),(.197,-.096,-.139),(.013,-.099,-.43),(-.167,-.08,-.157)]
            mesh=bpy.data.meshes.new('Shield face')
            mesh.from_pydata(vertices + [(0,-.14,.026)], [], [(i,(i+1)%5,5) for i in range(5)])
            obj=bpy.data.objects.new('Kite shield',mesh)
            bpy.context.collection.objects.link(obj)
            attach(obj, 'Kite shield', cloth, shield)
            for j in range(5):
                a,b=vertices[j],vertices[(j+1)%5]
                rod('rolled rim', a,b,.016,.016,trim,shield)
            lump('boss',(.007,-.16,.045),(.088,.056,.091),plate,shield,2,.04)
            rod('grip', (0,0,-.108),(0,0,.106), .026,.026,leather,shield)
        leg=empty('leg-'+tag,(side*.166,0,.915))
        rod('padded leg',(0,0,-.04),(side*.022,.018,-.79),.107,.069,cloth,leg)
        lump('knee cup',(side*.025,-.062,-.42),(.103,.085,.112),plate,leg,2,.04)
        rod('greave',(side*.021,-.039,-.49),(side*.029,-.014,-.807),.079,.064,plate,leg)
        box('boot',(side*.029,-.038,-.855),(.171,.29,.119),plate,leg,side*.04)
    save('knight')


def weapons():
    reset()
    wood=mat('Worn grip',(.15,.084,.045))
    brass=mat('Edged brass',(.55,.36,.17),.26)
    for name, form, rgb in (
        ('bronze-sword','short',(.48,.26,.14)),('iron-axe','axe',(.38,.42,.42)),
        ('steel-longsword','long',(.39,.44,.45)),('plasma-blade','short',(.30,.66,.59)),
        ('knight-dagger','dagger',(.46,.45,.34)),('stone-club','club',(.37,.36,.285)),
        ('ash-spear','spear',(.42,.38,.28)),('redcanopy-blade','curved',(.60,.41,.27)),
        ('pulse-mace','mace',(.26,.66,.61)),
    ):
        root=empty('weapon_'+name.replace('-','_'))
        empty(root.name+'_grip',parent=root)
        weapon(root,form,mat(name,rgb,.30),wood,brass)
    save('weapons')


def normalized(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj=bpy.context.object
    obj.name=name
    low=[min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    high=[max(v.co[i] for v in obj.data.vertices) for i in range(3)]
    for v in obj.data.vertices:
        for i in range(3):
            base = low[i] if i == 2 else (low[i]+high[i])/2
            v.co[i]=(v.co[i]-base)/max(.001,high[i]-low[i])
    attr = obj.data.color_attributes.new(name='Brush', type='BYTE_COLOR', domain='CORNER')
    for face in obj.data.polygons:
        shade=rng.uniform(.78,1.0) * (.76+.24*max(0,face.normal.z))
        for j in face.loop_indices:
            attr.data[j].color=(shade,shade*.979,shade*.941,1)
    obj.data.color_attributes.active_color=attr
    return obj


def map_kit(eras=False):
    reset()
    stone=mat('Chalk',(.74,.72,.67))
    shade=mat('Mortar',(.50,.49,.46))
    bark=mat('Bark',(.66,.61,.52))
    grass=mat('Grass',(.72,.75,.62))
    leaf=mat('Foliage',(.75,.75,.65))
    if not eras:
        for name in ('oak','pine','fir'):
            parts=[rod('trunk',(0,0,0),(.077,-.034,.78),.077,.029,bark)]
            for j in range(4):
                if name=='oak':
                    parts.append(lump('canopy',(.22*cos(j*1.8),.20*sin(j*1.8),.73+.066*j),(.34,.30,.25),leaf,detail=2))
                else:
                    parts.append(cone('canopy',(.024*j,-.01*j,.42+j*.19),.38-j*.076,.015,.36,leaf,sides=7))
            normalized(name,parts)
        for name,height in (('boulder',.43),('slab',.22)):
            normalized(name,[lump('stone',(.08,-.016,height*.74),(.48,.37,height),stone,detail=2,rough=.18)])
        normalized('grass',[rod('blade',(.10*cos(i),.10*sin(i),0),(.19*cos(i),.19*sin(i),.21+rng.uniform(0,.23)),.049,.002,grass) for i in range(8)])
        normalized('bush',[lump('shoot',(.22*cos(i*1.9),.25*sin(i*1.9),.24+i*.035),(.28,.25,.29),grass,detail=2) for i in range(4)])
        for name, width, depth, height in (('castleTower',1,1,2.42),('castleWall',2.4,.48,1.29)):
            parts=[box('foundation',(0,0,.13),(width+.11,depth+.09,.26),shade),
                   box('field masonry',(0,0,height*.46),(width,depth,height*.88),stone),
                   box('coping',(0,0,height*.89),(width+.1,depth+.12,.14),shade)]
            for j in range(5):
                x=(j/4-.5)*width*.83
                parts.append(box('merlon',(x,.10,height*.99),(.165*width,depth*.56,.23),stone,None,rng.uniform(-.07,.07)))
            for j in range(9):
                parts.append(box('dressed stone',(rng.uniform(-.4,.4)*width,-depth*.503,rng.uniform(.2,.78)*height),
                                 (.21*width,.035,.085),shade,angle=rng.uniform(-.10,.10)))
            normalized(name,parts)
        parts=[]
        for side in (-1,1):
            for j in range(5):
                x=side*(.06+j*.10)
                parts.append(box('split shingles',(x,0,.55-j*.08),(.164,1.05,.073),stone,angle=side*.64))
        normalized('cottageRoof',parts)
        save('map-kit')
        return

    for name in ('flintwake_standing_a','flintwake_bone_a','sunscar_hut_a','redcanopy_stall_a','frostfall_lookout_a',
                 'ashline_wreck_a','glassreach_pylon_a','ironwood_banner_a','ironwood_fire_a','ironwood_bridge_a'):
        parts=[]
        if name=='ironwood_bridge_a':
            for j in range(10):
                parts.append(box('plank', (0,j*.21,.16+rng.uniform(-.012,.012)),(1,.206,.13),bark,angle=rng.uniform(-.02,.02)))
            for side in (-1,1):
                parts.append(box('rail',(side*.45,.96,.49),(.087,2.1,.079),shade))
                for j in (0,1,2):
                    parts.append(box('post',(side*.45,j*.94,.29),(.13,.13,.60),bark))
        elif name=='ironwood_fire_a':
            for j in range(7):
                a=j*pi*2/7
                parts.append(lump('fire ring',(.32*cos(a),.32*sin(a),.11),(.134,.12,.11),stone))
            for a in (.32,1.58,2.74):
                parts.append(rod('charred split',(-.26*cos(a),-.26*sin(a),.05),(.26*cos(a),.26*sin(a),.13),.052,.041,bark))
        elif name=='ashline_wreck_a':
            parts=[box('body',(0,0,.29),(1.01,.53,.25),stone,angle=-.12),box('roof',(.12,0,.5),(.47,.48,.23),shade,angle=.11)]
            for x in (-.31,.32):
                for y in (-.24,.24):
                    parts.append(lump('wheel',(x,y,.131),(.147,.092,.142),shade,detail=2))
        elif name=='glassreach_pylon_a':
            parts=[box('ballast',(0,0,.07),(.38,.4,.14),shade),
                   rod('frame',(0,0,.13),(.109,0,.89),.094,.034,stone),
                   lump('lens',(.11,0,.93),(.14,.102,.22),grass)]
        elif name=='flintwake_standing_a':
            parts=[lump('standing stone',(side*.29,0,.43+side*.05),(.17,.18,.54),stone,detail=2) for side in (-1,1)]
            parts.append(box('fallen lintel',(.022,.047,.92),(.73,.31,.22),shade,angle=.14))
        elif name in ('ironwood_banner_a','flintwake_bone_a'):
            parts=[rod('pole',(.04,0,0),(-.025,.024,.97),.041,.027,bark),
                   rod('crossbar',(-.43,.03,.87),(.41,0,.84),.027,.021,bark)]
            for j in range(4):
                parts.append(box('hanging panel',(j*.161-.24,-.027,.664-j*.021),(.17,.043,.34+j*.019),grass if 'banner' in name else stone,angle=.12-j*.08))
        else:
            width=1.04
            parts=[box('base',(0,0,.10),(width,.76,.20),shade)]
            for x in (-.42,.42):
                for y in (-.28,.28):
                    parts.append(rod('upright',(x,y,.1),(x*.91,y,.84),.044,.032,bark))
            parts.append(box('overhang',(.032,0,.851),(1.21,.92,.096),stone,angle=.06))
            for side in (-1,1):
                parts.append(box('eave',(side*.30,0,.933),(.66,.92,.112),grass,angle=side*.29))
            parts.append(box('workbench',(.09,.12,.51),(.91,.53,.083),bark,angle=.01))
        normalized(name,parts)
        if name not in ('ironwood_bridge_a', 'ironwood_fire_a', 'ironwood_banner_a'):
            collider = box(name+'_collider',(0,0,.5),(.86,.84,.98),None,bevel=False)
            collider.display_type='WIRE'
            collider.hide_render=True
    save('era-props')

def camera(scene, position, target, width, resolution):
    data = bpy.data.cameras.new('Orthographic camera')
    data.type = 'ORTHO'
    data.ortho_scale = width
    obj = bpy.data.objects.new('Camera', data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.camera = obj
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False


def ink(name, rgba):
    result = mat(name,rgba)
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (*rgba,1)
    shader.inputs['Emission Strength'].default_value = .72
    return result


def ui():
    reset()
    scene = bpy.context.scene
    scene.name = 'dusk'
    scene.view_settings.view_transform = 'AgX'
    sky = ink('Smoked amber',(.19,.073,.025))
    box('sky',(0,4,4),(19,.08,11),sky,bevel=False)
    sun = cone('ember', (2.8,3.4,4.4), .98,.98,.025,ink('Ember',(.88,.34,.07)),sides=48)
    sun.rotation_euler.x = pi/2
    for index, shade in enumerate(((.29,.122,.055),(.17,.081,.043),(.090,.052,.035),(.038,.029,.022))):
        y = 2.5 - index * 1.75
        coords = [(x, y, .7 + rng.uniform(.72,2.68) - index*.319 + .19*cos(x)) for x in range(-10,11)]
        verts = coords + [(10, y,-3),(-10,y,-3)]
        mesh = bpy.data.meshes.new('Cut paper')
        mesh.from_pydata(verts,[],[tuple(reversed(range(len(verts))))])
        obj=bpy.data.objects.new('Ridgeline',mesh)
        scene.collection.objects.link(obj)
        attach(obj,'Ridgeline',ink('Burnt paper '+str(index),shade))
    for x in (-6.2,-5.1,2.5,4.7,5.1,6.5):
        cone('tree silhouette',(x,-3.7,.73+abs(x)*.04),.21,.001,1.27,ink('Pine cutout',(.026,.023,.017)),sides=5)
    camera(scene,(0,-15,3.8),(0,0,2.75),14,(1000,600))
    cover=scene.copy()
    cover.name='cover'
    camera(cover,(2.6,-14,3.9),(1.0,0,2.47),10.4,(1000,620))

    with bpy.data.libraries.load(str(SOURCE/'knight.blend'), link=False) as (source,dest):
        dest.objects=source.objects
    portrait=bpy.data.scenes.new('knight-portrait')
    for obj in dest.objects:
        if obj and obj.type in ('EMPTY','MESH'):
            portrait.collection.objects.link(obj)
    camera(portrait,(3,-7.6,2.6),(0,0,1.17),2.64,(540,640))
    portrait.render.film_transparent=True
    for name, loc, power, tint in (('Window',(3,-4,5),380,(1,.81,.59)),('Bounce',(-4,-1,3),210,(.71,.88,1))):
        data=bpy.data.lights.new(name,'AREA')
        data.energy=power
        data.color=tint
        data.shape='DISK'
        data.size=5
        light=bpy.data.objects.new(name,data)
        portrait.collection.objects.link(light)
        light.location=loc
        light.rotation_euler=(Vector((0,0,1.2))-light.location).to_track_quat('-Z','Y').to_euler()

    paper = bpy.data.scenes.new('parchment')
    bpy.context.window.scene = paper
    paint = ink('Pulp',(.62,.44,.225))
    nodes=paint.node_tree.nodes
    noise=nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value=130
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.37,.22,.11,1)
    ramp.color_ramp.elements[1].color=(.78,.60,.35,1)
    paint.node_tree.links.new(noise.outputs['Fac'],ramp.inputs[0])
    paint.node_tree.links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Emission Color'])
    box('paper',(0,0,0),(3,.05,3),paint,bevel=False)
    camera(paper,(0,-4,0),(0,0,0),2.4,(384,384))

    icons=bpy.data.scenes.new('seal-icons')
    bpy.context.window.scene=icons
    icons.render.film_transparent=True
    red=ink('Wax',(.31,.071,.032))
    gold=ink('Stamped ink',(.81,.47,.17))
    paths=[
        [(-.16,-.16),(.15,.15),(.18,.13),(-.11,-.19)],
        [(-.17,.17),(.17,.17),(.132,-.064),(0,-.18),(-.14,-.061),(-.17,.17)],
        [(-.16,.078),(-.045,.17),(.021,.095),(-.046,.016),(-.16,.078),(.17,-.14),(.134,-.081)],
        [(-.13,-.18),(-.13,.19),(.16,.125),(.105,.008),(-.13,.058)],
        [(0,.19),(.057,.028),(.17,.0),(.050,-.058),(0,-.185),(-.056,-.058),(-.17,0),(-.059,.039),(0,.19)],
    ]
    for index, path in enumerate(paths):
        x=index*.62-1.24
        seal=cone('Wax seal',(x,0,0),.254,.23,.049,red,sides=19)
        seal.rotation_euler.x=pi/2
        for a,b in zip(path,path[1:]):
            rod('engraving',(x+a[0],-.033,a[1]),(x+b[0],-.033,b[1]),.017,.017,gold)
    camera(icons,(0,-5,0),(0,0,0),3.10,(640,128))
    bpy.context.window.scene=scene
    save('ui-art')


if __name__ == '__main__':
    knight()
    weapons()
    map_kit()
    map_kit(eras=True)
    ui()
