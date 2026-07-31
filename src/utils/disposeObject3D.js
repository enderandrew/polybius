/**
 * disposeObject3D.js
 *
 * Recursively disposes every geometry and material found under `root`,
 * including textures referenced by those materials.
 *
 * ── Why this is shared rather than reimplemented per renderer ───────────────
 *
 * The bug this fixes existed in two different shapes at once:
 *
 *   1. Several renderers (SurfaceRenderer, ShooterRenderer,
 *      ProjectileRendererManager) had NO dispose() at all — releaseLevel()
 *      only called remove(), which detaches from the scene graph and does
 *      nothing to GPU memory.
 *
 *   2. EnemyRenderer DID have a dispose(), but it only disposed MATERIALS,
 *      never GEOMETRY — so every subclass (flipper, fuseball, pulsar, spiker,
 *      all three tanker variants) was leaking every BufferGeometry it ever
 *      created, just less obviously than case 1.
 *
 * A single correct implementation, reused everywhere, means there is now only
 * one place this can go wrong again instead of five.
 */
export default function disposeObject3D(root) {
  root.traverse((child) => {
    child.geometry?.dispose();

    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];

    for (const material of materials) {
      // Dispose any textures the material references. Most renderers here
      // are LineBasicMaterial/MeshBasicMaterial with flat colours and no
      // maps, but this keeps the helper correct if that ever changes.
      for (const key of ['map', 'alphaMap', 'emissiveMap', 'envMap']) {
        material[key]?.dispose?.();
      }
      material.dispose();
    }
  });
}
