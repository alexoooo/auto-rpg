import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SoundCue } from "../audio/cues.ts";
import type { Command, DrawnRoute } from "../core/command/commands.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { BodyModel, ResolvedCharacter } from "../core/models.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { puppetBody, type Puppet } from "../render/puppet.ts";
import { bodyBetween, posePuppet, type Between, type WorldLink } from "../worker/client.ts";
import { cryptSpec, type ActorNews, type CryptCard, type CryptLead, type CryptNews } from "../worker/crypt-stage.ts";
import { BODY_HEAD } from "../worker/frame.ts";
import { CAMERA_PITCH } from "./bearing.ts";
import { DungeonCommands } from "./commands.ts";
import { cellKey, type DungeonMap, type Point } from "./map.ts";
import { actorName, type RunStatus } from "./run.ts";
import type { DungeonSurfaces } from "./stone.ts";
import { buildDungeonWorld } from "./world.ts";

/** A body of a run as its page draws it: who it is, its spec and mind as the worker built it, its puppet once built, and the latest news of it. */
export interface ViewActor {
  readonly id: string;
  readonly name: string;
  readonly model: BodyModel;
  readonly side: "party" | "enemy";
  readonly spec: BodySpec;
  readonly mind: MindConfig;
  /** Where it is in a frame (`WorldLink.offsets`). */
  readonly offset: number;
  /** What the run last said of it. */
  news: ActorNews;
  /** Its body drawn from its spec, once the run has built it; posed from the frames. */
  puppet: Puppet | null;
  /** Its centre as last drawn, world, m. */
  readonly centre: Vector3;
  /** What the page drew for it (its skin), shown while it is in sight, and picked to select or lock it. */
  readonly meshes: AbstractMesh[];
  readonly alive: boolean;
  readonly vitality: number;
  /** Where it stands on the ground: where its centre is drawn while it stands, else where the run says. */
  feet(): Point;
}

/** The person's lead of a run as `commands` and the camera hold it: the pointer only where it aims (`CryptLead`). */
export function leadOf(commands: Pick<DungeonCommands, "mode" | "cursor" | "right" | "up" | "walk">, toward: Point): CryptLead {
  const { mode, cursor, right, up, walk } = commands;
  return { mode: { ...mode }, cursor: mode.facing && cursor ? { x: cursor.x, z: cursor.z } : null, right, up, walk, toward: { x: toward.x, z: toward.z } };
}

/** Whether a frame holds a body at `offset` not yet built: its first segment at the origin, unturned (`cryptStage`). */
const unbuilt = (frame: Float64Array, offset: number): boolean => {
  const at = offset + BODY_HEAD;
  return frame[at] === 0 && frame[at + 1] === 0 && frame[at + 2] === 0 && frame[at + 6] === 1;
};

/**
 * **A Crypt run as its page holds it**, its world in a worker (`cryptStage`): the level drawn with
 * no colliders, each body a puppet from the run's first news that it is built, and what the run
 * last said (`CryptNews`): what the party has explored and sees, the doors open, the status, the
 * selection and the notice. The person's commands and selection go to the run as input; the keys,
 * the pointer's aim and the camera's bearing as the lead (`CryptLead`), sent when they change
 * (`send`), with the route the pointer draws.
 */
export class RunView {
  readonly map: DungeonMap;
  /** The level drawn: its floor, walls and doors, with no colliders. */
  readonly level: ReturnType<typeof buildDungeonWorld>;
  readonly actors: ViewActor[];
  readonly hero: ViewActor;
  /** The bodies one person orders: the hero first, then the companions. */
  readonly party: ViewActor[];
  readonly enemies: ViewActor[];
  readonly explored = new Set<number>();
  visible: ReadonlySet<number> = new Set();
  status: RunStatus = "playing";
  /** The run's clock, s. */
  clock = 0;
  /** What the party's Commander tells the person of the party's movement, or "". */
  notice = "";
  /** Which party members the person's commands go to, by id. */
  selected: ReadonlySet<string> = new Set();
  /** The mind the page looks at (`look`), as the run last said. */
  inspected: CryptNews["inspected"] = null;
  /** The air of each body the party sees, as the run last said. */
  air: CryptNews["air"] = [];
  /** Why the run's worker failed, or null while it has not. */
  fault: string | null = null;
  /** The camera's elevation and the unit step on the ground toward it, which the cut-away and the keys follow. The page sets them. */
  pitch = CAMERA_PITCH;
  toward: Point;
  /** The left button's commands, each sent to the run as it is given. */
  readonly commands = new DungeonCommands((command) => this.command(command));
  private leaderId = "hero";
  private looked: string | null = null;
  private running = false;
  private disposed = false;
  /** The lead last sent, and the route the pointer draws with what of it was last sent. */
  private sentLead: string;
  private drawn: { readonly route: DrawnRoute; sent: string } | null = null;
  private readonly link: WorldLink<CryptCard>;
  private readonly scene: Scene;
  private readonly built: (actor: ViewActor) => void;
  private readonly heard: (cue: SoundCue) => void;

  /**
   * The run `link` steps, on `map` drawn with `visuals`, its bodies' specs from `characters` and
   * minds from `mind`, its lead `lead` as the run was started with it; `built` is given each body
   * as its puppet is made, and `heard` each cue the run hears.
   */
  constructor(scene: Scene, link: WorldLink<CryptCard>, options: {
    readonly map: DungeonMap; readonly visuals: DungeonSurfaces; readonly characters: ReadonlyMap<string, ResolvedCharacter>;
    readonly mind: (card: CryptCard) => MindConfig; readonly lead: CryptLead;
    readonly built: (actor: ViewActor) => void; readonly heard: (cue: SoundCue) => void;
  }) {
    this.scene = scene; this.link = link; this.built = options.built; this.heard = options.heard;
    this.map = options.map;
    this.level = buildDungeonWorld(scene, this.map, options.visuals);
    this.commands.mode = { ...options.lead.mode };
    this.toward = { ...options.lead.toward };
    this.sentLead = JSON.stringify(options.lead);
    this.actors = link.roster.map(({ card }, k): ViewActor => {
      const actor: ViewActor = {
        id: card.id, name: actorName(card.model), model: card.model, side: card.side,
        spec: cryptSpec(options.characters.get(card.id)!, card.model), mind: options.mind(card), offset: link.offsets[k]!,
        news: { id: card.id, built: false, alive: true, limp: false, held: false, vitality: 1, feet: { x: 0, z: 0 }, target: null, task: "", forced: false, route: null },
        puppet: null, centre: new Vector3(), meshes: [],
        get alive() { return this.news.alive; }, get vitality() { return this.news.vitality; },
        feet() { return this.puppet && !this.news.limp ? { x: this.centre.x, z: this.centre.z } : this.news.feet; },
      };
      return actor;
    });
    this.hero = this.actors.find((actor) => actor.id === "hero")!;
    this.party = [this.hero, ...this.actors.filter((actor) => actor.side === "party" && actor !== this.hero)];
    this.enemies = this.actors.filter((actor) => actor.side === "enemy");
    link.listen({ news: (news) => { if (news.crypt) this.hear(news.crypt); },
      fault: (message) => { this.fault = message; console.error(`The crypt's world failed: ${message}`); } });
  }

  /** The party member the camera follows: the hero while it stands, then the first companion that does. */
  get leader(): ViewActor { return this.actors.find((actor) => actor.id === this.leaderId) ?? this.hero; }

  /** The body `actor` fights, as its team's Commander says; null when none. */
  targetOf(actor: ViewActor): ViewActor | null {
    const id = actor.news.target;
    return id === null ? null : this.actors.find((other) => other.id === id) ?? null;
  }

  /** Take the run's news: the bodies built since are drawn, each as its puppet is made. */
  private hear(news: CryptNews): void {
    if (this.disposed) return;
    this.clock = news.clock; this.status = news.status; this.notice = news.notice; this.leaderId = news.leader;
    this.selected = new Set(news.selected);
    for (const cell of news.explored) this.explored.add(cell);
    if (news.visible) this.visible = new Set(news.visible);
    this.level.opened(news.doors);
    for (const cue of news.cues) this.heard(cue);
    this.air = news.air;
    if (news.inspected !== undefined) this.inspected = news.inspected;
    news.actors.forEach((said, k) => {
      const actor = this.actors[k]!;
      actor.news = said;
      if (!said.built || actor.puppet) return;
      const puppet = actor.puppet = puppetBody(actor.spec, this.scene);
      if ([...puppet.segments.keys()].join() !== this.link.roster[k]!.segments.join()) throw new Error(`the page draws ${actor.id} with other segments than its world built`);
      const newest = this.link.newest;
      posePuppet(puppet, actor.offset, { from: newest, to: newest, share: 1 });
      bodyBetween(actor.offset, { from: newest, to: newest, share: 1 }, actor.centre);
      this.built(actor);
    });
  }

  /** Pose every body built between `at`'s two frames; one built after either is posed as the newest frame has it. */
  pose(at: Between): void {
    const newest = this.link.newest;
    for (const actor of this.actors) {
      if (!actor.puppet) continue;
      const between = unbuilt(at.from, actor.offset) || unbuilt(at.to, actor.offset) ? { from: newest, to: newest, share: 1 } : at;
      posePuppet(actor.puppet, actor.offset, between);
      bodyBetween(actor.offset, between, actor.centre);
    }
  }

  /** Run the world in real time, the lead as it stands sent first, or hold it; told only where it changes. */
  play(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    if (running) this.send();
    this.link.run(running);
  }

  /** The frames to draw between at `now`, ms on `performance.now()`'s clock (`WorldLink.between`). */
  between(now: number): Between { return this.link.between(now); }

  /** The steps the worker has sent since the last call, and its time for them, ms. */
  received(): { readonly steps: number; readonly ms: number } { return this.link.received(); }

  /** How fast the world plays: world seconds a real second, 1 in real time. */
  get speed(): number { return this.link.newest[2]!; }

  /**
   * Sends the person's next commands to these party members, or to everybody when `ids` is null,
   * after the lead and route as they stand; the selection shows so until the run says otherwise.
   */
  select(ids: readonly string[] | null): void {
    this.send();
    this.selected = new Set(ids === null ? this.party.map((member) => member.id) : ids.filter((id) => this.party.some((member) => member.id === id)));
    this.link.input({ kind: "select", ids });
  }

  /** The person's command, sent to the party's Commander after the lead and route as they stand. */
  command(command: Command): void {
    this.send();
    if (command.kind === "go" && "route" in command) this.drawn = { route: command.route, sent: JSON.stringify(command.route) };
    this.link.input({ kind: "command", command });
  }

  /** Show the mind of the body `id` in the news (`inspected`), or none. */
  look(id: string | null): void {
    if (id === this.looked) return;
    this.looked = id;
    this.link.input({ kind: "look", id });
  }

  /** Send the lead, where it has changed, and the route the pointer draws, where it has grown or been drawn. */
  send(): void {
    const lead = leadOf(this.commands, this.toward), text = JSON.stringify(lead);
    if (text !== this.sentLead) { this.sentLead = text; this.link.input({ kind: "lead", lead }); }
    const drawn = this.drawn;
    if (!drawn) return;
    const route = JSON.stringify(drawn.route);
    if (route !== drawn.sent) {
      drawn.sent = route;
      this.link.input({ kind: "route", points: drawn.route.points, drawing: drawn.route.drawing });
    }
    if (!drawn.route.drawing) this.drawn = null;
  }

  /** The fog from what the party sees and has seen, and each body shown where the party sees it. */
  present(): void {
    this.level.present(this.visible, this.explored, this.leader.feet(), this.pitch, this.toward);
    for (const actor of this.actors) {
      const shown = actor.side === "party" || this.visible.has(cellKey(this.map, actor.feet()));
      for (const mesh of actor.meshes) mesh.isVisible = shown;
    }
  }

  /** The enemy standing in sight whose body this mesh belongs to, or null: a click on one attacks it. */
  targetAt(mesh: AbstractMesh): ViewActor | null {
    return this.enemies.find((actor) => actor.puppet && actor.alive && actor.meshes.includes(mesh) &&
      this.visible.has(cellKey(this.map, actor.feet()))) ?? null;
  }

  /** The party member whose body this mesh belongs to, standing, or null: a click on one selects it. */
  memberAt(mesh: AbstractMesh): ViewActor | null {
    return this.party.find((actor) => actor.alive && actor.meshes.includes(mesh)) ?? null;
  }

  /** The worker, the puppets and the level. */
  dispose(): void {
    this.disposed = true;
    this.link.dispose();
    for (const actor of this.actors) actor.puppet?.dispose();
    this.level.dispose();
  }
}
