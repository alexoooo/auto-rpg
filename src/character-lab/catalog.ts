export type CharacterId = 'fighter' | 'rogue';
export type WeaponId = 'empty' | 'sword' | 'shield' | 'sword-shield' | 'bow';
export type PoseId = 'inspection' | 'ready' | 'raised' | 'crouched';
export interface Loadout { boots: boolean; armour: boolean; weapon: WeaponId }
export const CHARACTERS = {
  fighter: { name: 'The Fighter', subtitle: 'STEEL & RESOLVE', height: 1.88, asset: 'fighter.glb', defaults: { boots: true, armour: true, weapon: 'sword-shield' } },
  rogue: { name: 'The Rogue', subtitle: 'INSTINCT & INTENT', height: 1.73, asset: 'rogue.glb', defaults: { boots: true, armour: false, weapon: 'bow' } },
} as const;
export const WEAPONS: Record<WeaponId, { label: string; groups: readonly string[]; note: string }> = {
  empty: { label: 'Empty hands', groups: [], note: 'Unarmed. Both hands are free.' },
  sword: { label: 'Sword', groups: ['sword'], note: 'A steel arming sword in the right hand.' },
  shield: { label: 'Shield', groups: ['shield'], note: 'A brass-edged heater shield in the left hand.' },
  'sword-shield': { label: 'Sword & shield', groups: ['sword', 'shield'], note: 'Arming sword in the right hand. Heater shield in the left.' },
  bow: { label: 'Bow', groups: ['bow'], note: 'Low preparation hold: bow in the left hand, three-finger string hook in the right. Not drawn.' },
};
export function visiblePart(name: string, kit: Loadout): boolean {
  const group = name.split('__')[0];
  if (name.startsWith('shield__forearm_strap_')) return kit.weapon.includes('shield') && name.endsWith(kit.armour ? '_armour' : '_cloth');
  if (group.startsWith('handR_')) return group === (kit.weapon === 'bow' ? 'handR_hook' : kit.weapon.includes('sword') ? 'handR_power' : 'handR_open');
  if (group.startsWith('handL_')) return group === (kit.weapon === 'bow' || kit.weapon.includes('shield') ? 'handL_power' : 'handL_open');
  if (group === 'base') return true;
  if (group === 'bare') return !kit.boots;
  if (group === 'boots') return kit.boots;
  if (group === 'armour') return kit.armour;
  return WEAPONS[kit.weapon].groups.includes(group);
}
export const clipFor = (pose: PoseId, kit: Loadout) => `${pose}-${kit.weapon}`;
