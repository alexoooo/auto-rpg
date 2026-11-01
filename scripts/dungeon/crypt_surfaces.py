"""Periodic, unlit material maps for the modular crypt. Built by build-kit.py."""
import hashlib
import bpy
import numpy as np


def build_surfaces(folder):
    # At the room camera this resolves millimetre detail within a 1.35 m repeat.
    rng = np.random.default_rng(161803)

    # A single stone's interior supplies the registered CC0 scan's mineral detail.
    # Mirror its edges to tile without importing a second set of paving joints.
    scans={}
    for channel,suffix in [('albedo','diff'),('normal','nor_gl'),('orm','arm')]:
        scan_file=folder.parent/f'textures/large_floor_tiles_02_{suffix}_1k.jpg'
        scan_image=bpy.data.images.load(str(scan_file),check_existing=False)
        if channel!='albedo':scan_image.colorspace_settings.name='Non-Color'
        scan=np.array(scan_image.pixels[:],dtype=np.float32).reshape(1024,1024,4)[720:1008,20:308,:3]
        mirrored=scan[:,::-1].copy()
        if channel=='normal':mirrored[:,:,0]=1-mirrored[:,:,0]
        scan=np.concatenate([scan,mirrored],axis=1)
        mirrored=scan[::-1].copy()
        if channel=='normal':mirrored[:,:,1]=1-mirrored[:,:,1]
        scans[channel]=np.concatenate([scan,mirrored],axis=0)
        bpy.data.images.remove(scan_image)

    def noise(cells):
        grid = rng.random((cells, cells))
        p = np.arange(size) * cells / size
        i = p.astype(int)
        t = p - i
        t = t * t * (3 - 2 * t)
        a = grid[i[:, None] % cells, i[None, :] % cells]
        b = grid[i[:, None] % cells, (i[None, :] + 1) % cells]
        c = grid[(i[:, None] + 1) % cells, i[None, :] % cells]
        d = grid[(i[:, None] + 1) % cells, (i[None, :] + 1) % cells]
        return (a * (1-t) + b*t) * (1-t[:, None]) + (c*(1-t) + d*t)*t[:, None]

    def save(name, rgb, data):
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[:, :, :3] = np.clip(rgb, 0, 1)
        image = bpy.data.images.new(name, width=size, height=size, alpha=False)
        image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
        image.pixels.foreach_set(pixels.ravel())
        image.filepath_raw = str(folder / name)
        image.file_format = 'PNG'
        image.save()
        bpy.data.images.remove(image)

    for family in ['floor', 'wall', 'trim', 'cloth']:
        size = {'floor':512, 'wall':384, 'trim':256, 'cloth':128}[family]
        y, x = np.mgrid[:size, :size] / size
        broad, medium, fine = noise(5), noise(37), noise(173)
        grain = rng.random((size, size))
        if family == 'cloth':
            warp = np.sin(x * np.pi * size / 2)
            weft = np.sin(y * np.pi * size / 2)
            height = .012 * warp * weft + .008 * fine
            tone = .62 + .13 * broad + .12 * medium + .07 * warp * weft
            rgb = np.stack([tone, tone, tone], axis=-1)
            roughness = .87 + fine * .12
            ao = .9 + .1 * fine
        else:
            # Periodic cell edges form fine mineral fractures within each mesh stone,
            # independent of the paving joints and the wall's masonry courses.
            nearest = np.full((size, size), 10.)
            second = nearest.copy()
            for sx, sy in rng.random((48, 2)):
                dx = np.minimum(abs(x-sx), 1-abs(x-sx))
                dy = np.minimum(abs(y-sy), 1-abs(y-sy))
                distance = dx*dx + dy*dy
                second = np.minimum(second, np.maximum(nearest, distance))
                nearest = np.minimum(nearest, distance)
            fissure = np.exp(-(second-nearest) * 4300)
            pores = np.clip((fine-.65)*3, 0, 1)
            strata = np.sin((y*18 + .13*np.sin(x*np.pi*8) + medium*.13)*np.pi*2)
            height = .055*medium + .025*fine + .005*grain - .018*pores
            height += (.009 if family == 'floor' else .016)*strata - .022*fissure
            tone = .38 + .13*broad + .12*medium + .055*fine + .025*grain
            tone -= .10*fissure + .06*pores
            if family == 'floor':
                rgb = np.stack([tone*.94, tone, tone*1.04], axis=-1)
                roughness = .47 + .23*medium + .12*pores
            elif family == 'wall':
                rgb = np.stack([tone*1.04, tone, tone*.91], axis=-1)
                roughness = .70 + .20*medium
            else:
                rgb = np.stack([tone*1.13, tone*1.06, tone*.93], axis=-1)
                roughness = .62 + .23*medium
            sample=lambda channel:scans[channel][(y*576).astype(int),(x*576).astype(int)]
            rgb=rgb*.22+sample('albedo')*.78
            ao = np.clip(1-.20*fissure-.20*pores, .6, 1)*sample('orm')[:,:,0]
            roughness*=.75+.25*sample('orm')[:,:,1]
        dx = (np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))*size*9/1024
        dy = (np.roll(height, -1, axis=0)-np.roll(height, 1, axis=0))*size*9/1024
        normal = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
        if family!='cloth':normal[:,:,:2]+=(sample('normal')[:,:,:2]*2-1)*.75
        normal /= np.linalg.norm(normal, axis=-1)[:, :, None]
        save(f'{family}-albedo.png', rgb, False)
        save(f'{family}-normal.png', normal*.5+.5, True)
        save(f'{family}-orm.png', np.stack([ao, roughness, np.zeros_like(ao)], axis=-1), True)
    return [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(folder.glob('*.png'))]
