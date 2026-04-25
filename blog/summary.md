# Summary: 600 Lines and Five Hard Problems

This demo renders 3D Gaussian Splats inside the Autodesk LMV Viewer -- photorealistic reality capture composited directly onto a Revit BIM model, in the browser, with no plugins.

The entire implementation is roughly 600 lines of JavaScript across three files:

- **`lcc-loader.mjs`** (~210 lines) -- Decodes the XGRIDS LCC binary format: positions, colors, compressed quaternion rotations, quantized scales, and optional spherical harmonics coefficients. Supports progressive LOD loading via HTTP Range requests.

- **`splat-renderer.mjs`** (~375 lines) -- Builds instanced quad geometry, runs the vertex/fragment shaders for Gaussian evaluation, manages a Web Worker for depth sorting, and handles cut-plane uniforms for LMV section tool integration.

- **`app.mjs`** (~115 lines) -- Initializes the LMV viewer, loads the Revit model, wires the splat overlay into LMV's scene graph, and bridges viewer events (camera changes, section planes) to the renderer.

## What We Covered

1. **[The LCC Format](topic1.md)** -- 32 bytes per splat, compressed quaternions, LOD byte ranges, and why XGRIDS' LiDAR pipeline skips the most expensive step in traditional Gaussian splat creation.

2. **[Sorting and Web Workers](topic2.md)** -- Why transparent splats need back-to-front ordering, why a 65536-bucket counting sort beats comparison sorts for millions of primitives, and why that sort must run off the main thread.

3. **[The Shader](topic3.md)** -- How a 3D covariance matrix projects to a 2D screen-space ellipse via the Jacobian of perspective projection, and how instanced rendering works on LMV's older Three.js R71 fork.

4. **[Section Planes](topic4.md)** -- How the splat vertex shader evaluates the same half-space test as LMV's built-in section tool, making both the BIM model and the splat overlay cut at exactly the same plane.

5. **[The Gamma Problem](topic5.md)** -- Why `pow(color, 2.2)` is necessary for correct blending, why it might produce too-dark output depending on framebuffer state, and why this has been a persistent issue across web-based 3DGS renderers.

## The Key Insight

LMV's overlay scene system (`createOverlayScene` / `addOverlay`) and its globally exposed `window.THREE` make it possible to inject arbitrary GPU-rendered content alongside BIM geometry. The splat mesh is just a `THREE.Mesh` with a custom `ShaderMaterial` -- LMV doesn't know or care that it's rendering Gaussian splats. It processes the mesh through its standard render pipeline, applying the same camera, the same section planes, the same compositing.

This pattern generalizes beyond splats. Any custom visualization that can be expressed as a Three.js mesh with a shader -- point clouds, volumetric data, sensor heatmaps, flow simulations -- can be overlaid on a BIM model using the same approach.

## References

- **3D Gaussian Splatting for Real-Time Radiance Field Rendering** -- Kerbl, Kopanas, Leimkühler, Drettakis (SIGGRAPH 2023). The original paper that introduced the technique.
- **XGRIDS** -- [xgrids.com](https://xgrids.com). LiDAR-based Gaussian splat capture and the LCC format.
- **antimatter15/splat** -- Early WebGL Gaussian splat renderer. Community reference for the shader approach used here.
- **lcc-decoder** -- Reference JavaScript decoder for the LCC format, from which the loader and renderer in this demo were ported.
- **Autodesk Platform Services (APS) Viewer SDK** -- [aps.autodesk.com](https://aps.autodesk.com). The LMV viewer runtime.

## Source Code

All source is in [`src/task05/`](../src/task05/):

- [`lcc-loader.mjs`](../src/task05/lcc-loader.mjs)
- [`splat-renderer.mjs`](../src/task05/splat-renderer.mjs)
- [`app.mjs`](../src/task05/app.mjs)
- [`index.html`](../src/task05/index.html)
- [`vite.config.js`](../src/task05/vite.config.js)
