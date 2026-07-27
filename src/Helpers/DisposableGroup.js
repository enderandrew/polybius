import { Group } from 'three';

export function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

export class DisposableGroup extends Group {
  dispose() {
    disposeObject3D(this);
    this.clear();
  }
}
