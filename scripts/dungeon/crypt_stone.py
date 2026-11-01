"""Fractured masonry and shallow chipped paving, in the crypt kit's metre space."""
import bmesh
import math
from mathutils import Matrix


def block(name, p, size, mat, bevel, turn, shade, kit, rng):
    mesh=kit.bpy.data.meshes.new(name)
    bm=bmesh.new()
    bmesh.ops.create_cube(bm,size=1)
    for v in bm.verts:
        v.co.x*=size[0];v.co.y*=size[2];v.co.z*=size[1]
    if rng.random()<.7:
        corner=rng.choice([v for v in bm.verts if v.co.y<0])
        bmesh.ops.bevel(bm,geom=[corner],offset=min(.055,min(size)*.2),segments=1,affect='VERTICES')
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel*.35,.014,min(size)*.2),segments=1,affect='EDGES')
    bm.normal_update()
    # Relief on the visible face and coping, with eroded edges in the same mesh.
    faces=[f for f in bm.faces if f.normal.y<-.9 or f.normal.z>.9]
    edges=list({e for f in faces for e in f.edges})
    bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
    bm.normal_update()
    depth=min(.024,min(size)*.12)
    for v in bm.verts:
        if v.co.y<0 or v.co.z>0:
            v.co-=v.normal*rng.uniform(.001,depth)
        # Millimetre authoring precision preserves chips and keeps the shared kit compact.
        for axis in range(3):v.co[axis]=round(v.co[axis],3)
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if name in ['course','footing','sill','cap','crown','corner.pier','pilaster','patch','tablet','inset','relief','arch.pier','arch.moulding','niche.threshold','niche.shelf']:
        # These faces are buried in the supporting wall or footing.
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.y>.5 or f.normal.z<-.5],context='FACES')
    bm.to_mesh(mesh);bm.free();mesh.update()
    o=kit.bpy.data.objects.new(name,mesh);kit.bpy.context.collection.objects.link(o)
    o.matrix_world=Matrix.Translation(kit.pos(p)) @ Matrix.Rotation(-turn,4,'Z')
    kit.finish(o,mat,shade)
    for uv in o.data.uv_layers.active.data:
        uv.uv=(round(uv.uv.x,3),round(uv.uv.y,3))
    return o


def slab(poly, kit, rng, shade=None):
    # Independently chipped perimeter segments avoid the smooth Voronoi-cell outline.
    ring=[]
    cx=sum(x for x,z in poly)/len(poly);cz=sum(z for x,z in poly)/len(poly)
    for a,b in zip(poly,poly[1:]+poly[:1]):
        length=math.sqrt((b[0]-a[0])**2+(b[1]-a[1])**2)
        count=max(1,round(length/.16))
        for i in range(count):
            t=i/count;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
            inset=rng.uniform(.005,.025)
            dx,dz=cx-x,cz-z;distance=math.sqrt(dx*dx+dz*dz)
            ring.append((x+dx*inset/distance,z+dz*inset/distance))
    n=len(ring)
    verts=[(x,-.027,z) for x,z in ring]
    verts += [(x,rng.uniform(-.009,-.005),z) for x,z in ring]
    # A broken surface is shallow enough to remain cosmetic over the flat collider.
    verts += [(cx+(x-cx)*.85,rng.uniform(-.004,.008),cz+(z-cz)*.85) for x,z in ring]
    verts += [(cx,rng.uniform(-.003,.007),cz)]
    faces=[tuple(reversed(range(n)))]
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,n+j,n+i),(n+i,n+j,2*n+j,2*n+i),(2*n+i,2*n+j,3*n)])
    return kit.mesh_object('paving.eroded',verts,faces,'floor',shade if shade is not None else rng.uniform(.65,1))


def arch_stone(name,verts,faces,mat,shade,kit,rng):
    mesh=kit.bpy.data.meshes.new(name)
    mesh.from_pydata([kit.pos(p) for p in verts],[],faces)
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.018,segments=1,affect='EDGES')
    bm.normal_update()
    for v in bm.verts:
        v.co-=v.normal*rng.uniform(.001,.008)
        for axis in range(3):v.co[axis]=round(v.co[axis],3)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free();mesh.update()
    o=kit.bpy.data.objects.new(name,mesh);kit.bpy.context.collection.objects.link(o)
    return kit.finish(o,mat,shade)
