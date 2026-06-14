import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { DT } from '../src/sim/types';
import { generateDecorations, isVisibleTreeDecoration } from '../src/sim/world';

const SEED = 20061;
const keyOf = (x: number, z: number): string => `${Math.round(x * 10)}:${Math.round(z * 10)}`;

describe('tree harvesting', () => {
  it('only exposes tree positions that the renderer actually draws', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true });
    const visibleKeys = new Set(generateDecorations(SEED).filter(isVisibleTreeDecoration).map((d) => keyOf(d.x, d.z)));
    const logicalKeys = new Set(sim.harvestableTrees.map((t) => t.key));

    expect(logicalKeys.size).toBeGreaterThan(0);
    expect(logicalKeys).toEqual(visibleKeys);
  });

  it('respawns chopped trees so they can become visible and harvestable again', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior' });
    const p = sim.player;
    const tree = sim.harvestableTrees[0];
    p.pos.x = tree.x;
    p.pos.z = tree.z - 1;
    p.prevPos = { ...p.pos };

    expect(sim.chopNearestTree(p.id)).toBe(true);
    for (let i = 0; i < Math.ceil(6 / DT); i++) sim.tick();
    expect(sim.choppedTrees.has(tree.key)).toBe(true);

    for (let i = 0; i < Math.ceil(181 / DT); i++) sim.tick();
    expect(sim.choppedTrees.has(tree.key)).toBe(false);
    expect(sim.chopNearestTree(p.id)).toBe(true);
  });
});
