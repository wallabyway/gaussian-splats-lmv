# Gaussian Splat Shader Summary

This document explains how the Gaussian Splat shaders work in `splat-renderer.mjs`. The renderer uses a pair of custom GLSL shaders (vertex + fragment) running on instanced billboard quads to project and render millions of 3D Gaussian splats inside the Autodesk LMV (Three.js R71) viewer.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Vertex Shader](#vertex-shader)
3. [Fragment Shader](#fragment-shader)
4. [Key Attributes & Uniforms](#key-attributes--uniforms)
5. [Blending & Compositing](#blending--compositing)
6. [Instanced Rendering](#instanced-rendering)
7. [References](#references)

---

## High-Level Overview

Each splat is rendered as an **instanced quad** (4 vertices, 2 triangles) whose "texture" is a mathematically computed 2D Gaussian falloff. The pipeline works as follows:

1. **Per-splat data** (position, color, opacity, 3D covariance) is uploaded as instanced vertex attributes.
2. The **vertex shader** projects each splat's 3D position to screen space, computes the 2D covariance ellipse using the Jacobian of the perspective projection, derives a conic representation, and sizes a billboard quad to enclose the Gaussian.
3. The **fragment shader** evaluates the 2D Gaussian at each pixel covered by the quad, applies opacity, converts sRGB to linear light, and outputs a premultiplied-alpha fragment.
4. Splats are **sorted back-to-front** by depth in a Web Worker before each frame, enabling correct order-dependent transparency compositing.

This is the same math from the original *3D Gaussian Splatting for Real-Time Radiance Field Rendering* paper (Kerbl et al., SIGGRAPH 2023), adapted for LMV's older Three.js R71 runtime.

---

## Vertex Shader

The vertex shader lives in `splat-renderer.mjs` (lines 15-92). Its job is to project each 3D Gaussian to a 2D screen-space ellipse and size the billboard quad accordingly.

### Step 1: View-space transform and early culling

```glsl
vec4 p_view = modelViewMatrix * vec4(a_center, 1.0);
vec4 p_hom = projectionMatrix * p_view;
vec3 p_proj = p_hom.xyz / (p_hom.w + 1e-7);
```

The splat center is transformed to view space, then projected. Several culling checks follow:

- **Near-plane cull**: Splats behind `z > -0.2` (too close to camera) are discarded.
- **Distance cull**: If `cullRadius > 0` and the view-space distance exceeds it, the splat is discarded.
- **Cut-plane cull**: Up to 6 section planes (from LMV's sectioning tool) are evaluated. Any splat on the positive side of a cut plane is discarded.

Discarded splats are moved off-screen with `gl_Position = vec4(0, 0, 0, 1)`.

### Step 2: 3D-to-2D covariance projection (`computeCov2D`)

This is the heart of the Gaussian splatting algorithm. The 3D covariance matrix (computed on the CPU at load time) is projected to 2D screen space:

```glsl
mat3 J = mat3(
    focal_x / t.z, 0.0, -(focal_x * t.x) / (t.z * t.z),
    0.0, focal_y / t.z, -(focal_y * t.y) / (t.z * t.z),
    0.0, 0.0, 0.0
);
mat3 V = mat3(modelViewMatrix[0][0], modelViewMatrix[1][0], ...);
mat3 T = V * J;
mat3 cov = transpose(T) * transpose(Vrk) * T;
```

| Symbol | Meaning |
|--------|---------|
| `Vrk` | 3x3 covariance matrix in world space (from `a_covA` + `a_covB`) |
| `V` | Upper 3x3 of `modelViewMatrix` (rotation + scale of view transform) |
| `J` | Jacobian of perspective projection (how view-space deltas map to screen-space pixels) |
| `T` | Combined transform `V * J` |
| `cov` | 2x2 screen-space covariance (symmetric, stored as `vec3(cov[0][0], cov[0][1], cov[1][1])`) |

A small regularization (`+ 0.3` to diagonal) prevents degenerate splats from collapsing to zero size.

### Step 3: Conic parameters and radius

```glsl
vec3 conic = vec3(cov.z, -cov.y, cov.x) / det;
float mid = 0.5 * (cov.x + cov.z);
float lambda1 = mid + sqrt(max(0.1, mid * mid - det));
float lambda2 = mid - sqrt(max(0.1, mid * mid - det));
float my_radius = ceil(3.0 * sqrt(max(lambda1, lambda2)));
```

- `det` is the determinant of the 2D covariance. If zero, the splat is degenerate and discarded.
- `conic` stores the inverse covariance in conic form (used directly by the fragment shader).
- `lambda1`, `lambda2` are the eigenvalues (squared semi-axes of the screen-space ellipse).
- `my_radius` is `3 * sqrt(max(lambda))`, capturing ~99.7% of the Gaussian's energy (the "three sigma" rule).

### Step 4: Screen-space positioning

```glsl
vec2 point_image = vec2(
    ((p_proj.x + 1.0) * W - 1.0) * 0.5,
    ((p_proj.y + 1.0) * H - 1.0) * 0.5
);
```

The projected NDC coordinates are converted to pixel coordinates. The quad vertex positions (`position.xy` from the base quad geometry, ranging `[-1, 1]`) are scaled by `my_radius` and offset from the splat center:

```glsl
vec2 screen_pos = point_image + my_radius * position.xy;
```

### Step 5: Varying outputs

```glsl
v_col = a_col;
v_con_o = vec4(conic, a_opacity);
v_xy = point_image;
v_pixf = screen_pos;
gl_Position = vec4(screen_pos / vec2(W, H) * 2.0 - 1.0, 0.0, 1.0);
```

| Varying | Purpose |
|---------|---------|
| `v_col` | Splat RGB color |
| `v_con_o` | Conic parameters (xyz) + opacity (w) |
| `v_xy` | Splat center in screen pixels |
| `v_pixf` | Current fragment position in screen pixels |

The final `gl_Position` converts back to NDC for the GPU rasterizer.

---

## Fragment Shader

The fragment shader lives in `splat-renderer.mjs` (lines 94-108). It evaluates the 2D Gaussian for each fragment and outputs a premultiplied-alpha color.

### Gaussian evaluation

```glsl
vec2 d = v_xy - v_pixf;
float power = -0.5 * (v_con_o.x * d.x * d.x + v_con_o.z * d.y * d.y)
              - v_con_o.y * d.x * d.y;
if (power > 0.0) discard;
```

- `d` is the pixel offset from the splat center.
- `power` evaluates the quadratic form `d^T * Sigma^{-1} * d` using the conic parameters. If positive, the fragment is outside the Gaussian support and is discarded.

### Alpha computation

```glsl
float alpha = min(0.99, v_con_o.w * exp(power));
if (alpha < 0.004) discard;
```

- `exp(power)` is the Gaussian falloff (always `<= 1` since `power <= 0`).
- `v_con_o.w` is the splat opacity, modulating the peak alpha.
- Alpha is clamped to `0.99` to prevent fully-opaque artifacts and aid numerical stability.
- Fragments below `0.004` alpha are discarded to save blending cost.

### Color output

```glsl
vec3 linear = pow(v_col, vec3(2.2));
gl_FragColor = vec4(linear * alpha, alpha);
```

- `pow(v_col, vec3(2.2))` converts sRGB colors to linear light before blending. This is critical for correct physically-based compositing.
- The output is **premultiplied alpha**: RGB is multiplied by alpha, and alpha is stored in A.

---

## Key Attributes & Uniforms

### Per-instance attributes (one value per splat)

| Attribute | Type | Description |
|-----------|------|-------------|
| `a_center` | `vec3` | Splat center position in world space |
| `a_col` | `vec3` | Splat RGB color |
| `a_opacity` | `float` | Splat opacity [0, 1] |
| `a_covA` | `vec3` | First half of 3D covariance: `(Sigma_00, Sigma_01, Sigma_02)` |
| `a_covB` | `vec3` | Second half of 3D covariance: `(Sigma_11, Sigma_12, Sigma_22)` |

The 3D covariance is reconstructed in the shader as:
```glsl
cov3D[0] = a_covA.x;  // Sigma_00
cov3D[1] = a_covA.y;  // Sigma_01
cov3D[2] = a_covA.z;  // Sigma_02
cov3D[3] = a_covB.x;  // Sigma_11
cov3D[4] = a_covB.y;  // Sigma_12
cov3D[5] = a_covB.z;  // Sigma_22
```

### Camera & screen uniforms

| Uniform | Type | Description |
|---------|------|-------------|
| `W` / `H` | `float` | Viewport width and height in pixels |
| `focal_x` / `focal_y` | `float` | Camera focal lengths in pixels |
| `tan_fovx` / `tan_fovy` | `float` | Tangent of half the horizontal/vertical FOV |

### Culling uniforms

| Uniform | Type | Description |
|---------|------|-------------|
| `cullRadius` | `float` | Maximum view-space distance (0 = disabled) |
| `cutPlaneCount` | `int` | Number of active section planes |
| `cutPlanes[6]` | `vec4` | Section planes as `(normal.xyz, offset)` |

---

## Blending & Compositing

The material is configured for order-dependent transparent compositing:

```javascript
transparent: true,
depthTest: false,
depthWrite: false,
blending: THREE.CustomBlending,
blendSrc: THREE.OneFactor,
blendDst: THREE.OneMinusSrcAlphaFactor,
blendSrcAlpha: THREE.OneFactor,
blendDstAlpha: THREE.OneMinusSrcAlphaFactor
```

This is the standard **premultiplied-alpha "over" operator**:

```
result = src + dst * (1 - srcAlpha)
```

- **No depth test/write**: Ordering is handled entirely by the CPU-side depth sort (Web Worker), not the Z-buffer. This is essential because Gaussian splats are semi-transparent and must be composited back-to-front.
- **Back-to-front sort**: A 65536-bucket counting sort in a Web Worker reorders splats every ~700ms (or on significant camera movement) to maintain correct transparency.

---

## Instanced Rendering

The renderer uses **instanced geometry** on a base quad:

```javascript
// Base quad: 4 vertices, 2 triangles
new Float32Array([-1,-1,0,  1,-1,0,  -1,1,0,  1,1,0])
```

Each splat is one instance of this quad. The per-splat attributes (`a_center`, `a_col`, `a_opacity`, `a_covA`, `a_covB`) advance once per instance via `divisor = 1` (the R71-compatible way of doing instanced attributes). The GPU draws `numInstances` copies, and the vertex shader positions and shapes each one independently.

This is far more efficient than creating separate geometry per splat -- the same 4 vertices are reused millions of times, with only the instanced attribute buffers changing.

---

## References

- **3D Gaussian Splatting for Real-Time Radiance Field Rendering** -- Kerbl, Kopanas, Leimkuhler, Drettakis (SIGGRAPH 2023)
- **antimatter15/splat** -- Early WebGL Gaussian splat renderer, community reference for the shader approach
- **lcc-decoder** -- Reference JavaScript decoder for the LCC format
