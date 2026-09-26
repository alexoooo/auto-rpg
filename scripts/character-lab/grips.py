"""Hand-sized geometry built around a grasp, not a weapon placed through a fist.

Bind world: fingers lie in Y rows, palm runs down Z. Palm faces +X on R, -X on L.
All dimensions are metres. Closed fingers wrap the Y-axis cylindrical grip.
The same hand and item frames are then transformed together by the wrist bone.
"""
import math
import bpy
from mathutils import Vector

GRIP_RADIUS = .014
GRIP_OFFSET = .034
GRIP_DOWN = .074
STRING_BACK = .16

def build_hands(bones, skin, nail, mesh, loft, tube, orb):
    for side, sign in [('R', 1), ('L', -1)]:
        wrist=Vector(bones[f'hand.{side}'][0]); bone=f'hand.{side}'
        for form in (['open', 'power', 'hook'] if side=='R' else ['open', 'power']):
            prefix=f'hand{side}_{form}__'
            def p(x,y,z):return tuple(wrist+Vector((sign*x,y,z)))
            # Flattened palm, tapered wrist, and metacarpal spread. No handle occupies its volume.
            loft(prefix+'palm',[(*p(0,0,.008),.028,.034),(*p(-.003,0,-.016),.024,.035),
                (*p(-.004,0,-.044),.022,.039),(*p(-.003,0,-.071),.020,.039),
                (*p(.002,.002,-.089),.015,.032)],skin,bone,24)
            orb(prefix+'thenar',p(.007,-.029,-.038),(.015,.018,.026),skin,bone,24,14)
            radius=GRIP_RADIUS if form=='power' else .0018
            for i,(y,finger_r) in enumerate([(-.030,.0086),(-.010,.009),(.010,.0086),(.029,.0075)]):
                if form=='open':
                    length=[.065,.073,.068,.053][i]
                    points=[p(.001,y,-.080),p(.004,y,-.098),p(.009,y,-.080-length*.68),p(.015,y,-.080-length)]
                    radii=[finger_r*1.10,finger_r,finger_r*.9,finger_r*.60]
                else:
                    # Distal phalanges oppose the palm. The inner wall is tangent to the grip.
                    # Hook is a relaxed four-finger string hold, not a drawn archery release.
                    r=radius+finger_r
                    points=[p(.001,y,-.079),p(.007,y,-.092)]
                    radii=[finger_r*1.15,finger_r*1.1]
                    for j in range(25):
                        a=math.radians(-120+250*j/24)
                        points.append(p(GRIP_OFFSET+r*math.cos(a),y,-GRIP_DOWN+r*math.sin(a)))
                        radii.append(finger_r)
                    points.append(p(GRIP_OFFSET+r*math.cos(math.radians(138)),y,-GRIP_DOWN+r*math.sin(math.radians(138))))
                    radii.append(finger_r*.7)
                obj=tube(prefix+f'finger_{i}',points,radii,skin,bone,16)
                # Store only semantic identification, not an asserted contact result.
                obj['digit']=i;obj['grasp']=form
                if form=='open':
                    orb(prefix+f'nail_{i}',p(.006,y,-.080-[.065,.073,.068,.053][i]+.007),(.003,.0055,.007),nail,bone,12,8)
            if form=='power':
                # Thumb opposes the index side of the handle, clear of guard and fingers.
                thumb=[p(.003,-.038,-.019),p(.018,-.054,-.035),p(.035,-.055,-.046),p(.053,-.051,-.056)]
                radii=[.013,.012,.011,.0095]
            elif form=='hook':
                thumb=[p(.003,-.038,-.023),p(.017,-.051,-.039),p(.020,-.052,-.063)]
                radii=[.013,.011,.009]
            else:
                thumb=[p(.003,-.035,-.020),p(.024,-.053,-.038),p(.033,-.056,-.064)]
                radii=[.013,.011,.008]
            tube(prefix+'thumb',thumb,radii,skin,bone,16)

def build_equipment(bones, mats, mesh, tube, orb, box):
    leather,steel,trim,blade,wood,string=mats
    right=Vector(bones['hand.R'][0]);x,y,z=right+Vector((GRIP_OFFSET,0,-GRIP_DOWN))
    hand='hand.R'
    grip=tube('sword__grip',[(x,y-.063,z),(x,y+.064,z)],GRIP_RADIUS,leather,hand,48)
    grip['grip']='power';grip['radiusM']=GRIP_RADIUS
    # Low-profile leather seam sits within the grip envelope, not through the fingers.
    pts=[]
    for j in range(481):
        a=j*2*math.pi/32;pts.append((x+.0136*math.cos(a),y-.062+j*.126/480,z+.0136*math.sin(a)))
    tube('sword__wrap',pts,.0004,trim,hand,6)
    orb('sword__pommel',(x,y+.081,z),(.023,.020,.023),trim,hand,24,12)
    tube('sword__crossguard',[(x-.115,y-.079,z+.006),(x,y-.074,z),(x+.115,y-.079,z+.006)],[.010,.014,.010],trim,hand,16)
    mesh('sword__blade',[(x-.028,y-.091,z),(x,y-.091,z+.004),(x+.028,y-.091,z),(x,y-.091,z-.004),
      (x-.018,y-.70,z),(x,y-.70,z+.003),(x+.018,y-.70,z),(x,y-.70,z-.003),(x,y-.84,z)],
      [(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4)],blade,hand)
    left=Vector(bones['hand.L'][0]);gx,gy,gz=left+Vector((-GRIP_OFFSET,0,-GRIP_DOWN))
    # Centre-gripped shield. In bind space the board lies in YZ; wrist rotation faces it forward.
    outline=[(-.205,.23),(.205,.23),(.22,.10),(.17,-.13),(0,-.30),(-.17,-.13),(-.22,.10)]
    front=[(gx-.083,gy+a,gz+b) for a,b in outline]
    rear=[(gx-.062,gy+a,gz+b) for a,b in outline]
    verts=front+rear+[(gx-.103,gy,gz+.005),(gx-.076,gy,gz+.005)]
    faces=[]
    for j in range(7):
        k=(j+1)%7;faces.extend([(j,k,14),(7+k,7+j,15),(j,7+j,7+k,k)])
    mesh('shield__board',verts,faces,steel,'hand.L')
    tube('shield__rim',front+front[:1],.010,trim,'hand.L',12)
    tube('shield__grip',[(gx,gy-.073,gz),(gx,gy+.073,gz)],GRIP_RADIUS,leather,'hand.L',48)
    for end in [-.073,.073]:
        tube('shield__handle_mount',[(gx-.070,gy+end,gz),(gx-.039,gy+end,gz),(gx,gy+end,gz)],.011,steel,'hand.L',16)
        orb('shield__rear_rivet',(gx-.060,gy+end,gz),(.008,.014,.014),trim,'hand.L')
    # Leather retention strap over the back of the hand, fixed to the grip's two feet.
    pts=[(gx,gy-.068,gz),(gx+.046,gy-.058,gz),(gx+.061,gy-.035,gz),
         (gx+.064,gy,gz),(gx+.061,gy+.035,gz),(gx+.046,gy+.058,gz),(gx,gy+.068,gz)]
    vertices=[]
    for i,p in enumerate(pts):
        tangent=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)]);tangent.normalize()
        normal=Vector((tangent.y,-tangent.x,0))
        for side,width in [(-1,-1),(1,-1),(1,1),(-1,1)]:vertices.append(Vector(p)+normal*.0018*side+Vector((0,0,width*.010)))
    faces=[(0,3,2,1),(24,25,26,27)]
    for i in range(6):
        for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    mesh('shield__hand_strap',vertices,faces,leather,'hand.L')
    orb('shield__boss',(gx-.110,gy,gz+.01),(.023,.049,.049),trim,'hand.L',24,12)
    for dy in [-.12,.12]:tube('shield__inlay',[(gx-.095,gy+dy,gz+.17),(gx-.097,gy+dy*.45,gz-.13)],.005,trim,'hand.L')
    # Bow grip shares the power grasp. Wrist orientation makes its local Y shaft upright.
    offsets=[(.16,-.66),(.035,-.57),(-.04,-.35),(-.01,-.13),(0,0),(-.01,.13),(-.04,.35),(.035,.57),(.16,.66)]
    pts=[(gx+dx,gy+along,gz) for dx,along in offsets]
    tube('bow__limbs',pts,[.008,.011,.018,.017,.013,.017,.018,.011,.008],wood,'hand.L',16)
    tube('bow__grip',[(gx,gy-.060,gz),(gx,gy+.060,gz)],GRIP_RADIUS,leather,'hand.L',48)
    tube('bow__string',[(gx+STRING_BACK,gy-.66,gz),(gx+STRING_BACK,gy+.66,gz)],.0018,string,'hand.L',12)
