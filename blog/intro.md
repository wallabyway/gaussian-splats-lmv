# Gaussian Splats Meet BIM: Rendering 3DGS Inside the Autodesk Viewer

What if you could overlay a photorealistic reality capture directly onto your BIM model -- right in the browser, with no plugins, no server-side rendering, and no separate viewport?

That's what we built. A web demo that decodes 3D Gaussian Splats from the XGRIDS LCC format and composites them on top of a Revit model inside the Autodesk Platform Services (APS) Viewer, also known as LMV. The Revit geometry provides the architectural skeleton. The Gaussian splats add the captured-reality detail -- every surface, every shadow, every coffee stain on the countertop.

The entire thing is roughly 600 lines of JavaScript: a binary format loader, a GPU renderer, and a thin glue layer that wires them into the viewer's overlay pipeline. But those 600 lines touch a surprising number of hard problems.

This series walks through five of them.

## What We'll Cover

1. **[The LCC Format and the XGRIDS LiDAR Pipeline](topic1.md)** -- How a single Gaussian splat gets packed into 32 bytes, and why a LiDAR scanner on your phone can skip the most expensive step in the traditional 3DGS pipeline.

2. **[Why Splats Need Sorting (and Why That Needs a Web Worker)](topic2.md)** -- Transparent primitives can't hide behind a Z-buffer. Every camera movement means re-sorting millions of splats, and doing that on the main thread would freeze your browser.

3. **[From Point Clouds to Gaussian Splats: The Shader](topic3.md)** -- If you've ever rendered a point cloud, you're halfway there. The leap from fixed-size points to oriented Gaussian ellipses is smaller than it looks.

4. **[Section Planes: Making Splats Play Nice with BIM Tools](topic4.md)** -- The BIM viewer's section tool cuts through both the Revit model and the splat overlay at exactly the same plane. Here's how.

5. **[The Gamma 2.2 Problem](topic5.md)** -- A single line in the fragment shader converts sRGB to linear light. It might be wrong. Here's why it matters and where the fix lives.

## The Stack

- **Viewer:** Autodesk `GuiViewer3D` (LMV) with a Revit model loaded from APS
- **Three.js:** LMV's bundled R71 fork, accessed via `window.THREE`
- **Splat overlay:** Injected through `viewer.impl.createOverlayScene()` + `addOverlay()`
- **Build:** Vite dev server with API proxy -- no APS credentials needed locally
- **Source:** [`src/task05/`](../src/task05/) -- `lcc-loader.mjs`, `splat-renderer.mjs`, `app.mjs`

Let's start with the data.
