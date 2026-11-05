# Mind and organization boundaries

The remaining work separates the general Mind computation, embodiment, body actuation and
command-layer configuration. The runtime keeps command timing, sensing, replay and supported
forks exact.

- Keep `src/minds/mind.ts` limited to the Mind contract and construction metadata; place world
  orchestration in `embodiment.ts` and shared mind phases in `execution.ts`.
- Let body actuation own hand encoding and delayed requests. Keep sheet recording in its Mind
  adapter, outside the physical core.
- Keep command-layer research settings with command-layer options and remove unused physical
  embodiment settings.
- Make all driver memory reachable through `Mind.state`, including skills, decisions and pace.
- Supply concrete motor construction and calibration to generic command-layer wiring.
- Check staged recovery's channel-selection settings and ordered gait validation against their
  owning implementations.

Acceptance requires reviewing each original plan's ownership and execution requirements against
the source, along with type checking, tests, build, unchanged fingerprints and worker/fork checks.
The architecture describes the resulting contracts; the roadmap tracks this work until it lands.
