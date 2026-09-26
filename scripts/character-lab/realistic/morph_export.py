"""Bind portable morph channels to the matching rig clip after glTF action export."""
import json,struct,math
def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def add_morph_animation(path):
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
 def accessor(values):
  while len(blob)%4:blob.append(0)
  offset=len(blob);blob.extend(struct.pack('<'+'f'*len(values),*values));view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4})
  index=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5126,'count':len(values),'type':'SCALAR','min':[min(values)],'max':[max(values)]});return index
 times=[i/30 for i in range(361)];timeindex=accessor(times)
 for clip in doc['animations']:
  active=clip['name']=='loop-bow'
  for prefix in ['bow__stave','bow__string','bow__arrow']:
   node=next(i for i,n in enumerate(doc['nodes']) if n.get('name','').split('.')[0]==prefix)
   vals=[]
   for t in times:
    pull=smooth((t-3.65)/.8)*(1-smooth((t-4.8)/.12))
    vals.append(((smooth((t-4.8)/.3) if t>=4.8 else -.30/7*pull) if prefix=='bow__arrow' else pull) if active else 0)
   output=accessor(vals);sampler=len(clip['samplers']);clip['samplers'].append({'input':timeindex,'output':output,'interpolation':'LINEAR'});clip['channels'].append({'sampler':sampler,'target':{'node':node,'path':'weights'}})
 doc['buffers'][0]['byteLength']=len(blob);data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(data)+len(blob))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(blob),0x004e4942)+blob)
