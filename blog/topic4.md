# Topic 4: Section Planes: Making Splats Play Nice with BIM Tools

## The BIM Viewer's Killer Feature

One of the most-used tools in any BIM viewer is the section plane. You drag a plane through the building and everything on one side vanishes, revealing the interior structure -- walls, ducts, pipes, structural steel. Architects, engineers, and contractors use it constantly to inspect what's behind a surface.

When you overlay Gaussian splats on a Revit model, the section plane needs to cut through both. If the Revit walls slice cleanly at floor level but the splats keep rendering the full room, the illusion collapses. The splat overlay has to respect the exact same cutting planes as the BIM geometry.

## How LMV Defines Section Planes

LMV's section tool represents each cutting plane as a `vec4(nx, ny, nz, d)` -- a plane normal plus a signed distance from the origin. The convention is:

- `dot(normal, point) + d > 0` means the point is on the **cut** side (invisible)
- `dot(normal, point) + d <= 0` means the point is on the **keep** side (visible)

The viewer fires a `CUTPLANES_CHANGE_EVENT` whenever the user creates, moves, or removes a section plane. The event gives you an array of these `vec4` plane definitions.

## Wiring It Up

The glue code in `app.mjs` listens for that event and forwards the planes to the splat renderer:

```javascript
// app.mjs
viewer.addEventListener(Autodesk.Viewing.CUTPLANES_CHANGE_EVENT, () => {
    if (!splatRenderer) return;
    const planes = viewer.getCutPlanes() || [];
    splatRenderer.setCutPlanes(planes);
    viewer.impl.invalidate(false, false, true);
});
```

The renderer stores the planes as shader uniforms:

```javascript
// splat-renderer.mjs, setCutPlanes()
setCutPlanes(planes) {
    const count = Math.min(planes.length, MAX_CUT_PLANES);  // max 6
    u.cutPlaneCount.value = count;
    for (let i = 0; i < MAX_CUT_PLANES; i++) {
        if (i < count) {
            u.cutPlanes.value[i].set(p.x, p.y, p.z, p.w);
        } else {
            u.cutPlanes.value[i].set(0, 0, 0, 0);
        }
    }
}
```

## The Vertex Shader Half-Space Test

The actual culling happens in the vertex shader, before any fragment work. For each active cut plane, the shader transforms the splat center to world space and evaluates the half-space test:

```glsl
// splat-renderer.mjs, vertex shader
vec3 worldPos = (modelMatrix * vec4(a_center, 1.0)).xyz;
for (int i = 0; i < 6; i++) {       // MAX_CUT_PLANES = 6
    if (i >= cutPlaneCount) break;
    if (dot(cutPlanes[i].xyz, worldPos) + cutPlanes[i].w > 0.0) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
}
```

If the splat's center falls on the cut side of *any* active plane, the vertex shader sets `gl_Position` to a degenerate value (a zero-area point at the center of clip space) and returns early. The GPU discards the degenerate primitive -- no fragments are generated, no blending happens.

This is per-splat culling, not per-fragment. It means the cut edge follows the splat centers, not the Gaussian falloff boundary. For dense splat clouds this is imperceptible. For very sparse regions you might see a slightly ragged edge at the section plane, but in practice the splat density is high enough that it looks clean.

## Why This Works Seamlessly

The key insight is that LMV uses the same half-space convention for its own geometry. The Revit model's section planes are defined as `vec4(nx, ny, nz, d)` with the same sign convention, applied in the same world-space coordinate frame. By listening to `CUTPLANES_CHANGE_EVENT` and forwarding those exact plane definitions to the splat shader, the cut is guaranteed to align.

There's no coordinate transform, no sign flip, no offset adjustment. The splats and the BIM geometry are cut at exactly the same plane because they're evaluating exactly the same equation.

Up to six simultaneous planes are supported, which covers LMV's standard section box (six planes forming a box around the region of interest).

---

**Next:** [The Gamma 2.2 Problem](topic5.md)
