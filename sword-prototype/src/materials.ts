import textureRegistry from "../asset-src/textures.json" with { type: "json" };

export type TextureChannel = "albedo" | "normal" | "orm";
export type TangentBasis = "babylon-lh" | "gltf-rh-imported";

export interface TextureDescriptor {
  url: string;
  channel: TextureChannel;
  colourSpace: "srgb" | "linear";
  invertY: boolean;
  scale: number;
  /** Physical span represented by one image repeat, for room-scale surfaces. */
  metresPerRepeat?: number;
  normalConvention?: "opengl";
  tangentBasis?: TangentBasis;
}

export interface SurfaceDescriptor {
  name: string;
  albedo: readonly [number, number, number];
  metallic: number;
  roughness: number;
  /** Less than one only for explicitly non-solid visual scrims. */
  opacity?: number;
  textures: Partial<Record<TextureChannel, TextureDescriptor>>;
}

interface RegistryRow {
  name: string;
  file: string;
  localUrl: string;
  channel: string;
  colourSpace: string;
  consumers: string[];
  scale: number;
  invertY: boolean;
  normalConvention?: string;
  tangentBasis?: string;
  metresPerRepeat?: number;
}

interface RuntimeRegistry { textures: RegistryRow[] }

const BASE = {
  "palette.ground": { name: "ground", albedo: [0.15, 0.14, 0.12], metallic: 0, roughness: 0.96 },
  "figure.steel": { name: "figureSteel", albedo: [0.62, 0.65, 0.70], metallic: 1, roughness: 0.22 },
  "figure.leather": { name: "figureLeather", albedo: [0.16, 0.11, 0.08], metallic: 0, roughness: 0.78 },
  // The decoded Terlenka albedo is deliberately near-neutral. `Figure` derives
  // this surface and supplies only the team tint; the image carries weave, not
  // a second opinion about whether the fighter is crimson or blue.
  "figure.cloth": { name: "figureCloth", albedo: [0.72, 0.68, 0.58], metallic: 0, roughness: 0.92 },
  "figure.flesh": { name: "figureFlesh", albedo: [0.68, 0.48, 0.38], metallic: 0, roughness: 0.68 },
  "weapon.steel": { name: "weaponSteel", albedo: [0.62, 0.65, 0.70], metallic: 1, roughness: 0.24 },
  "weapon.brass": { name: "weaponBrass", albedo: [0.72, 0.50, 0.16], metallic: 1, roughness: 0.30 },
  "weapon.leather": { name: "weaponLeather", albedo: [0.18, 0.11, 0.065], metallic: 0, roughness: 0.76 },
  "weapon.wood": { name: "weaponWood", albedo: [0.34, 0.20, 0.09], metallic: 0, roughness: 0.72 },
  "weapon.paintedWood": { name: "paintedShieldBoard", albedo: [0.34, 0.08, 0.065], metallic: 0, roughness: 0.66 },
  "room.wall": { name: "roomWall", albedo: [0.20, 0.19, 0.17], metallic: 0, roughness: 0.94, opacity: 0.22 },
  "room.timber": { name: "roomTimber", albedo: [0.20, 0.12, 0.065], metallic: 0, roughness: 0.88 },
  // Banners are deliberately quieter than either side's surcoat. The image
  // carries weave and checks, but the room never gets the fighters' saturation.
  "room.banner": { name: "roomBanner", albedo: [0.25, 0.19, 0.16], metallic: 0, roughness: 0.96 },
} as const;

export type TexturedSurfaceName = (typeof BASE)[keyof typeof BASE]["name"];

/** Convert the provenance registry into the runtime's only map descriptors. */
export function buildTexturedSurfaces(registry: RuntimeRegistry): Record<TexturedSurfaceName, SurfaceDescriptor> {
  const surfaces = Object.fromEntries(Object.entries(BASE).map(([, base]) => [
    base.name,
    { ...base, textures: {} },
  ])) as Record<TexturedSurfaceName, SurfaceDescriptor>;
  const used = new Set<string>();
  const physicalSpans = new Map<string, number>();

  for (const row of registry.textures) {
    if (row.localUrl !== `/assets/textures/${row.file}`) throw new Error(`${row.name} local URL does not name ${row.file}`);
    if (!new Set<TextureChannel>(["albedo", "normal", "orm"]).has(row.channel as TextureChannel)) {
      throw new Error(`${row.name} has unsupported runtime channel ${row.channel}`);
    }
    if (!new Set(["srgb", "linear"]).has(row.colourSpace)) throw new Error(`${row.name} has unsupported runtime colour space`);
    for (const consumer of row.consumers) {
      const base = BASE[consumer as keyof typeof BASE];
      if (!base) throw new Error(`${row.name} names unknown runtime consumer ${consumer}`);
      const channel = row.channel as TextureChannel;
      const surface = surfaces[base.name];
      if (row.metresPerRepeat !== undefined) {
        const knownSpan = physicalSpans.get(consumer);
        if (knownSpan !== undefined && knownSpan !== row.metresPerRepeat) {
          throw new Error(`${consumer} disagrees about its physical metre-repeat contract`);
        }
        physicalSpans.set(consumer, row.metresPerRepeat);
      }
      if (surface.textures[channel]) throw new Error(`${consumer} has two ${channel} maps`);
      if (channel === "normal" && (row.normalConvention !== "opengl" || !new Set<TangentBasis>(["babylon-lh", "gltf-rh-imported"]).has(row.tangentBasis as TangentBasis))) {
        throw new Error(`${row.name} has no supported normal convention and tangent basis`);
      }
      surface.textures[channel] = {
        url: row.localUrl,
        channel,
        colourSpace: row.colourSpace as "srgb" | "linear",
        invertY: row.invertY,
        scale: row.scale,
        ...(row.metresPerRepeat === undefined ? {} : { metresPerRepeat: row.metresPerRepeat }),
        ...(channel === "normal" ? {
          normalConvention: row.normalConvention as "opengl",
          tangentBasis: row.tangentBasis as TangentBasis,
        } : {}),
      };
      used.add(consumer);
    }
  }
  for (const consumer of Object.keys(BASE)) {
    if (!used.has(consumer)) throw new Error(`${consumer} has no registry-backed runtime texture`);
  }
  return surfaces;
}

export const TEXTURED_SURFACES = buildTexturedSurfaces(textureRegistry);

export function surfaceMetresPerRepeat(surface: SurfaceDescriptor): number {
  const spans = Object.values(surface.textures).map((texture) => texture?.metresPerRepeat);
  if (spans.length === 0 || spans.some((span) => !(span && span > 0))) {
    throw new Error(`${surface.name} has no complete physical metre-repeat contract`);
  }
  const first = spans[0] as number;
  if (spans.some((span) => span !== first)) throw new Error(`${surface.name} has inconsistent physical repeats`);
  return first;
}

/** Registry-derived values; room geometry has no second copy of these numbers. */
export const ROOM_METRES = Object.freeze({
  floor: surfaceMetresPerRepeat(TEXTURED_SURFACES.ground),
  wall: surfaceMetresPerRepeat(TEXTURED_SURFACES.roomWall),
  timber: surfaceMetresPerRepeat(TEXTURED_SURFACES.roomTimber),
  banner: surfaceMetresPerRepeat(TEXTURED_SURFACES.roomBanner),
});

/** Scalar/tint variants borrow maps from the named primary object surface. */
export const OBJECT_SURFACE_VARIANTS = {
  edge: { name: "weaponEdge", albedo: [0.92, 0.95, 1.0], metallic: 1, roughness: 0.12, textures: {} },
  bowString: { name: "bowString", albedo: [0.78, 0.70, 0.46], metallic: 0, roughness: 0.92, textures: {} },
} as const satisfies Record<string, SurfaceDescriptor>;
