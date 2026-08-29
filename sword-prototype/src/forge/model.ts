import { validateBlueprint, type ConstructBlueprint, type JointSpec, type ModuleSpec, type PartSpec, type SocketSpec } from "../construct/blueprint.ts";
import { assertConnectedFragmentAttachment, partAttachmentSockets, type PartAttachmentSocketId } from "./catalog.ts";

export type ForgeCommand =
  | Readonly<{ kind: "attach-fragment"; part: PartSpec; joint: JointSpec }>
  | Readonly<{ kind: "attach-catalog-fragment"; part: PartSpec; joint: JointSpec;
      parentSocket: PartAttachmentSocketId; childSocket: PartAttachmentSocketId; attachmentTag: "structural" }>
  | Readonly<{ kind: "attach-connected-fragment"; parts: readonly PartSpec[];
      joints: readonly JointSpec[]; sockets: readonly SocketSpec[] }>
  | Readonly<{ kind: "attach-catalog-mount"; parts: readonly PartSpec[];
      joints: readonly JointSpec[]; sockets: readonly SocketSpec[]; parentSocket: PartAttachmentSocketId }>
  | Readonly<{ kind: "add-socket"; socket: SocketSpec }>
  | Readonly<{ kind: "remove-subtree"; part: string }>
  | Readonly<{ kind: "mount-module"; module: ModuleSpec }>
  | Readonly<{ kind: "unmount-module"; module: string }>
  | Readonly<{ kind: "resize-box"; part: string; sizeM: readonly [number, number, number] }>
  | Readonly<{ kind: "rename-part"; from: string; to: string }>;

export interface ForgeResult {
  readonly blueprint: ConstructBlueprint;
  readonly refusal: string | null;
}

const refused = (blueprint: ConstructBlueprint, error: unknown): ForgeResult => Object.freeze({
  blueprint,
  refusal: error instanceof Error ? error.message : String(error),
});

/** Every edit is a complete valid transition; disconnected intermediate drafts do not exist. */
export function reduceForge(blueprint: ConstructBlueprint, command: ForgeCommand): ForgeResult {
  try {
    let candidate: ConstructBlueprint = structuredClone(blueprint);
    switch (command.kind) {
      case "attach-fragment":
        candidate = { ...candidate, parts: [...candidate.parts, structuredClone(command.part)],
          joints: [...candidate.joints, structuredClone(command.joint)] };
        break;
      case "attach-catalog-fragment": {
        const parent = candidate.parts.find(({ id }) => id === command.joint.parentPart);
        if (!parent) throw new Error(`catalog attachment parent "${command.joint.parentPart}" is missing`);
        if (command.joint.childPart !== command.part.id) {
          throw new Error(`catalog attachment child "${command.joint.childPart}" does not match part "${command.part.id}"`);
        }
        const parentPoint = partAttachmentSockets(parent).find(({ id }) => id === command.parentSocket);
        const childPoint = partAttachmentSockets(command.part).find(({ id }) => id === command.childSocket);
        if (!parentPoint?.accepts.includes(command.attachmentTag) || !childPoint?.accepts.includes(command.attachmentTag)) {
          throw new Error(`catalog attachment ${parent.id}/${command.parentSocket} to ${command.part.id}/${command.childSocket} is incompatible`);
        }
        const sameFrame = (left: JointSpec["parentFrame"], right: JointSpec["parentFrame"]): boolean =>
          left.positionM.every((value, index) => value === right.positionM[index]) &&
          left.rotation.every((value, index) => value === right.rotation[index]);
        if (!sameFrame(command.joint.parentFrame, parentPoint.frame) || !sameFrame(command.joint.childFrame, childPoint.frame)) {
          throw new Error(`catalog attachment frames do not match declared sockets`);
        }
        const occupied = candidate.joints.some((joint) =>
          (joint.parentPart === parent.id && sameFrame(joint.parentFrame, parentPoint.frame)) ||
          (joint.childPart === parent.id && sameFrame(joint.childFrame, parentPoint.frame)));
        if (occupied) throw new Error(`part socket "${parent.id}/${command.parentSocket}" is occupied`);
        candidate = { ...candidate, parts: [...candidate.parts, structuredClone(command.part)],
          joints: [...candidate.joints, structuredClone(command.joint)] };
        break;
      }
      case "attach-connected-fragment":
        assertConnectedFragmentAttachment(candidate, command.joints);
        candidate = { ...candidate, parts: [...candidate.parts, ...structuredClone(command.parts)],
          joints: [...candidate.joints, ...structuredClone(command.joints)],
          sockets: [...candidate.sockets, ...structuredClone(command.sockets)] };
        break;
      case "attach-catalog-mount": {
        if (command.parts.length !== 2 || command.joints.length !== 2 || command.sockets.length !== 1) {
          throw new Error("catalog two-axis mount must contain two parts, two joints and one output socket");
        }
        const [yawPart, pitchPart] = command.parts; const [yawJoint, pitchJoint] = command.joints;
        const parent = candidate.parts.find(({ id }) => id === yawJoint.parentPart);
        const point = parent && partAttachmentSockets(parent).find(({ id }) => id === command.parentSocket);
        const sameFrame = (left: JointSpec["parentFrame"], right: JointSpec["parentFrame"]): boolean =>
          left.positionM.every((value, index) => value === right.positionM[index]) &&
          left.rotation.every((value, index) => value === right.rotation[index]);
        if (!parent || !point || yawJoint.childPart !== yawPart.id || pitchJoint.parentPart !== yawPart.id ||
            pitchJoint.childPart !== pitchPart.id || yawJoint.angularAxes.length !== 1 || yawJoint.angularAxes[0].id !== "y" ||
            pitchJoint.angularAxes.length !== 1 || pitchJoint.angularAxes[0].id !== "x") {
          throw new Error("catalog two-axis mount topology is not the declared y-then-x chain");
        }
        if (!sameFrame(yawJoint.parentFrame, point.frame)) throw new Error("catalog mount frame does not match its selected parent socket");
        const opposite: Readonly<Record<PartAttachmentSocketId, PartAttachmentSocketId>> = {
          top: "bottom", bottom: "top", left: "right", right: "left", front: "rear", rear: "front",
        };
        const yawChild = partAttachmentSockets(yawPart).find(({ id }) => id === opposite[command.parentSocket]);
        const yawTop = partAttachmentSockets(yawPart).find(({ id }) => id === "top");
        const pitchBottom = partAttachmentSockets(pitchPart).find(({ id }) => id === "bottom");
        const pitchFront = partAttachmentSockets(pitchPart).find(({ id }) => id === "front");
        if (!yawChild || !yawTop || !pitchBottom || !pitchFront ||
            !sameFrame(yawJoint.childFrame, yawChild.frame) || !sameFrame(pitchJoint.parentFrame, yawTop.frame) ||
            !sameFrame(pitchJoint.childFrame, pitchBottom.frame)) {
          throw new Error("catalog mount internal frames do not match declared part sockets");
        }
        if (candidate.joints.some((joint) =>
          (joint.parentPart === parent.id && sameFrame(joint.parentFrame, point.frame)) ||
          (joint.childPart === parent.id && sameFrame(joint.childFrame, point.frame)))) {
          throw new Error(`part socket "${parent.id}/${command.parentSocket}" is occupied`);
        }
        const output = command.sockets[0];
        if (output.part !== pitchPart.id || !output.accepts.includes("dorsal-weapon") ||
            !sameFrame(output.frame, pitchFront.frame)) {
          throw new Error("catalog two-axis mount output socket must belong to the pitch child and accept dorsal-weapon");
        }
        candidate = { ...candidate, parts: [...candidate.parts, ...structuredClone(command.parts)],
          joints: [...candidate.joints, ...structuredClone(command.joints)],
          sockets: [...candidate.sockets, ...structuredClone(command.sockets)] };
        break;
      }
      case "add-socket":
        candidate = { ...candidate, sockets: [...candidate.sockets, structuredClone(command.socket)] };
        break;
      case "remove-subtree": {
        if (command.part === candidate.rootPart) throw new Error(`cannot remove root part "${command.part}"`);
        const removed = subtree(candidate, command.part);
        const removedSockets = new Set(candidate.sockets.filter((socket) => removed.has(socket.part)).map((socket) => socket.id));
        candidate = { ...candidate,
          parts: candidate.parts.filter((part) => !removed.has(part.id)),
          joints: candidate.joints.filter((joint) => !removed.has(joint.childPart)),
          sockets: candidate.sockets.filter((socket) => !removedSockets.has(socket.id)),
          modules: candidate.modules.filter((module) => !removedSockets.has(module.socket)) };
        break;
      }
      case "mount-module": candidate = { ...candidate, modules: [...candidate.modules, structuredClone(command.module)] }; break;
      case "unmount-module": candidate = { ...candidate,
        modules: candidate.modules.filter((module) => module.id !== command.module) }; break;
      case "resize-box": {
        const part = candidate.parts.find((row) => row.id === command.part);
        if (!part) throw new Error(`cannot resize missing part "${command.part}"`);
        if (part.shape.kind !== "box") throw new Error(`part "${command.part}" is not a box`);
        const resized = { ...part, shape: { ...part.shape, sizeM: [...command.sizeM] as readonly [number, number, number] } };
        const oldPoints = partAttachmentSockets(part); const newPoints = partAttachmentSockets(resized);
        const matchingPoint = (attachment: JointSpec["parentFrame"]): PartAttachmentSocketId | null =>
          oldPoints.find(({ frame }) => frame.positionM.every((value, index) => value === attachment.positionM[index]) &&
            frame.rotation.every((value, index) => value === attachment.rotation[index]))?.id ?? null;
        for (const joint of candidate.joints) for (const [owns, attachment] of [
          [joint.parentPart === part.id, joint.parentFrame], [joint.childPart === part.id, joint.childFrame],
        ] as const) if (owns && matchingPoint(attachment) === null) {
          throw new Error(`cannot resize part "${part.id}": joint "${joint.id}" uses a custom non-face frame`);
        }
        for (const socket of candidate.sockets) if (socket.part === part.id && matchingPoint(socket.frame) === null) {
          throw new Error(`cannot resize part "${part.id}": module socket "${socket.id}" uses a custom non-face frame`);
        }
        const moved = (attachment: JointSpec["parentFrame"]): JointSpec["parentFrame"] => {
          const id = matchingPoint(attachment); const next = newPoints.find((point) => point.id === id);
          if (!next) throw new Error(`cannot resize part "${part.id}": declared face was lost`);
          return structuredClone(next.frame);
        };
        candidate = { ...candidate,
          parts: candidate.parts.map((row) => row.id === command.part ? resized : row),
          joints: candidate.joints.map((joint) => ({ ...joint,
            parentFrame: joint.parentPart === part.id ? moved(joint.parentFrame) : joint.parentFrame,
            childFrame: joint.childPart === part.id ? moved(joint.childFrame) : joint.childFrame })),
          sockets: candidate.sockets.map((socket) => socket.part === part.id
            ? { ...socket, frame: moved(socket.frame) } : socket),
        };
        break;
      }
      case "rename-part": {
        const part = candidate.parts.find((row) => row.id === command.from);
        if (!part) throw new Error(`cannot rename missing part "${command.from}"`);
        candidate = { ...candidate,
          rootPart: candidate.rootPart === command.from ? command.to : candidate.rootPart,
          parts: candidate.parts.map((row) => row.id === command.from ? { ...row, id: command.to } : row),
          joints: candidate.joints.map((joint) => ({ ...joint,
            parentPart: joint.parentPart === command.from ? command.to : joint.parentPart,
            childPart: joint.childPart === command.from ? command.to : joint.childPart })),
          sockets: candidate.sockets.map((socket) => socket.part === command.from
            ? { ...socket, part: command.to } : socket) };
        break;
      }
    }
    return Object.freeze({ blueprint: validateBlueprint(candidate), refusal: null });
  } catch (error) {
    return refused(blueprint, error);
  }
}

function subtree(blueprint: ConstructBlueprint, root: string): ReadonlySet<string> {
  if (!blueprint.parts.some((part) => part.id === root)) throw new Error(`cannot remove missing part "${root}"`);
  const result = new Set<string>();
  const visit = (part: string): void => {
    result.add(part);
    for (const joint of blueprint.joints) if (joint.parentPart === part) visit(joint.childPart);
  };
  visit(root);
  return result;
}

export class ForgeHistory {
  private past: ConstructBlueprint[] = [];
  private future: ConstructBlueprint[] = [];
  private current: ConstructBlueprint;

  constructor(blueprint: ConstructBlueprint) { this.current = validateBlueprint(blueprint); }
  get blueprint(): ConstructBlueprint { return this.current; }
  peekUndo(): ConstructBlueprint { return this.past.at(-1) ?? this.current; }
  peekRedo(): ConstructBlueprint { return this.future.at(-1) ?? this.current; }

  apply(command: ForgeCommand): ForgeResult {
    const result = reduceForge(this.current, command);
    if (!result.refusal) {
      this.past.push(this.current);
      this.current = result.blueprint;
      this.future = [];
    }
    return result;
  }

  undo(): ConstructBlueprint {
    const prior = this.past.pop();
    if (!prior) return this.current;
    this.future.push(this.current); this.current = prior; return this.current;
  }

  redo(): ConstructBlueprint {
    const next = this.future.pop();
    if (!next) return this.current;
    this.past.push(this.current); this.current = next; return this.current;
  }
}
