"""Original assets, Blender 4.5. Metres, Z up, facing -Y. No third-party geometry."""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/character-lab'; SOURCE=ROOT/'assets/character-lab'
OUT.mkdir(parents=True,exist_ok=True); SOURCE.mkdir(parents=True,exist_ok=True)

def material(name,color,metal=0,rough=.65):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def bind(o,mat,bone=None,weights=None):
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    if bone:weights=[{bone:1} for v in o.data.vertices]
    for key in set(k for w in weights for k in w):
        g=o.vertex_groups.new(name=key)
        for i,w in enumerate(weights):
            if w.get(key,0):g.add([i],w[key],'REPLACE')
    o.modifiers.new('Shared anatomy','ARMATURE').object=rig;o.parent=rig
    return o

def mesh(name,verts,faces,mat,bone=None,weights=None):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
    return bind(o,mat,bone,weights)

def loft(name,rings,mat,bones,n=20):
    verts=[];weights=[]
    for i,(x,y,z,w,d) in enumerate(rings):
        for j in range(n):
            a=j*2*math.pi/n;verts.append((x+w*math.cos(a),y+d*math.sin(a),z))
            weights.append(bones[i] if isinstance(bones,list) else {bones:1})
    faces=[]
    for i in range(len(rings)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))])
    return mesh(name,verts,faces,mat,weights=weights)

def orb(name,pos,scale,mat,bone,segments=16,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return bind(o,mat,bone)

def tube(name,points,radius,mat,bone,n=8):
    verts=[]
    for i,p in enumerate(points):
        p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        t.normalize();ref=Vector((0,1,0)) if abs(t.y)<.95 else Vector((1,0,0))
        u=t.cross(ref).normalized();v=t.cross(u);r=radius[i] if isinstance(radius,list) else radius
        for j in range(n):verts.append(p+r*(u*math.cos(j*2*math.pi/n)+v*math.sin(j*2*math.pi/n)))
    faces=[]
    for i in range(len(points)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    faces.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))])
    return mesh(name,verts,faces,mat,bone)

def box(name,pos,scale,mat,bone,bevel=.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Crafted edges','BEVEL');mod.width=bevel;mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return bind(o,mat,bone)

def character(kind):
    global rig
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    # Exporter must see only this character's actions.
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    female=kind=='rogue';h=1.73 if female else 1.88;hip=.92 if female else 1.0
    shoulder=1.40 if female else 1.53;sx=.205 if female else .255;wx=.30 if female else .355
    neck=shoulder+.075;hz=h-.135
    skin=material('Warm skin',(.53,.29,.19) if female else (.64,.39,.255),rough=.78)
    dark=material('Feature shadow',(.16,.063,.04));lip=material('Lips',(.37,.12,.105))
    white=material('Warm ivory',(.81,.80,.68));iris=material('Iris',(.15,.31,.24) if female else (.28,.19,.07))
    pupil=material('Pupil',(.012,.016,.013));hair=material('Auburn' if female else 'Dark hair',(.18,.058,.026) if female else (.075,.04,.025))
    hairlight=material('Hair ridges',(.28,.10,.045) if female else (.125,.071,.036))
    cloth=material('Petrol linen' if female else 'Oxblood linen',(.075,.21,.21) if female else (.28,.07,.055))
    pants=material('Charcoal trousers',(.055,.067,.072));leather=material('Oiled leather',(.12,.068,.039))
    edge=material('Leather edging',(.27,.15,.068));steel=material('Tempered blue steel',(.24,.32,.36),.78,.31)
    trim=material('Antique brass',(.52,.33,.12),.72,.35);sole=material('Dark sole',(.025,.023,.021))
    blade=material('Honed steel',(.63,.71,.73),.86,.22);wood=material('Yew',(.28,.12,.045));string=material('Bow linen',(.65,.57,.40))
    bones={'root':((0,0,0),(0,0,.2),None),'pelvis':((0,0,hip-.12),(0,0,hip+.07),'root'),
      'chest':((0,0,hip+.07),(0,0,shoulder),'pelvis'),'neck':((0,0,shoulder),(0,0,neck+.025),'chest'),
      'head':((0,0,neck+.025),(0,0,h),'neck')}
    for s,sign in [('R',-1),('L',1)]:
        sh=(sign*sx,0,shoulder-.035);el=(sign*(sx+.07),-.01,shoulder-.30);wr=(sign*wx,-.028,shoulder-.56)
        knee=.49 if female else .53
        bones.update({f'upper.{s}':(sh,el,'chest'),f'fore.{s}':(el,wr,f'upper.{s}'),
          f'hand.{s}':(wr,(sign*wx,-.028,shoulder-.68),f'fore.{s}'),
          f'thigh.{s}':((sign*.095,0,hip),(sign*.10,-.005,knee),'pelvis'),
          f'shin.{s}':((sign*.10,-.005,knee),(sign*.105,0,.12),f'thigh.{s}'),
          f'foot.{s}':((sign*.105,0,.12),(sign*.105,-.17,.07),f'shin.{s}')})
    data=bpy.data.armatures.new('Workshop human skeleton');rig=bpy.data.objects.new('Character',data)
    bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name,(a,b,parent) in bones.items():
        eb=data.edit_bones.new(name);eb.head=a;eb.tail=b
        if parent:eb.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    waist=.125 if female else .165;chest=.192 if female else .225
    tunic=loft('base__tunic',[(0,0,hip-.15,.233 if female else .246,.153),(0,0,hip-.03,.211 if female else .223,.144),
      (0,0,hip+.12,waist,.096),(0,-.005,shoulder-.22,chest*.92,.118),(0,-.006,shoulder-.10,chest,.127 if female else .14),
      (0,0,shoulder-.025,sx*.96,.10),(0,0,shoulder+.017,.07,.066)],cloth,
      [{'pelvis':1},{'pelvis':1},{'pelvis':.4,'chest':.6},{'chest':1},{'chest':1},{'chest':1},{'chest':1}],24)
    # The tunic skirt follows both thighs, rather than leaving them to pierce a rigid hem.
    for s in ['L','R']:tunic.vertex_groups.new(name=f'thigh.{s}')
    for i in range(48):
        j=i%24;left=(math.cos(j*2*math.pi/24)+1)/2;amount=.96 if i<24 else .35
        tunic.vertex_groups['pelvis'].add([i],1-amount,'REPLACE')
        tunic.vertex_groups['thigh.L'].add([i],amount*left,'REPLACE')
        tunic.vertex_groups['thigh.R'].add([i],amount*(1-left),'REPLACE')
    loft('base__neck',[(0,0,shoulder,.065,.060),(0,0,neck+.065,.056,.054)],skin,'neck')
    loft('base__collar',[(0,0,shoulder+.012,.076,.072),(0,0,shoulder+.055,.071,.067)],leather,'chest')
    tube('base__placket',[(0,-.143,shoulder-.11),(0,-.12,shoulder-.27),(0,-.105,hip+.12)],.012,leather,'chest')
    for z,y in [(shoulder-.12,-.15),(shoulder-.18,-.138),(shoulder-.24,-.13)]:orb('base__button',(0,y,z),(.009,.005,.009),trim,'chest')
    loft('base__belt',[(0,0,hip+.02,.192 if female else .214,.139),(0,0,hip+.075,.162 if female else .194,.122)],leather,'pelvis',24)
    box('base__buckle',(0,-.127,hip+.048),(.065,.018,.053),trim,'pelvis')
    box('base__buckle_inset',(0,-.138,hip+.048),(.039,.009,.029),leather,'pelvis',.002)
    box('base__pouch',(.21,.025,hip-.028),(.088,.07,.135),leather,'pelvis',.02)
    box('base__pouch_flap',(.21,-.014,hip+.013),(.093,.016,.06),edge,'pelvis')
    for s,sign in [('R',-1),('L',1)]:
        sh,el,_=bones[f'upper.{s}'];_,wr,_=bones[f'fore.{s}'];knee=bones[f'shin.{s}'][0][2]
        orb('base__shoulder_gusset_'+s,sh,(.085,.085,.082) if female else (.099,.094,.09),cloth,'chest')
        loft('base__sleeve_'+s,[(*sh,.080 if female else .096,.081),(sign*(sx+.035),-.004,shoulder-.15,.068 if female else .079,.071),
          (*el,.051 if female else .062,.056),(sign*(wx-.012),-.02,shoulder-.44,.047 if female else .054,.05),(*wr,.036,.039)],cloth,
          [{'chest':.85,f'upper.{s}':.15},{f'upper.{s}':1},{f'upper.{s}':.5,f'fore.{s}':.5},{f'fore.{s}':1},{f'fore.{s}':1}])
        loft('base__cuff_'+s,[(wr[0],wr[1],wr[2]+.04,.043,.045),(wr[0],wr[1],wr[2]-.004,.040,.043)],leather,f'fore.{s}')
        hand=f'hand.{s}';cx,cy,cz=wr[0],wr[1],wr[2]-.045
        orb('base__palm_'+s,(cx,cy,cz),(.040,.026,.060),skin,hand)
        for j in range(4):
            fx=cx+(j-1.5)*.018;tube('base__finger_'+s+str(j),[(fx,cy,cz-.026),(fx,cy-.023,cz-.059),(fx,cy-.043,cz-.044)],[.010,.009,.008],skin,hand)
        tube('base__thumb_'+s,[(cx-sign*.027,cy,cz+.006),(cx-sign*.043,cy-.027,cz-.015),(cx-sign*.019,cy-.047,cz-.026)],[.014,.013,.010],skin,hand)
        x=sign*.10
        # Omit the always-covered proximal trouser region, so it cannot poke through the skirt.
        loft('base__trousers_'+s,[(x,0,hip-.19,.085,.09),
          (x,-.005,knee+.06,.063,.067),(x,-.005,knee,.06,.065),(x,.005,knee-.13,.066,.066),(x,0,.19,.042,.045),(x,0,.10,.039,.042)],pants,
          [{f'thigh.{s}':1},{f'thigh.{s}':1},{f'thigh.{s}':.5,f'shin.{s}':.5},{f'shin.{s}':1},{f'shin.{s}':1},{f'shin.{s}':1}])
        foot=f'foot.{s}';orb('bare__foot_'+s,(x,-.056,.066),(.052,.116,.053),skin,foot)
        for j in range(5):orb('bare__toe_'+s+str(j),(x+sign*(.036-j*.017),-.153+j*.004,.04),(.012,.028-j*.002,.023),skin,foot,12,8)
        loft('boots__shaft_'+s,[(x,0,.10,.060,.067),(x,0,.24,.061,.067),(x,0,.37,.077,.075)],leather,f'shin.{s}')
        loft('boots__rim_'+s,[(x,0,.348,.081,.080),(x,0,.382,.081,.080)],edge,f'shin.{s}')
        orb('boots__toe_'+s,(x,-.064,.073),(.064,.137,.063),leather,foot)
        box('boots__sole_'+s,(x,-.062,.023),(.132,.27,.038),sole,foot,.018)
        for z in [.16,.23,.30]:
            tube('boots__lace_'+s,[(x-.028,-.061,z-.018),(x+.028,-.074,z+.018)],.004,string,f'shin.{s}')
            tube('boots__lace_cross_'+s,[(x+.028,-.061,z-.018),(x-.028,-.074,z+.018)],.004,string,f'shin.{s}')
        orb('armour__pauldron_'+s,(sign*(sx+.012),0,shoulder-.048),(.106 if female else .126,.12,.085),steel,f'upper.{s}')
        tube('armour__pauldron_rim_'+s,[(sign*(sx+.01)+(.104 if female else .124)*math.cos(j*math.pi/12),.112*math.sin(j*math.pi/12),shoulder-.055) for j in range(25)],.009,trim,f'upper.{s}')
        loft('armour__vambrace_'+s,[(wr[0],wr[1],wr[2]+.018,.046,.049),(sign*(wx-.015),-.02,shoulder-.41,.058,.063)],steel,f'fore.{s}')
        orb('armour__kneecap_'+s,(x,-.061,knee),(.075,.044,.081),steel,f'shin.{s}')
    loft('armour__cuirass',[(0,0,hip+.09,waist+.027,.12),(0,-.01,shoulder-.23,chest+.003,.14),
      (0,-.012,shoulder-.11,chest+.015,.156),(0,0,shoulder-.035,sx*.92,.119),(0,0,shoulder+.009,.094,.08)],steel,'chest',24)
    tube('armour__keel',[(0,-.128,hip+.09),(0,-.16,shoulder-.23),(0,-.179,shoulder-.11),(0,-.128,shoulder-.035)],.008,trim,'chest')
    for sign in [-1,1]:
        tube('armour__edge',[(sign*.088,-.04,shoulder+.008),(sign*(chest-.005),-.09,shoulder-.065),(sign*(waist+.02),-.065,hip+.10)],.007,trim,'chest')
        for j in range(3):box('armour__tasset',(sign*.095,-.158,hip-.015-j*.055),(.133,.033,.061),steel,'thigh.L' if sign>0 else 'thigh.R')
    orb('armour__sun',(0,-.175,shoulder-.145),(.027,.006,.027),trim,'chest')
    for j in range(8):
        a=j*math.pi/4;tube('armour__sunray',[(.032*math.cos(a),-.171,shoulder-.145+.032*math.sin(a)),(.047*math.cos(a),-.163,shoulder-.145+.047*math.sin(a))],.003,trim,'chest')
    width=.083 if female else .094
    loft('base__face',[(0,-.006,hz-.112,.037,.041),(0,-.007,hz-.085,width*.77,.067),(0,0,hz-.045,width*.97,.078),
      (0,.003,hz+.004,width,.079),(0,.005,hz+.052,width*.95,.078),(0,.008,hz+.093,width*.80,.069),(0,.012,hz+.12,width*.41,.041),(0,.012,hz+.125,.005,.005)],skin,'head',24)
    for sign in [-1,1]:
        orb('base__ear',(sign*(width+.005),.003,hz-.012),(.018,.018,.036),skin,'head')
        orb('base__ear_inset',(sign*(width+.012),-.011,hz-.013),(.009,.006,.022),dark,'head')
        ex=sign*.035;ez=hz+.006
        orb('base__eye_socket',(ex,-.073,ez),(.026,.012,.015),dark,'head')
        orb('base__eye',(ex,-.081,ez),(.022,.008,.010),white,'head')
        orb('base__iris',(ex,-.088,ez),(.009,.003,.009),iris,'head')
        orb('base__pupil',(ex,-.091,ez),(.004,.0015,.006),pupil,'head')
        orb('base__catchlight',(ex-.003,-.093,ez+.003),(.002,.001,.002),white,'head',8,6)
        tube('base__brow',[(ex-sign*.025,-.083,ez+.021),(ex,-.089,ez+.027),(ex+sign*.024,-.075,ez+.022)],[.006,.008,.0035],hair,'head')
        tube('base__lower_lid',[(ex-.022,-.083,ez),(ex,-.087,ez-.011),(ex+.022,-.079,ez)],.003,skin,'head')
    mesh('base__nose',[(-.011,-.073,hz+.032),(.011,-.073,hz+.032),(-.015,-.078,hz-.038),(.015,-.078,hz-.038),(-.009,-.107,hz-.026),(.009,-.107,hz-.026),(0,-.113,hz-.032)],
      [(0,1,5,4),(0,4,2),(1,3,5),(2,4,6),(4,5,6),(5,3,6),(2,6,3)],skin,'head')
    tube('base__upper_lip',[(-.024,-.077,hz-.058),(-.009,-.087,hz-.054),(0,-.086,hz-.057),(.009,-.087,hz-.054),(.024,-.077,hz-.058)],.004,lip,'head')
    tube('base__lower_lip',[(-.021,-.078,hz-.061),(0,-.087,hz-.065),(.021,-.078,hz-.061)],.0045,lip,'head')
    verts=[];faces=[];N=32
    for level in range(7):
        for j in range(N):
            a=j*2*math.pi/N;bottom=hz+(.039 if math.sin(a)<-.2 else -.032);z=bottom+(hz+.133-bottom)*level/6
            r=math.sqrt(max(.005,1-((z-hz-.008)/.13)**2));verts.append(((width+.008)*r*math.cos(a),.014+.089*r*math.sin(a),z))
    for i in range(6):
        for j in range(N):a=i*N+j;b=i*N+(j+1)%N;faces.append((a,b,b+N,a+N))
    faces.append(tuple(6*N+j for j in range(N)));mesh('base__hair_cap',verts,faces,hair,'head')
    for j in range(8):
        x=-width*.8+j*width*.2;tube('base__swept_lock',[(x,-.065,hz+.055),(x+.025,-.061,hz+.103),(x+.035,-.005,hz+.134),(x+.018,.06,hz+.087)],[.013,.017,.013,.004],hairlight if j%3==0 else hair,'head')
    if female:
        orb('base__hair_tie',(0,.107,hz+.025),(.035,.02,.035),trim,'head')
        for j in range(5):tube('base__ponytail',[(0,.112,hz+.035),(.025,.16,hz-.005),(.035+.006*j,.15,hz-.13),(.015,.12,hz-.26)],[.032,.035,.026,.004],hair if j%2 else hairlight,'head')
    else:
        for sign in [-1,1]:tube('base__sideburn',[(sign*.087,-.005,hz+.016),(sign*.084,-.008,hz-.058)],[.013,.008],hair,'head')
        # Short, angular beard gives the fighter a separate facial silhouette.
        loft('base__beard',[(0,-.012,hz-.117,.036,.043),(0,-.008,hz-.091,.073,.066),
          (0,-.002,hz-.074,.086,.074)],hair,'head',20)
        for sign in [-1,1]:
            tube('base__beard_cheek',[(sign*.088,-.027,hz-.042),(sign*.067,-.059,hz-.069),(sign*.042,-.068,hz-.088)], [.009,.012,.014],hair,'head')
            tube('base__moustache',[(sign*.004,-.09,hz-.048),(sign*.016,-.086,hz-.050),(sign*.025,-.08,hz-.056)],[.004,.006,.003],hair,'head')
    x,y,z=Vector(bones['hand.R'][0])+Vector((0,-.056,-.072));hand='hand.R'
    tube('sword__grip',[(x,y-.065,z),(x,y+.065,z)],.019,leather,hand,12)
    for j in range(7):tube('sword__binding',[(x+.020*math.cos(k*math.pi/8),y-.058+j*.017,z+.020*math.sin(k*math.pi/8)) for k in range(17)],.0025,trim,hand)
    orb('sword__pommel',(x,y+.085,z),(.026,.025,.026),trim,hand)
    tube('sword__crossguard',[(x-.125,y-.085,z+.012),(x,y-.075,z),(x+.125,y-.085,z+.012)],[.012,.016,.012],trim,hand)
    mesh('sword__blade',[(x-.035,y-.09,z),(x,y-.09,z+.009),(x+.035,y-.09,z),(x,y-.09,z-.009),(x-.022,y-.70,z),(x,y-.70,z+.006),(x+.022,y-.70,z),(x,y-.70,z-.006),(x,y-.84,z)],
      [(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4)],blade,hand)
    gx,gy,gz=Vector(bones['hand.L'][0])+Vector((0,-.055,-.055))
    outline=[(-.205,.23),(.205,.23),(.22,.10),(.17,-.13),(0,-.30),(-.17,-.13),(-.22,.10)]
    vs=[(gx+a,gy-.052,gz+b) for a,b in outline]+[(gx,gy-.095,gz+.005)]
    mesh('shield__face',vs,[(j,(j+1)%7,7) for j in range(7)],steel,'hand.L')
    tube('shield__rim',vs[:7]+vs[:1],.012,trim,'hand.L');box('shield__grip',(gx,gy,gz),(.025,.027,.15),leather,'hand.L')
    for dx in [-.12,.12]:tube('shield__rivet_line',[(gx+dx,gy-.07,gz+.18),(gx+dx*.45,gy-.087,gz-.13)],.007,trim,'hand.L')
    orb('shield__boss',(gx,gy-.10,gz+.01),(.052,.028,.052),trim,'hand.L')
    pts=[(gx,gy+.065,gz-.66),(gx,gy-.065,gz-.57),(gx,gy-.14,gz-.35),(gx,gy-.04,gz-.13),(gx,gy,gz),(gx,gy-.04,gz+.13),(gx,gy-.14,gz+.35),(gx,gy-.065,gz+.57),(gx,gy+.065,gz+.66)]
    tube('bow__limbs',pts,[.009,.012,.022,.024,.021,.024,.022,.012,.009],wood,'hand.L',12)
    tube('bow__string',[pts[0],(gx,gy+.065,gz),pts[-1]],.0018,string,'hand.L')
    tube('bow__grip',[(gx,gy,gz-.065),(gx,gy,gz+.065)],.025,leather,'hand.L',12)
    # Recompute outward normals for both descending sleeve lofts and ascending body lofts.
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    bpy.context.view_layer.update()
    def orient(name,head,tail):
        rest=data.bones[name];delta=(rest.tail_local-rest.head_local).rotation_difference(Vector(tail)-Vector(head))
        rig.pose.bones[name].matrix=Matrix.Translation(Vector(head))@delta.to_matrix().to_4x4()@rest.matrix_local.to_3x3().to_4x4()
        bpy.context.view_layer.update()
    def arm(s,target):
        sh=Vector(bones[f'upper.{s}'][0]);el=Vector(bones[f'upper.{s}'][1]);wr=Vector(bones[f'fore.{s}'][1]);t=Vector(target)
        a=(el-sh).length;b=(wr-el).length
        sh=rig.pose.bones['chest'].matrix@data.bones['chest'].matrix_local.inverted()@sh
        v=t-sh;d=min(v.length,a+b-.008);u=v.normalized();t=sh+u*d
        mid=(a*a-b*b+d*d)/(2*d);height=math.sqrt(max(0,a*a-mid*mid))
        hint=Vector((1 if s=='L' else -1,.7,-.35));perp=(hint-u*hint.dot(u)).normalized();e=sh+u*mid+perp*height
        orient(f'upper.{s}',sh,e);orient(f'fore.{s}',e,t);orient(f'hand.{s}',t,t+Vector((0,0,-.12)))
        return t
    for pose in ['inspection','ready-empty','ready-sword','ready-shield','ready-sword-shield','ready-bow','raised','crouched']:
        rig.animation_data_clear()
        for pb in rig.pose.bones:pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        if pose.startswith('ready'):
            right=arm('R',(-.28,-.23,shoulder-.37));arm('L',(.27,-.22,shoulder-.34))
            if pose in ['ready-sword','ready-sword-shield']:orient('hand.R',right,right+Vector((0,-.109,-.050)))
            if pose=='ready-bow':arm('L',(.08,-.32,shoulder-.20));arm('R',(.08,-.255,shoulder-.18))
        if pose=='raised':arm('L',(.30,-.15,shoulder+.31));arm('R',(-.30,-.15,shoulder+.31))
        if pose=='crouched':
            rig.pose.bones['pelvis'].location.y=-.17
            bpy.context.view_layer.update()
            for s in ['L','R']:
                start=Vector(bones[f'thigh.{s}'][0])+Vector((0,0,-.17));ankle=Vector(bones[f'shin.{s}'][1])
                a=(Vector(bones[f'thigh.{s}'][1])-Vector(bones[f'thigh.{s}'][0])).length
                b=(Vector(bones[f'shin.{s}'][1])-Vector(bones[f'shin.{s}'][0])).length
                axis=(ankle-start).normalized();d=(ankle-start).length;mid=(a*a-b*b+d*d)/(2*d)
                bend=Vector((0,-1,0));bend=(bend-axis*bend.dot(axis)).normalized()
                knee=start+axis*mid+bend*math.sqrt(max(0,a*a-mid*mid))
                orient(f'thigh.{s}',start,knee);orient(f'shin.{s}',knee,ankle)
                orient(f'foot.{s}',ankle,Vector(bones[f'foot.{s}'][1]))
            arm('L',(.28,-.22,shoulder-.52));arm('R',(-.28,-.22,shoulder-.52))
        for pb in rig.pose.bones:
            for frame in [1,2]:
                pb.keyframe_insert('location',frame=frame,group=pb.name)
                pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode=='QUATERNION' else 'rotation_euler',frame=frame,group=pb.name)
                pb.keyframe_insert('scale',frame=frame,group=pb.name)
        action=rig.animation_data.action;action.name=pose;action.use_fake_user=True
    rig.animation_data_clear()
    for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
    rig.animation_data_create()
    rig.animation_data.action=bpy.data.actions['inspection']
    rig.animation_data.action_slot=bpy.data.actions['inspection'].slots[0]
    bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=2
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{kind}.blend'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{kind}.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True,export_optimize_animation_size=False)
    return {'id':kind,'heightM':h,'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),'vertices':sum(len(o.data.vertices) for o in bpy.context.scene.objects if o.type=='MESH')}

stats=[character(k) for k in ['fighter','rogue']]
(OUT/'manifest.json').write_text(json.dumps({'generator':'scripts/character-lab/build.py','characters':stats},indent=2)+'\n')
print('CHARACTER_LAB_COMPLETE',stats)
