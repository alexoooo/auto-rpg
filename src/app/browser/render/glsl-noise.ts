/**
 * **GLSL value noise on the plane**: `<name>Hash(vec2)`, a cell's pseudo-random value by its dot
 * with `weights`, and `<name>Noise(vec2)`, smoothly between the four cells' values about a point.
 * Each plugin names its own, since plugins on one material share one shader.
 */
export const valueNoise = (name: string, weights: readonly [number, number]): string => `
float ${name}Hash(vec2 p) { return fract(sin(dot(p, vec2(${weights[0]}, ${weights[1]}))) * 43758.5453); }
float ${name}Noise(vec2 p) {
  vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(${name}Hash(i), ${name}Hash(i + vec2(1.0, 0.0)), u.x), mix(${name}Hash(i + vec2(0.0, 1.0)), ${name}Hash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
