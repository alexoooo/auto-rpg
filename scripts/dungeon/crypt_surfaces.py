"""Material maps for fractured stone and woven banners; built by build-kit.py."""
import hashlib
import bpy
import numpy as np

# The planar stone UVs span this distance in metres.
STONE_REPEAT = 1.35
# Height per unit image luminance, in metres: fine relief complements the chipped mesh.
STONE_RELIEF = .012


def build_surfaces(folder):
    image=bpy.data.images.load(str(folder/'stone-source.png'),check_existing=False)
    width,height=image.size
    colour=np.array(image.pixels[:],dtype=np.float32).reshape(height,width,4)[:,:,:3]
    bpy.data.images.remove(image)

    def resize(a,size):
        # Integrate each destination texel's source footprint before reducing resolution.
        for axis in [0,1]:
            values=np.moveaxis(a,axis,0)
            step=values.shape[0]/size
            edges=np.arange(size+1)*step
            indices=np.minimum(edges.astype(int),values.shape[0]-1)
            fraction=(edges-indices).reshape((-1,)+(1,)*(values.ndim-1))
            integral=np.concatenate([np.zeros_like(values[:1]),np.cumsum(values,axis=0,dtype=np.float64)])
            samples=integral[indices]+values[indices]*fraction
            a=np.moveaxis(np.diff(samples,axis=0)/step,0,axis)
        return a

    def save(name,rgb,data):
        n=rgb.shape[0];pixels=np.ones((n,n,4),dtype=np.float32);pixels[:,:,:3]=np.clip(rgb,0,1)
        out=bpy.data.images.new(name,width=n,height=n,alpha=False)
        out.colorspace_settings.name='Non-Color' if data else 'sRGB'
        out.pixels.foreach_set(pixels.ravel());out.filepath_raw=str(folder/name);out.file_format='PNG';out.save()
        bpy.data.images.remove(out)

    colour=resize(colour,1024)
    save('floor-albedo.png',colour,False)
    detail=resize(colour,384)
    luminance=detail[:,:,0]*.2126+detail[:,:,1]*.7152+detail[:,:,2]*.0722
    # Fine fractures supply relief; broad colour variation stays out of the normals.
    ky=np.fft.fftfreq(384)[:,None];kx=np.fft.fftfreq(384)[None,:]
    blurred=np.fft.ifft2(np.fft.fft2(luminance)*np.exp(-2*np.pi*np.pi*25*(kx*kx+ky*ky))).real
    height=luminance-blurred
    pixel_metres=STONE_REPEAT/height.shape[0]
    slope=STONE_RELIEF/(2*pixel_metres)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*slope
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*slope
    normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
    save('floor-normal.png',normal*.5+.5,True)
    # Flake interiors and mineral deposits respond differently to a wet film.
    roughness=np.clip(.38+luminance*1.8,.38,.9)
    ao=np.clip(.94+height*.7,.70,1)
    save('floor-orm.png',resize(np.stack([ao,roughness,np.zeros_like(ao)],axis=-1),256),True)

    image=bpy.data.images.load(str(folder/'wood-source.png'),check_existing=False)
    width,height=image.size
    wood=np.array(image.pixels[:],dtype=np.float32).reshape(height,width,4)[:,:,:3]
    bpy.data.images.remove(image)
    save('wood-albedo.png',resize(wood,512),False)
    wood=resize(wood,256)
    grain=wood[:,:,0]*.2126+wood[:,:,1]*.7152+wood[:,:,2]*.0722
    dx=(np.roll(grain,-1,axis=1)-np.roll(grain,1,axis=1))*4
    dy=(np.roll(grain,-1,axis=0)-np.roll(grain,1,axis=0))*4
    n=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);n/=np.linalg.norm(n,axis=-1)[:,:,None]
    save('wood-normal.png',n*.5+.5,True)
    save('wood-orm.png',resize(np.stack([.85+grain*.15,.72+grain*.25,np.zeros_like(grain)],axis=-1),128),True)

    rng=np.random.default_rng(161803)
    y,x=np.mgrid[:128,:128]/128
    weave=np.sin(x*np.pi*64)*np.sin(y*np.pi*64)
    grain=rng.random((128,128))
    tone=.66+.06*weave+.06*grain
    save('cloth-albedo.png',np.stack([tone,tone,tone],axis=-1),False)
    h=weave*.04
    dx=np.roll(h,-1,axis=1)-np.roll(h,1,axis=1);dy=np.roll(h,-1,axis=0)-np.roll(h,1,axis=0)
    n=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);n/=np.linalg.norm(n,axis=-1)[:,:,None]
    save('cloth-normal.png',n*.5+.5,True)
    save('cloth-orm.png',np.stack([np.ones_like(x),.88+.10*grain,np.zeros_like(x)],axis=-1),True)
    names=[f'{family}-{channel}.png' for family in ['floor','cloth','wood'] for channel in ['albedo','normal','orm']]
    return [{'file':name,'sha256':hashlib.sha256((folder/name).read_bytes()).hexdigest()} for name in names]
