"""Original Blender sky dome and eleven packed, seamless sky paintings.

blender -b -t 2 --python-exit-code 1 -P scripts/create-sky-domes.py
The game uses the exported dome and baked WebP skies, not a live cloud shader.
"""
import bpy
import hashlib
import json
import math
import subprocess
import shutil
import tempfile
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist/assets/skies'
temporary = tempfile.TemporaryDirectory(prefix='boost-circuit-skies-')
WORK = Path(temporary.name)
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT = 1024, 512

# zenith, middle, horizon, cloud, coverage, stars, celestial, elevation, azimuth
SKIES = {
    'champions': ('#102e58','#6688a5','#edb6a1','#d1c6c6',.48,65,'sun',.18,-2.25),
    'snow': ('#497ea7','#a6cddd','#f3e9d9','#f9f4ea',.50,0,'sun',.28,-1.4),
    'city': ('#070e26','#29335c','#84627c','#4f526f',.28,420,'crescent',.54,2.1),
    'woods': ('#487e9d','#a8c6bb','#f0d2a0','#eff0d7',.38,0,'sun',.40,-.85),
    'harbour': ('#3b556e','#8d9da3','#e8cba5','#bbc2c1',.78,0,'sun',.13,-2.4),
    'festival': ('#071c36','#31566e','#a9b5bc','#829ba8',.30,600,'crescent',.58,-2.6),
    'yuletide': ('#2e355f','#a792af','#f1c5ae','#d6bfcc',.42,130,'crescent',.42,.8),
    'halloween': ('#120e29','#393458','#95848a','#706d85',.61,170,'moon',.51,-1.0),
    'coast': ('#304e80','#c68aa0','#ffcd8d','#c895a5',.40,18,'sun',.075,2.5),
    'canyon': ('#23749e','#8abbd1','#efdbb4','#f6eee0',.26,0,'sun',.66,-.6),
    'orbital': ('#01040e','#080e24','#152543','#152240',0,1800,'sun',.40,1.8),
    'skyline': ('#10243e','#5e7a9c','#e5bdad','#c7cad4',.35,180,'moon',.56,1.3),
    'range': ('#315f78','#9dbab2','#f0d8ae','#e5e9d5',.45,0,'sun',.5,-1.3),
    'velocity': ('#292a56','#a18fae','#f4bd8d','#b4a3bd',.30,60,'sun',.15,2.2),
}

def color(value):
    return np.array([int(value[n:n+2],16)/255 for n in (1,3,5)],dtype=np.float32)

def smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1)
    return t*t*(3-2*t)

def mix(a,b,t):
    return a*(1-t[...,None])+b*t[...,None]

def noise(x,y,z,seed):
    ix,iy,iz=(np.floor(p).astype(np.int64) for p in (x,y,z))
    fx,fy,fz=(p-np.floor(p) for p in (x,y,z))
    fx,fy,fz=(p*p*(3-2*p) for p in (fx,fy,fz))
    result=np.zeros_like(x,dtype=np.float32)
    for dx in (0,1):
        for dy in (0,1):
            for dz in (0,1):
                h=((ix+dx)*374761393+(iy+dy)*668265263+(iz+dz)*2147483647+seed*1013904223).astype(np.uint32)
                h=(h^(h>>13))*np.uint32(1274126177)
                h=h^(h>>16)
                weight=(fx if dx else 1-fx)*(fy if dy else 1-fy)*(fz if dz else 1-fz)
                result+=weight*(h.astype(np.float32)/4294967295)
    return result

def painting(id,index):
    top,mid,horizon,cloud,coverage,star_count,body,elevation,azimuth=SKIES[id]
    rng=np.random.default_rng(12610+index)
    u,v=np.meshgrid(np.linspace(0,1,WIDTH,dtype=np.float32),np.linspace(0,1,HEIGHT,dtype=np.float32))
    lon=(u-.5)*math.tau;lat=(v-.5)*math.pi
    x=np.cos(lat)*np.cos(lon);y=np.sin(lat);z=np.cos(lat)*np.sin(lon)
    height=np.maximum(y,0)
    image=mix(color(horizon),color(mid),smooth(0,.35,height))
    image=mix(image,color(top),smooth(.15,.93,height))
    # The lower hemisphere is gently darkened below the landscape. All noise
    # is sampled in direction space, so the UV seam and pole remain continuous.
    image=mix(image,color(horizon)*.48,smooth(.0,.7,-y)*.8)
    field=np.zeros_like(x)
    for octave,weight in enumerate([.57,.28,.15]):
        frequency=2.7*2**octave
        field+=weight*noise(x*frequency+index*3.1,y*frequency*2.0,z*frequency,100+index+octave*17)
    detail=noise(x*27,y*27,z*27,index+601)
    sun=np.array([math.cos(elevation)*math.cos(azimuth),math.sin(elevation),math.cos(elevation)*math.sin(azimuth)])
    dot=np.clip(x*sun[0]+y*sun[1]+z*sun[2],-1,1)
    angle=np.arccos(dot)
    if body=='sun':
        tint=color('#fff0c5' if id not in ('coast','champions') else '#ffca8b')
        halo=np.exp(-angle*angle/(.018 if id=='coast' else .035))
        image+=halo[...,None]*tint*(.23 if id=='harbour' else .35)
        disc=(1-smooth(.014,.021,angle))*(.45 if id=='harbour' else 1)
        image=mix(image,tint,disc)
    else:
        radius=.063 if id=='halloween' else .034
        halo=np.exp(-angle*angle/.014)
        image+=halo[...,None]*color('#b4c6e6')*.13
        right=np.cross(sun,[0,1,0]);right/=np.linalg.norm(right)
        up=np.cross(right,sun)
        mx=(x*right[0]+y*right[1]+z*right[2])/radius
        my=(x*up[0]+y*up[1]+z*up[2])/radius
        disc=1-smooth(radius*.94,radius,angle)
        surface=np.sqrt(np.maximum(0,1-mx*mx-my*my))
        craters=.78+.16*noise(x*155,y*155,z*155,901)
        moon=color('#e5e4ce')[None,None,:]*craters[...,None]*(.65+.35*surface[...,None])
        if body=='crescent':
            # An offset unlit disc cuts a clean crescent with a darkened limb.
            shadow=1-smooth(.97,1.03,np.hypot(mx-.45,my+.12))
            moon=mix(moon,image,shadow*.985)
        image=mix(image,moon,disc)
    if id=='festival':
        curtain=np.exp(-((y-(.49+.11*np.sin(lon*2.1+.6)))**2)/.0018)
        curtain*=smooth(.05,.24,y)*(0.4+0.6*np.sin(lon*3+1)**2)
        image+=curtain[...,None]*color('#6ecca9')*.30
    if id=='orbital':
        band=np.exp(-((y-.28*x-.18*z-.15)**2)/.025)
        image+=band[...,None]*(.025+field[...,None]*.08)*color('#9c8cbf')
    # Sparse, varied stellar magnitudes instead of a uniform dot grid.
    for _ in range(star_count):
        px=int(rng.integers(0,WIDTH-1));py=int(rng.integers(int(HEIGHT*.56),HEIGHT-2))
        magnitude=float(rng.choice([.18,.35,.6,.9],p=[.55,.29,.13,.03]))
        tint=color(['#cbd8f4','#f3e6cf','#d6e6f4'][int(rng.integers(0,3))])
        for dx,dy,falloff in [(0,0,1),(-1,0,.15),(1,0,.15),(0,-1,.15),(0,1,.15)]:
            image[py+dy,(px+dx)%(WIDTH-1)]+=tint*magnitude*falloff
    if coverage:
        threshold=.72-coverage*.38
        opacity=smooth(threshold,threshold+.18,field-.07*detail)*smooth(.015,.18,y)
        # Broad, flattened clouds towards the horizon; brighter edges face the
        # celestial light. No transparency layers or per-frame noise in game.
        shading=.80+.16*detail+.13*np.maximum(dot,0)
        cloud_color=color(cloud)[None,None,:]*shading[...,None]
        image=mix(image,cloud_color,np.clip(opacity*(.92 if id=='harbour' else .78),0,1))
    image=np.clip(image,0,1)
    image[:,-1]=image[:,0]
    # Generated image.save() preserves these channel values. Bake the intended
    # display palette directly; the browser marks the resulting texture sRGB.
    rgba=np.ones((HEIGHT,WIDTH,4),dtype=np.float32);rgba[:,:,:3]=image
    img=bpy.data.images.new('Sky_'+id,WIDTH,HEIGHT,alpha=False)
    img.colorspace_settings.name='sRGB';img.pixels.foreach_set(rgba.ravel());img.file_format='PNG'
    png=WORK/(id+'.png');img.filepath_raw=str(png);img.save()
    # Reload the saved sRGB painting so Blender's editable emission preview
    # interprets the same colours as the browser, then pack it into the source.
    bpy.data.images.remove(img);img=bpy.data.images.load(str(png));img.name='Sky_'+id
    img.pack();img.filepath='//Sky_'+id+'.png'
    return img

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1)
dome=bpy.context.object;dome.name='Original_Sky_Dome'
for polygon in dome.data.polygons:polygon.use_smooth=True
dome['originalArtwork']=True;dome['purpose']='Camera-centred background only; no collisions';dome['license']='MIT'
images={}
for index,id in enumerate(SKIES):
    print('Painting sky:',id,flush=True)
    img=painting(id,index);images[id]=img
    mat=bpy.data.materials.new('Sky_'+id);mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear()
    tex=nodes.new('ShaderNodeTexImage');tex.image=img
    emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(tex.outputs['Color'],emission.inputs['Color'])
    mat.node_tree.links.new(emission.outputs[0],output.inputs['Surface']);dome.data.materials.append(mat)

bpy.context.scene['sky_arenas']=','.join(SKIES)
bpy.context.scene['description']='Fourteen original packed panoramic sky paintings and the exported unit sphere. Assign a Sky material to the sphere to preview that arena.'
bpy.context.scene.world=bpy.data.worlds.new('Sky_Preview_World')
bpy.context.scene.view_settings.view_transform='Standard'
camera_data=bpy.data.cameras.new('Inside_Dome_Preview');camera_data.lens=22;camera_data.clip_start=.001;camera_data.clip_end=5
camera=bpy.data.objects.new('Inside_Dome_Preview',camera_data);bpy.context.scene.collection.objects.link(camera)
camera.rotation_euler=Vector((1,0,.3)).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=camera
bpy.context.scene.render.engine='BLENDER_EEVEE_NEXT';bpy.context.scene.render.resolution_x=1024;bpy.context.scene.render.resolution_y=512
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/sky-domes.blend'),compress=True)
# Materials/textures are provided separately by the lazy browser sky loader.
bpy.ops.object.select_all(action='DESELECT');dome.select_set(True);bpy.context.view_layer.objects.active=dome
bpy.ops.export_scene.gltf(filepath=str(OUT/'sky-dome.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_texcoords=True,export_extras=True)

# Convert the Blender paintings with a small standard image utility. Original
# packed PNGs remain inside the .blend; only compressed WebP is shipped online.
program='''from PIL import Image
from pathlib import Path
import sys
source,out=map(Path,sys.argv[1:])
for path in sorted(source.glob('*.png')):
    Image.open(path).convert('RGB').save(out/(path.stem+'.webp'),format='WEBP',quality=88,method=6)
'''
python=shutil.which('python3') or shutil.which('python')
if not python:raise RuntimeError('A Python installation with Pillow is required to encode WebP.')
subprocess.run([python,'-c',program,str(WORK),str(OUT)],check=True)
files=[]
for path in sorted(OUT.iterdir()):
    if path.suffix not in ('.glb','.webp'):continue
    data=path.read_bytes();files.append({'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
report={'originalArtwork':True,'license':'MIT','blenderVersion':bpy.app.version_string,'source':'art/sky-domes.blend','generator':'scripts/create-sky-domes.py','width':WIDTH,'height':HEIGHT,'arenas':list(SKIES),'files':files}
(OUT/'sky-domes.json').write_text(json.dumps(report,indent=2)+'\n')
print('Sky artwork exported:',sum(file['bytes'] for file in files),'bytes',flush=True)
temporary.cleanup()
