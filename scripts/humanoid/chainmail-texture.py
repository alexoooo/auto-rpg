"""Deterministic seamless steel-link maps. No external image dependency or downloaded art."""
import math, struct, zlib
from pathlib import Path

SIZE = 128
output = Path(__file__).parents[2] / 'public/assets/humanoid'

def height(x, y):
    best = 0
    for row in range(-1, 3):
        for col in range(-1, 3):
            dx = (x / SIZE - col - (row % 2) * .5) / .43
            dy = (y / SIZE - row * .5) / .29
            radius = math.hypot(dx, dy)
            link = max(0, 1 - abs(radius - 1) / .16)
            best = max(best, math.sqrt(link) * (.8 + .2 * math.cos(dx * 2)))
    return best

def png(name, pixels):
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    raw = b''.join(b'\0'+bytes(pixels[y*SIZE*3:(y+1)*SIZE*3]) for y in range(SIZE))
    (output/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',SIZE,SIZE,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

colour, normal, roughness = [], [], []
for y in range(SIZE):
    for x in range(SIZE):
        h = height(x,y)
        value = int(35 + h * 115)
        colour.extend([value, min(255,value+4), min(255,value+7)])
        dx = (height((x+1)%SIZE,y)-height((x-1)%SIZE,y))*2
        dy = (height(x,(y+1)%SIZE)-height(x,(y-1)%SIZE))*2
        n = math.sqrt(dx*dx+dy*dy+1)
        normal.extend([int(127.5*(1-dx/n)),int(127.5*(1-dy/n)),int(127.5*(1+1/n))])
        roughness.extend([int(170-60*h)]*3)
png('chainmail-color.png', colour)
png('chainmail-normal.png', normal)
png('chainmail-roughness.png', roughness)
