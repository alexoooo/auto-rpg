"""One timeline for skeletal poses, string flex, fingers and projectile release."""
DRAW_DISTANCE=.48
def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)

def bow_phase(t,neutral=False):
 if neutral:return dict(lift=0,draw=0,release=0,flex=0)
 lift=smooth((t-3.0)/.8)*(1-smooth((t-5.7)/.9))
 draw=smooth((t-3.8)/.7)*(1-smooth((t-5.2)/.5))
 release=smooth((t-4.8)/.12)
 return dict(lift=lift,draw=draw,release=release,flex=draw*(1-release))
