// Ubershader de SGX.Synthesize Visualizer (25 motores + máscara dual). Portado sin cambios.
export const SYNTH_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tAscii;
uniform sampler2D tMask;
uniform vec2 u_resolution;
uniform int u_mode;
uniform int u_modeB;
uniform int u_maskActive;
uniform float u_maskAspect;
uniform float u_maskScale;
uniform float u_maskOpacity;
uniform int u_maskInvert;
uniform int u_maskPulse;
uniform float u_intensity;
uniform float u_scale;
uniform float u_bloom;
uniform vec3 u_color;
uniform vec3 u_colorB;
uniform float u_time;
uniform float u_audio;
uniform int u_splitscreen;
uniform int u_lite;
uniform int u_mirror;
uniform float u_invert;
uniform float u_punch;
uniform vec2 u_pointer;
uniform float u_rippleAge;
varying vec2 vUv;

float getLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 5 unrolled octaves FBM (constant loop bounds)
float fbm5(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    v += a * vnoise(p); p = rot * p * 2.02; a *= 0.5;
    v += a * vnoise(p); p = rot * p * 2.02; a *= 0.5;
    v += a * vnoise(p); p = rot * p * 2.02; a *= 0.5;
    v += a * vnoise(p); p = rot * p * 2.02; a *= 0.5;
    v += a * vnoise(p);
    return v;
}

float sobelEdge(vec2 uv, vec2 px) {
    float tl = getLuma(texture2D(tDiffuse, uv + px * vec2(-1.0,  1.0)).rgb);
    float tc = getLuma(texture2D(tDiffuse, uv + px * vec2( 0.0,  1.0)).rgb);
    float tr = getLuma(texture2D(tDiffuse, uv + px * vec2( 1.0,  1.0)).rgb);
    float ml = getLuma(texture2D(tDiffuse, uv + px * vec2(-1.0,  0.0)).rgb);
    float mr = getLuma(texture2D(tDiffuse, uv + px * vec2( 1.0,  0.0)).rgb);
    float bl = getLuma(texture2D(tDiffuse, uv + px * vec2(-1.0, -1.0)).rgb);
    float bc = getLuma(texture2D(tDiffuse, uv + px * vec2( 0.0, -1.0)).rgb);
    float br = getLuma(texture2D(tDiffuse, uv + px * vec2( 1.0, -1.0)).rgb);
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    return sqrt(gx * gx + gy * gy);
}

vec3 evalEffect(int m, vec2 uv, vec2 px, vec2 aspect, vec3 texRgb, float luma, float dynInt, float dynScale) {
    vec3 finalColor = texRgb;

    // 00: SPIDER VERSE
    if (m == 0) {
        float ca = dynInt * 0.022;
        vec3 splitCol = vec3(
            texture2D(tDiffuse, vec2(uv.x + ca, uv.y)).r,
            texRgb.g,
            texture2D(tDiffuse, vec2(uv.x - ca, uv.y)).b
        );
        vec3 cel = floor(splitCol * 4.5 + 0.5) / 4.5;
        float angle = 0.5236;
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        float dotFreq = max(3.5, 9.0 / dynScale);
        vec2 cell = fract((rot * gl_FragCoord.xy) / dotFreq) - 0.5;
        float dotRadius = clamp(getLuma(cel) * 0.62, 0.08, 0.52);
        float halftone = smoothstep(dotRadius + 0.06, dotRadius - 0.06, length(cell));
        float ink = smoothstep(0.24, 0.55, sobelEdge(uv, px * 1.6));
        vec3 shadowTone = mix(vec3(0.03, 0.05, 0.09), u_colorB * 0.35, 0.45);
        vec3 litTone = mix(cel, cel * u_color * 1.35, 0.45);
        finalColor = mix(shadowTone, litTone, mix(0.35, 1.0, halftone));
        finalColor = mix(finalColor, vec3(0.02), ink * (0.65 + 0.35 * dynInt));
        finalColor += u_color * ink * (u_audio * 0.8 + u_punch * 0.7);
    }
    // 01: DATA MOSH
    else if (m == 1) {
        float blockSize = max(12.0, 42.0 / dynScale);
        vec2 blockId = floor(uv * blockSize);
        float rnd = hash21(blockId + floor(u_time * 6.0));
        float trigger = step(1.0 - clamp(dynInt * 0.72, 0.12, 0.88), rnd);
        vec2 shift = (vec2(hash21(blockId + 1.3), hash21(blockId + 7.9)) - 0.5) * 0.14 * dynInt * trigger;
        float bandTear = sin(uv.y * 85.0 * dynScale + u_time * 11.0) * 0.025 * dynInt * step(0.55, luma);
        vec3 mCol = texture2D(tDiffuse, fract(uv + shift + vec2(bandTear, 0.0))).rgb;
        vec3 keyTint = mix(u_color, u_colorB, step(0.5, rnd));
        finalColor = mix(mCol, mCol * keyTint * 1.35, trigger * 0.65);
    }
    // 02: FLUID FBM
    else if (m == 2) {
        vec2 p = uv * (2.6 * dynScale);
        vec2 q = vec2(fbm5(p + vec2(u_time * 0.25, 1.2)), fbm5(p + vec2(-u_time * 0.22, 4.7)));
        float w = fbm5(p + 2.2 * q + vec2(u_time * 0.18));
        vec3 warped = texture2D(tDiffuse, fract(uv + (q - 0.5) * 0.12 * dynInt)).rgb;
        vec3 smoke = mix(u_colorB, u_color, smoothstep(0.25, 0.8, w));
        finalColor = mix(warped, warped * 0.65 + smoke * (0.55 + luma * 0.6), clamp(dynInt * 0.65, 0.15, 0.85));
    }
    // 03: SOBEL NEON
    else if (m == 3) {
        vec2 stepPx = px * (1.2 + dynInt * 2.6);
        float eCore = sobelEdge(uv, stepPx);
        float eWide = sobelEdge(uv, stepPx * 2.4);
        vec3 bg = texRgb * 0.14;
        vec3 neonPrimary = u_color * pow(clamp(eCore * 2.2, 0.0, 1.5), 1.2) * (1.2 + dynScale * 0.35);
        vec3 neonRim = u_colorB * smoothstep(0.18, 0.9, eWide) * (0.75 + u_audio * 1.4);
        finalColor = bg + neonPrimary + neonRim;
    }
    // 04: KINETIC RIPPLE
    else if (m == 4) {
        vec2 centered = (uv - 0.5) * aspect;
        float dist = length(centered);
        vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);
        float wave = sin(dist * (18.0 * dynScale) - u_time * (5.2 + u_audio * 4.0));
        float envelope = exp(-dist * 1.4) * dynInt * 0.065;
        vec2 offset = (dir / aspect) * wave * envelope;
        float r = texture2D(tDiffuse, uv + offset * 1.35).r;
        float g = texture2D(tDiffuse, uv + offset).g;
        float b = texture2D(tDiffuse, uv + offset * 0.65).b;
        float crest = smoothstep(0.72, 0.98, abs(wave)) * exp(-dist * 1.1);
        finalColor = vec3(r, g, b) + mix(u_colorB, u_color, crest) * crest * (0.45 + u_audio * 0.9);
    }
    // 05: CRT PHOSPHOR
    else if (m == 5) {
        vec2 cUv = uv * 2.0 - 1.0;
        cUv *= 1.0 + dot(cUv, cUv) * (0.09 * dynInt);
        vec2 crtUv = cUv * 0.5 + 0.5;
        float inBounds = step(0.0, crtUv.x) * step(crtUv.x, 1.0) * step(0.0, crtUv.y) * step(crtUv.y, 1.0);
        float shift = 0.005 + dynInt * 0.012;
        vec3 base = vec3(
            texture2D(tDiffuse, crtUv + vec2(shift, 0.0)).r,
            texture2D(tDiffuse, crtUv).g,
            texture2D(tDiffuse, crtUv - vec2(shift, 0.0)).b
        );
        vec3 ghost = texture2D(tDiffuse, crtUv - vec2(shift * 2.8, 0.0)).rgb * 0.25 * u_colorB;
        float scan = 0.84 + 0.16 * sin(crtUv.y * u_resolution.y * 1.4 * clamp(dynScale, 0.6, 2.2));
        float mask = 0.92 + 0.08 * sin(gl_FragCoord.x * 2.1);
        float hum = smoothstep(0.92, 1.0, sin(crtUv.y * 6.2831 - u_time * 1.8)) * 0.12 * dynInt;
        finalColor = ((base + ghost) * scan * mask + hum * u_color) * mix(vec3(1.0), u_color * 1.15, 0.25) * inBounds;
    }
    // 06: CHROMA PRISM
    else if (m == 6) {
        vec2 d = uv - 0.5;
        float dist = length(d);
        float amt = dynInt * 0.085 * dynScale * (0.35 + dist);
        float angle = atan(d.y, d.x) + u_time * 0.45;
        vec2 axis = vec2(cos(angle), sin(angle));
        float r = texture2D(tDiffuse, uv + axis * amt).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - axis * amt).b;
        float ySample = getLuma(texture2D(tDiffuse, uv + vec2(-axis.y, axis.x) * amt * 0.6).rgb);
        finalColor = vec3(r, g, b) + u_color * ySample * 0.18 * dynInt;
    }
    // 07: DEPTH TOPO
    else if (m == 7) {
        vec2 center = vec2(0.5);
        vec2 depthUv = center + (uv - center) * (1.0 - luma * dynInt * 0.28 * dynScale);
        vec3 extruded = texture2D(tDiffuse, depthUv).rgb;
        float dLuma = getLuma(extruded);
        float bands = 10.0 * clamp(dynScale, 0.5, 3.0);
        float contour = 1.0 - smoothstep(0.0, 0.08, abs(fract(dLuma * bands + u_time * 0.25) - 0.5));
        vec3 topoColor = mix(u_colorB, u_color, dLuma);
        finalColor = mix(extruded * 0.72, topoColor * 1.35, contour * clamp(dynInt + 0.25, 0.2, 1.0));
    }
    // 08: ASCII MATRIX (Real 16-Glyph Monospace Atlas)
    else if (m == 8) {
        float cellPx = clamp(18.0 / max(dynScale, 0.35), 6.0, 28.0);
        vec2 gridDims = max(floor(u_resolution / cellPx), vec2(24.0, 14.0));
        vec2 cellId = floor(uv * gridDims);
        vec2 cellLocal = fract(uv * gridDims);
        vec2 sampleUv = (cellId + 0.5) / gridDims;
        vec3 cellSample = texture2D(tDiffuse, sampleUv).rgb;
        float cellLuma = getLuma(cellSample);

        float colSeed = hash21(vec2(cellId.x, 3.17));
        float rainWave = smoothstep(0.78, 1.0, sin(cellId.y * 0.28 + u_time * (3.0 + colSeed * 4.0) + colSeed * 20.0));
        float boostedLuma = clamp(cellLuma * (0.85 + dynInt * 0.7) + rainWave * 0.18 * dynInt + u_audio * 0.25, 0.0, 0.999);

        float glyphIdx = floor(boostedLuma * 15.999);
        vec2 atlasUv = vec2((glyphIdx + cellLocal.x) / 16.0, cellLocal.y);
        float glyphMask = texture2D(tAscii, atlasUv).r;

        vec3 bg = vec3(0.02, 0.024, 0.03) + cellSample * 0.08;
        vec3 asciiPalette = mix(u_colorB, u_color, smoothstep(0.32, 0.78, boostedLuma));
        vec3 glyphColor = mix(asciiPalette, cellSample * 1.35 + asciiPalette * 0.35, 0.35);
        if (boostedLuma > 0.86) glyphColor = mix(glyphColor, vec3(1.0), 0.45);

        float scan = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.5);
        finalColor = mix(bg, glyphColor * (1.15 + u_audio * 0.5), glyphMask) * scan;
    }
    // 09: THERMAL SGX
    else if (m == 9) {
        float t = clamp(luma + sin(u_time * 1.5 + uv.y * 4.0) * 0.04 * dynInt + u_audio * 0.15, 0.0, 1.0);
        vec3 c0 = vec3(0.02, 0.02, 0.03);
        vec3 c1 = vec3(0.196, 0.322, 0.482);
        vec3 c2 = u_colorB;
        vec3 c3 = u_color;
        vec3 c4 = vec3(1.0, 0.98, 0.89);
        vec3 heat = mix(c0, c1, smoothstep(0.0, 0.25, t));
        heat = mix(heat, c2, smoothstep(0.25, 0.52, t));
        heat = mix(heat, c3, smoothstep(0.52, 0.80, t));
        heat = mix(heat, c4, smoothstep(0.80, 1.0, t));
        float iso = 1.0 - smoothstep(0.0, 0.04, abs(fract(t * 7.0 * dynScale) - 0.5));
        finalColor = heat + vec3(0.15) * iso * dynInt;
    }
    // 10: SGX ENERGY (FBM Smoke + Holo Edge)
    else if (m == 10) {
        vec2 p = (uv - 0.5) * aspect * (2.2 * dynScale);
        float n1 = fbm5(p + vec2(u_time * 0.32, -u_time * 0.2));
        float n2 = fbm5(p * 1.6 + vec2(n1 * 2.0, u_time * 0.28));
        vec3 energyField = mix(u_colorB, u_color, smoothstep(0.28, 0.82, n2));
        float edge = sobelEdge(uv, px * 1.5);
        float holoScan = 0.88 + 0.12 * sin(uv.y * 260.0 - u_time * 6.0);
        float radialRim = smoothstep(0.22, 0.85, length(uv - 0.5));
        vec3 videoHolo = mix(texRgb * 0.45, energyField * (0.4 + luma * 1.15), clamp(dynInt * 0.82, 0.25, 0.92));
        finalColor = videoHolo * holoScan + u_colorB * edge * (1.2 + u_audio * 2.0) + energyField * radialRim * 0.28 * dynInt;
    }
    // 11: SGX TUNNEL (Polar Warp Tunnel)
    else if (m == 11) {
        vec2 p = (uv - 0.5) * aspect;
        float r = max(length(p), 0.035);
        float a = atan(p.y, p.x);
        float speed = u_time * 0.9 + u_audio * 0.8;
        vec2 tunnelUv = vec2(fract(a / 6.283185 + 0.5), fract(0.32 * dynScale / r + speed));
        vec3 vidTunnel = texture2D(tDiffuse, tunnelUv).rgb;
        float beams = smoothstep(0.82, 0.99, sin(a * 12.0 + u_time * 2.0)) * smoothstep(0.4, 0.95, fract(0.6 / r + speed * 1.6));
        float rings = smoothstep(0.90, 0.99, sin(1.8 * dynScale / r + speed * 6.2831));
        float depthFog = smoothstep(0.04, 0.48, r);
        vec3 beamCol = mix(u_colorB, u_color, rings);
        finalColor = (vidTunnel * 0.78 + beamCol * (beams * 0.75 + rings * 0.65) * (0.6 + dynInt)) * depthFog;
        finalColor += mix(u_color, u_colorB, 0.5) * (1.0 - depthFog) * (0.35 + u_audio * 0.9);
    }
    // 12: KALEIDO PRISM (N-Fold Mirror Symmetry + Bass Zoom)
    else if (m == 12) {
        vec2 p = (uv - 0.5) * aspect;
        float r = length(p);
        float segs = max(4.0, floor(4.0 + dynScale * 2.5) * 2.0);
        float sector = 6.283185 / segs;
        float a = atan(p.y, p.x) + u_time * (0.25 + dynInt * 0.45);
        a = mod(a, sector);
        a = abs(a - sector * 0.5);
        float zoom = 1.0 - u_audio * 0.25;
        vec2 kUv = fract(vec2(cos(a), sin(a)) * r * zoom / aspect + 0.5);
        vec3 kCol = texture2D(tDiffuse, kUv).rgb;
        float seam = smoothstep(0.03, 0.0, abs(a - sector * 0.5) * r);
        finalColor = mix(kCol, kCol * mix(u_color, u_colorB, r), dynInt * 0.55) + u_color * seam * 0.5;
    }
    // 13: HOLO WIRE (Holographic 3D Engineering Grid + Light Sweep)
    else if (m == 13) {
        float edge = sobelEdge(uv, px * 1.4);
        vec2 grid = abs(fract(uv * vec2(32.0, 18.0) * clamp(dynScale * 0.8, 0.4, 2.5) - 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.06, min(grid.x, grid.y));
        float sw = (uv.y - fract(u_time * 0.28)) * 12.0;
        float sweep = exp(-(sw * sw));
        vec3 holoBase = mix(vec3(0.02, 0.03, 0.05), u_colorB * luma * 0.75, 0.6);
        vec3 wire = u_colorB * edge * (1.8 + dynInt * 1.6) + u_color * sweep * (0.45 + edge * 1.4);
        finalColor = holoBase + wire + u_colorB * gridLine * 0.18 * (0.6 + luma);
    }
    // 14: PIXEL SORT (Directional Luminance Smear Trails)
    else if (m == 14) {
        float thresh = clamp(0.72 - dynInt * 0.52, 0.15, 0.85);
        vec3 acc = texRgb;
        if (luma > thresh) {
            float streak = (luma - thresh) * 0.18 * dynScale;
            vec3 s1 = texture2D(tDiffuse, vec2(uv.x, fract(uv.y - streak * 0.25))).rgb;
            vec3 s2 = texture2D(tDiffuse, vec2(uv.x, fract(uv.y - streak * 0.55))).rgb;
            vec3 s3 = texture2D(tDiffuse, vec2(uv.x, fract(uv.y - streak * 0.85))).rgb;
            vec3 s4 = texture2D(tDiffuse, vec2(uv.x, fract(uv.y - streak * 1.15))).rgb;
            acc = max(max(acc, s1), max(s2, max(s3, s4)));
            acc = mix(acc, acc * mix(u_color, u_colorB, uv.y), 0.35);
        }
        finalColor = acc;
    }
    // 15: CYBER INK (Duotone Risograph + Cross-Hatch + Bold Ink)
    else if (m == 15) {
        float edge = smoothstep(0.18, 0.48, sobelEdge(uv, px * 1.7));
        float hatchA = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / max(3.5, 8.0 / dynScale)));
        float hatchB = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y) / max(3.5, 8.0 / dynScale)));
        vec3 paper = vec3(0.04, 0.04, 0.05);
        vec3 mid = u_colorB * 0.85;
        vec3 high = u_color * 1.1;
        vec3 inkCol = paper;
        if (luma > 0.25) inkCol = mix(paper, mid, hatchA);
        if (luma > 0.48) inkCol = mid;
        if (luma > 0.65) inkCol = mix(mid, high, hatchB);
        if (luma > 0.82) inkCol = mix(high, vec3(1.0), 0.35);
        finalColor = mix(inkCol, vec3(0.01), edge * (0.75 + 0.25 * dynInt));
    }
    // 16: TESLA ARC (High-Voltage Branching Electricity + Edge Lightning)
    else if (m == 16) {
        float edge = sobelEdge(uv, px * 1.6);
        vec2 p = (uv - 0.5) * aspect;
        float tSnap = floor(u_time * 18.0) * 0.17 + u_time * 1.4;

        // Dual branching lightning bolts via sharp FBM ridges
        float warpA = fbm5(vec2(uv.x * (4.2 * dynScale), tSnap * 0.9)) - 0.5;
        float boltA = 1.0 / max(abs((uv.y - 0.5) + warpA * (0.65 + u_audio * 0.45)) * (26.0 - dynInt * 10.0), 0.015);
        boltA = pow(clamp(boltA * 0.16, 0.0, 1.4), 2.1);

        float warpB = fbm5(vec2(uv.y * (5.0 * dynScale) + 3.1, -tSnap * 1.15)) - 0.5;
        float boltB = 1.0 / max(abs((uv.x - 0.5) + warpB * (0.55 + u_audio * 0.4)) * (30.0 - dynInt * 10.0), 0.018);
        boltB = pow(clamp(boltB * 0.13, 0.0, 1.3), 2.3);

        // Surface electric veins clinging to subject silhouettes
        float ridge = 1.0 - abs(fbm5(p * (6.5 * dynScale) + vec2(tSnap, -tSnap * 0.7)) * 2.0 - 1.0);
        float edgeArc = pow(clamp(ridge, 0.0, 1.0), 7.0) * (0.45 + edge * 3.8);

        float totalArc = (boltA + boltB * 0.85 + edgeArc * (1.2 + dynInt)) * (0.65 + dynInt * 0.85 + u_audio * 1.4);
        vec3 darkBase = texRgb * 0.42 + u_colorB * edge * 0.35;
        vec3 corona = mix(u_colorB, u_color, clamp(boltA * 0.8, 0.0, 1.0)) * totalArc;
        vec3 hotCore = vec3(1.0) * smoothstep(0.95, 2.2, totalArc);
        finalColor = darkBase + corona + hotCore;
    }
    // 17: REACTOR PULSE (Hexagonal Energy Shield + Harmonic Core Shockwaves)
    else if (m == 17) {
        vec2 p = (uv - 0.5) * aspect;
        float dist = length(p);
        vec2 dir = dist > 0.0001 ? p / dist : vec2(0.0);

        // Multi-ring reactor pulse distortion
        float pulseWave = sin(dist * (16.0 * dynScale) - u_time * (5.0 + u_audio * 3.5));
        float ringGlow = pow(max(0.0, pulseWave), 5.0) * exp(-dist * 1.05);
        float subRing = pow(max(0.0, sin(dist * (32.0 * dynScale) - u_time * 8.0)), 8.0) * exp(-dist * 1.4);

        vec2 pUv = uv + (dir / aspect) * pulseWave * 0.022 * dynInt * exp(-dist * 1.2);
        vec3 warpedVid = texture2D(tDiffuse, pUv).rgb;

        // Crisp hexagonal energy lattice
        vec2 hp = p * (9.0 * clamp(dynScale, 0.45, 3.0));
        vec2 rHex = vec2(1.0, 1.73205);
        vec2 hHalf = rHex * 0.5;
        vec2 a = mod(hp, rHex) - hHalf;
        vec2 b = mod(hp - hHalf, rHex) - hHalf;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        float hexEdgeDist = 0.5 - max(dot(abs(gv), normalize(rHex)), abs(gv.x));
        float hexLine = 1.0 - smoothstep(0.015, 0.06, hexEdgeDist);

        float coreGlow = exp(-dist * (5.0 - dynInt * 2.0)) * (0.45 + u_audio * 1.3);
        vec3 hexColor = mix(u_colorB, u_color, ringGlow) * hexLine * (0.25 + ringGlow * 1.8 + u_audio * 1.2);
        vec3 waveColor = u_color * ringGlow * (0.85 + dynInt * 0.9) + u_colorB * subRing * 0.9;
        finalColor = warpedVid * (0.68 + ringGlow * 0.35) + hexColor + waveColor + mix(u_color, vec3(1.0), 0.5) * coreGlow;
    }
    // 18: MATERIALIZE (3D Holographic Assembly Scan + Voxel Dissolve Beam)
    else if (m == 18) {
        float edge = sobelEdge(uv, px * 1.5);
        float sweepCycle = 0.5 + 0.58 * sin(u_time * (0.62 + dynInt * 0.55));
        float dissolveNoise = (fbm5(uv * (5.5 * dynScale) + vec2(0.0, u_time * 0.35)) - 0.5) * 0.22;
        float signedDist = (uv.y + dissolveNoise) - sweepCycle;

        // Solid materialized zone vs wireframe blueprint zone
        float matMask = smoothstep(-0.025, 0.025, -signedDist);
        float sdLaser = signedDist * 28.0;
        float sdIon = signedDist * 9.0;
        float laserBand = exp(-(sdLaser * sdLaser));
        float ionization = exp(-(sdIon * sdIon));

        // Digital voxel particles erupting at the assembly frontier
        vec2 voxCell = floor(uv * (46.0 * clamp(dynScale, 0.5, 2.5)));
        float voxRnd = hash21(voxCell + floor(u_time * 10.0));
        float voxSpark = step(0.84, voxRnd) * ionization;

        // Blueprint wireframe ahead of the beam
        vec2 bpGrid = abs(fract(uv * vec2(32.0, 18.0) - 0.5) - 0.5);
        float bpLine = 1.0 - smoothstep(0.0, 0.055, min(bpGrid.x, bpGrid.y));
        float holoScan = 0.84 + 0.16 * sin(uv.y * 280.0 - u_time * 7.0);
        vec3 blueprint = vec3(0.02, 0.03, 0.05)
            + u_colorB * edge * (1.8 + u_audio * 1.8)
            + u_colorB * bpLine * 0.16
            + u_colorB * luma * 0.28;
        blueprint *= holoScan;

        // Solid materialized subject with slight energy sheen near the beam
        vec3 solid = texRgb + u_color * ionization * 0.32;
        vec3 beamCol = mix(u_color, vec3(1.0), 0.55) * laserBand * (1.7 + u_audio * 1.5);
        vec3 sparkCol = mix(u_color, u_colorB, voxRnd) * voxSpark * 1.6;

        finalColor = mix(blueprint, solid, matMask) + beamCol + sparkCol;
    }
    // 19: PLASMA SURGE (Multi-Layer Energy Storm + Fresnel Silhouette Aura)
    else if (m == 19) {
        vec2 p = (uv - 0.5) * aspect * (2.4 * dynScale);
        float edge = sobelEdge(uv, px * 1.8);

        // Counter-rotating turbulent plasma layers
        float ang1 = u_time * 0.35;
        mat2 rot1 = mat2(cos(ang1), -sin(ang1), sin(ang1), cos(ang1));
        float ang2 = -u_time * 0.48;
        mat2 rot2 = mat2(cos(ang2), -sin(ang2), sin(ang2), cos(ang2));

        float f1 = fbm5(rot1 * p + vec2(u_time * 0.45, -u_time * 0.3));
        float f2 = fbm5(rot2 * p * 1.5 + vec2(f1 * 2.4, u_time * 0.5));
        float filament = pow(clamp(1.0 - abs(f2 * 2.0 - 1.0), 0.0, 1.0), 4.5);

        vec2 surgeOffset = (vec2(f1, f2) - 0.5) * 0.065 * (dynInt + u_audio * 0.6);
        vec3 warped = vec3(
            texture2D(tDiffuse, fract(uv + surgeOffset * 1.2)).r,
            texture2D(tDiffuse, fract(uv + surgeOffset)).g,
            texture2D(tDiffuse, fract(uv + surgeOffset * 0.8)).b
        );

        vec3 plasmaCol = mix(u_colorB, u_color, smoothstep(0.25, 0.78, f1));
        vec3 aura = mix(u_color, u_colorB, f2) * edge * (1.8 + dynInt * 1.4 + u_audio * 2.0);
        vec3 surgeCore = (plasmaCol * 1.3 + vec3(0.45)) * filament * (0.9 + dynInt + u_audio * 1.6);

        finalColor = mix(warped * 0.55, warped * 0.35 + plasmaCol * (0.45 + luma * 0.85), clamp(dynInt * 0.68, 0.2, 0.82)) + aura + surgeCore;
    }
    // 20: ANIME CEL (Studio Cel-Shading + Crisp Ink Lineart + Rim Kick + Sakuga Speed-Lines)
    else if (m == 20) {
        vec2 blurStep = px * clamp(1.2 + dynScale * 0.55, 1.0, 2.8);
        vec3 cC = texRgb;
        vec3 cL = texture2D(tDiffuse, uv - vec2(blurStep.x, 0.0)).rgb;
        vec3 cR = texture2D(tDiffuse, uv + vec2(blurStep.x, 0.0)).rgb;
        vec3 cU = texture2D(tDiffuse, uv + vec2(0.0, blurStep.y)).rgb;
        vec3 cD = texture2D(tDiffuse, uv - vec2(0.0, blurStep.y)).rgb;

        // Edge-preserving bilateral cross smooth for clean hand-painted cel fills
        float wL = exp(-dot(cL - cC, cL - cC) * 18.0);
        float wR = exp(-dot(cR - cC, cR - cC) * 18.0);
        float wU = exp(-dot(cU - cC, cU - cC) * 18.0);
        float wD = exp(-dot(cD - cC, cD - cC) * 18.0);
        vec3 smoothCol = (cC + cL * wL + cR * wR + cU * wU + cD * wD) / (1.0 + wL + wR + wU + wD);

        float smLuma = getLuma(smoothCol);
        vec3 satCol = clamp(mix(vec3(smLuma), smoothCol, 1.42 + dynInt * 0.32), 0.0, 1.0);

        // 3-step studio cel bands with cool anime shadow shift + warm key highlight
        float bShadow = smoothstep(0.24, 0.29, smLuma);
        float bMid = smoothstep(0.54, 0.59, smLuma);
        float bSpec = smoothstep(0.79, 0.84, smLuma);

        vec3 shadowTint = mix(vec3(0.09, 0.11, 0.24), u_colorB * 0.38, 0.35);
        vec3 celCol = mix(satCol * 0.55 + shadowTint * 0.45, satCol * 1.06, bShadow);
        celCol = mix(celCol, satCol * 1.24 + u_color * 0.08, bMid);
        celCol = mix(celCol, mix(satCol * 1.38, vec3(1.0, 0.98, 0.94), 0.45), bSpec);

        // Crisp ink lineart + backlit anime rim highlight
        float rawEdge = sobelEdge(uv, px * clamp(1.15 + dynScale * 0.35, 1.0, 2.4));
        float inkLine = smoothstep(0.24 - dynInt * 0.08, 0.48 - dynInt * 0.08, rawEdge);
        float rimKick = smoothstep(0.14, 0.36, rawEdge) * smoothstep(0.45, 0.82, smLuma);
        celCol += mix(u_color, u_colorB, 0.45) * rimKick * (0.45 + u_audio * 0.95);

        // 12fps sakuga radial action speed-lines on frame perimeter
        vec2 p = (uv - 0.5) * aspect;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float sakugaTick = floor(u_time * 12.0);
        float rayBucket = floor((ang + 3.1415926) * 28.0);
        float rayRnd = hash21(vec2(rayBucket, sakugaTick));
        float raySharp = smoothstep(0.68, 0.98, sin(ang * 56.0 + rayRnd * 6.28318));
        float speedZone = smoothstep(0.38 - u_audio * 0.12, 0.86, r);
        float speedLines = raySharp * step(0.56 - dynInt * 0.28 - u_audio * 0.25, rayRnd) * speedZone;

        vec3 inkCol = vec3(0.04, 0.035, 0.08);
        finalColor = mix(celCol, inkCol, inkLine * 0.92);
        finalColor = mix(finalColor, mix(vec3(1.0), u_color, 0.35), speedLines * (0.35 + dynInt * 0.45 + u_audio * 0.4));
    }
    // 21: MANGA PANEL (Sumi Ink G-Pen Contours + 45° Screentone Dots + Shuchusen Focus Lines)
    else if (m == 21) {
        // Authentic print paper & jet sumi ink palette
        vec3 paperCol = vec3(0.955, 0.945, 0.91);
        vec3 sumiInk = vec3(0.035, 0.035, 0.048);

        // Slight contrast curve for dramatic black-and-white manga readability
        float mLuma = smoothstep(0.08, 0.92, luma);

        // 45-degree rotated screentone Ben-Day grid
        float dotPitch = max(3.2, 6.4 / clamp(dynScale, 0.45, 2.8));
        mat2 rot45 = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678);
        vec2 toneCoord = rot45 * gl_FragCoord.xy;
        vec2 cellUv = fract(toneCoord / dotPitch) - 0.5;
        float dotDist = length(cellUv);

        // Fine parallel hatching for deep shadow tones
        float hatchLine = smoothstep(0.32, 0.46, abs(fract(toneCoord.x / (dotPitch * 0.85)) - 0.5));

        // Multi-band manga shading: solid sumi -> dark hatch+tone -> screentone -> paper white
        float inkFill = 0.0;
        if (mLuma < 0.20 + dynInt * 0.06) {
            inkFill = 1.0;
        } else if (mLuma < 0.44 + dynInt * 0.06) {
            float rDot = mix(0.46, 0.28, (mLuma - 0.20) / 0.24);
            float dotMask = 1.0 - smoothstep(rDot - 0.07, rDot + 0.07, dotDist);
            inkFill = max(dotMask, (1.0 - hatchLine) * 0.72);
        } else if (mLuma < 0.72) {
            float rDot = mix(0.31, 0.08, (mLuma - 0.44) / 0.28);
            inkFill = 1.0 - smoothstep(rDot - 0.06, rDot + 0.06, dotDist);
        }

        // Dual-scale G-pen expressive ink lineart (crisp detail + bold silhouettes)
        float fineEdge = sobelEdge(uv, px * 1.15);
        float boldEdge = sobelEdge(uv, px * clamp(2.1 + dynScale * 0.35, 1.8, 3.4));
        float gPenLine = max(
            smoothstep(0.22, 0.44, fineEdge),
            smoothstep(0.34 - dynInt * 0.1, 0.62 - dynInt * 0.1, boldEdge)
        );

        // Shuchusen (radial manga concentration / impact ink lines)
        vec2 p = (uv - 0.5) * aspect;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float mangaTick = floor(u_time * 10.0);
        float wedgeBucket = floor((ang + 3.1415926) * 42.0);
        float wRnd = hash21(vec2(wedgeBucket, mangaTick));
        float innerReach = 0.42 + wRnd * 0.28 - dynInt * 0.14 - u_audio * 0.18;
        float wedgeMask = smoothstep(innerReach, innerReach + 0.24, r);
        float needle = smoothstep(0.62, 0.94, abs(sin(ang * 42.0 + wRnd * 3.14159)));
        float shuchusen = wedgeMask * needle * step(0.38 - dynInt * 0.18, wRnd);

        // Clean manga panel ink gutter border
        vec2 borderDist = min(vUv, 1.0 - vUv);
        float panelGutter = 1.0 - smoothstep(0.012, 0.015, min(borderDist.x, borderDist.y));
        float panelRule = smoothstep(0.014, 0.016, min(borderDist.x, borderDist.y)) * (1.0 - smoothstep(0.020, 0.022, min(borderDist.x, borderDist.y)));

        float totalInk = clamp(max(max(inkFill, gPenLine), max(shuchusen * 0.92, panelRule)), 0.0, 1.0);
        vec3 page = mix(paperCol, sumiInk, totalInk);
        page = mix(page, paperCol, panelGutter);

        // Subtle optional accent impact tint on heavy audio beats (stays crisp manga print)
        float beatSlash = shuchusen * u_audio * 0.55;
        page = mix(page, u_color, clamp(beatSlash, 0.0, 0.45));

        finalColor = page;
    }
    // 22: CARTOON DOODLE (Hand-Drawn Boiling Lines + Controllable Thickness u_scale & Ink Color u_color)
    else if (m == 22) {
        // 8fps boiling-line sketchbook wobble for authentic hand-drawn cartoon feel
        float boilTick = floor(u_time * 8.0);
        vec2 wobble = (vec2(
            fbm5(uv * 16.0 + vec2(boilTick * 0.73, 1.3)),
            fbm5(uv * 16.0 + vec2(4.7, boilTick * 0.61))
        ) - 0.5) * px * (2.6 + dynInt * 3.8);
        vec2 dUv = clamp(uv + wobble, 0.001, 0.999);

        // Softened 4-level vibrant cartoon cel fill
        vec3 dCol = texture2D(tDiffuse, dUv).rgb;
        float dLuma = getLuma(dCol);
        vec3 vivid = clamp(mix(vec3(dLuma), dCol, 1.55), 0.0, 1.0);
        vec3 toonFill = floor(vivid * 4.0 + 0.5) / 4.0;

        // Sketchbook marker scribble shading in mid-shadows
        float scribbleA = sin((gl_FragCoord.x + gl_FragCoord.y) * 0.62 + wobble.x * 120.0);
        float scribbleB = sin((gl_FragCoord.x - gl_FragCoord.y) * 0.58 - wobble.y * 120.0);
        float shadowHatch = smoothstep(0.42, 0.14, dLuma) * smoothstep(0.15, 0.75, scribbleA);
        float deepHatch = smoothstep(0.24, 0.06, dLuma) * smoothstep(0.2, 0.8, scribbleB);
        float hatchAmt = max(shadowHatch * 0.55, deepHatch * 0.82);

        // Blend between vibrant Saturday-morning cartoon and clean tinted doodle notebook via dynInt
        vec3 doodlePaper = mix(u_colorB, u_colorB * 0.85 + toonFill * 0.35, 0.45);
        vec3 baseFill = mix(toonFill, doodlePaper, clamp(dynInt * 0.78, 0.0, 0.82));
        baseFill = mix(baseFill, u_color, hatchAmt * (0.28 + dynInt * 0.35));

        // Variable-thickness marker outline controlled directly by u_scale (0.2 -> 5.0)
        float strokePx = clamp(0.65 + u_scale * 1.35 + u_audio * 1.3, 0.65, 8.2);
        float edgeInner = sobelEdge(dUv, px * max(0.85, strokePx * 0.45));
        float edgeOuter = sobelEdge(dUv, px * strokePx);
        float edgeMid = sobelEdge(dUv, px * (strokePx * 0.75));
        float combinedEdge = max(edgeInner, max(edgeMid, edgeOuter * 0.95));

        // Crisp anti-aliased marker ink mask using u_color
        float lineThresh = clamp(0.32 - (u_scale * 0.025), 0.14, 0.34);
        float inkMask = smoothstep(lineThresh, lineThresh + 0.18, combinedEdge);
        finalColor = mix(baseFill, u_color, inkMask);
    }
    // 23: SGX BLUEPRINT (Spatialgineers Architectural CAD Grid + Topographic Contours + Gold Telemetry Sweep)
    else if (m == 23) {
        vec3 draftBg = vec3(0.028, 0.062, 0.115);
        float edgeTight = sobelEdge(uv, px * 1.2);
        float edgeBold = sobelEdge(uv, px * 2.2);

        // Dual-scale precision CAD millimeter + centimeter grid
        float gridScale = clamp(dynScale, 0.5, 3.0);
        vec2 fineG = abs(fract(uv * vec2(64.0, 36.0) * gridScale - 0.5) - 0.5);
        vec2 majorG = abs(fract(uv * vec2(16.0, 9.0) * gridScale - 0.5) - 0.5);
        float fineLine = 1.0 - smoothstep(0.0, 0.045, min(fineG.x, fineG.y));
        float majorLine = 1.0 - smoothstep(0.0, 0.035, min(majorG.x, majorG.y));

        // 45-degree SGX chamfer crosshairs at major intersections
        vec2 retCell = abs(fract(uv * vec2(8.0, 4.5) - 0.5) - 0.5);
        float retCross = (1.0 - smoothstep(0.0, 0.025, min(retCell.x, retCell.y))) * step(max(retCell.x, retCell.y), 0.12);

        // Luminance elevation contours + golden telemetry scan beam
        float elev = smoothstep(0.86, 0.98, abs(sin(luma * (16.0 + dynInt * 14.0))));
        float sweepX = fract(u_time * 0.22);
        float swD = (uv.x - sweepX) * 20.0;
        float sweepBeam = exp(-(swD * swD));

        vec3 blueprint = draftBg
            + u_colorB * fineLine * 0.09
            + u_colorB * majorLine * 0.22
            + u_colorB * luma * 0.34
            + mix(u_colorB, vec3(1.0), 0.55) * (edgeTight * 1.35 + edgeBold * 0.65) * (0.85 + dynInt * 0.85)
            + u_colorB * elev * 0.28 * dynInt
            + u_color * (retCross * 0.55 + sweepBeam * (0.45 + edgeTight * 1.8 + u_audio * 1.4));

        finalColor = blueprint;
    }
    // 24: SGX OVERDRIVE (Signature 45° Diamond Prism Mosaic + Dual Gold/Cyan Plasma Beams + Bass Shockwaves)
    else if (m == 24) {
        vec2 p = (uv - 0.5) * aspect;
        float r = length(p);

        // Iconic SGX 45-degree rotated diamond facet tessellation
        mat2 rot45 = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678);
        vec2 dGrid = rot45 * p * (10.0 * clamp(dynScale, 0.5, 2.8));
        vec2 dCell = floor(dGrid);
        vec2 dLocal = fract(dGrid) - 0.5;
        float diamondEdge = 1.0 - smoothstep(0.41, 0.48, max(abs(dLocal.x), abs(dLocal.y)));
        float facetRnd = hash21(dCell);

        // Subtle prismatic facet refraction + bass shockwave
        float shock = sin(r * 18.0 - u_time * (5.5 + u_audio * 3.0)) * exp(-r * 1.15);
        vec2 facetUv = uv + (dLocal * 0.014 * dynInt) + normalize(p + 0.0001) * shock * (0.012 + u_audio * 0.025);

        vec3 colR = texture2D(tDiffuse, clamp(facetUv + vec2(0.005 * dynInt, 0.0), 0.0, 1.0)).rgb;
        vec3 colG = texture2D(tDiffuse, clamp(facetUv, 0.0, 1.0)).rgb;
        vec3 colB = texture2D(tDiffuse, clamp(facetUv - vec2(0.005 * dynInt, 0.0), 0.0, 1.0)).rgb;
        vec3 prismVid = vec3(colR.r, colG.g, colB.b);

        // Sweeping 45° diagonal SGX energy beams
        float diagPos = fract((uv.x + uv.y) * 0.65 - u_time * 0.35);
        float diagDist = (diagPos - 0.5) * 14.0;
        float diagBeam = exp(-(diagDist * diagDist));

        float edge = sobelEdge(facetUv, px * 1.65);
        float ringPulse = max(0.0, shock);
        vec3 sgxEdgeCol = mix(u_color, u_colorB, smoothstep(0.25, 0.75, facetRnd + sin(u_time + r * 3.0) * 0.25));

        finalColor = prismVid * (0.72 + ringPulse * 0.35)
            + sgxEdgeCol * edge * (1.55 + dynInt * 1.4 + u_audio * 1.6)
            + mix(u_color, u_colorB, 0.5) * (1.0 - diamondEdge) * (0.22 + ringPulse * 0.75 + u_audio * 0.65)
            + u_color * diagBeam * (0.32 + edge * 1.1 + u_audio * 0.9);
    }

    return finalColor;
}

void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);

    // Stackable Mirror / Symmetry Modifier
    if (u_mirror == 1) {
        uv.x = abs(uv.x - 0.5) * 2.0;
        uv.x = 1.0 - uv.x * 0.5;
    } else if (u_mirror == 2) {
        uv = abs(uv - 0.5) * 2.0;
        uv = 1.0 - uv * 0.5;
    }

    // Interactive Pointer Shockwave Ripple
    float rippleRing = 0.0;
    if (u_lite == 0 && u_rippleAge < 1.35) {
        vec2 rp = (uv - u_pointer) * aspect;
        float rDist = length(rp);
        float front = u_rippleAge * 1.15;
        float rd = (rDist - front) * 14.0;
        float band = exp(-(rd * rd)) * (1.0 - u_rippleAge / 1.35);
        vec2 rDir = rDist > 0.0001 ? rp / rDist : vec2(0.0);
        uv += (rDir / aspect) * band * 0.045;
        rippleRing = band;
    }

    // Momentary Glitch Punch displacement
    if (u_lite == 0 && u_punch > 0.01) {
        float slice = floor(uv.y * 28.0);
        float jitter = (hash21(vec2(slice, floor(u_time * 30.0))) - 0.5) * 0.14 * u_punch;
        uv.x = fract(uv.x + jitter);
    }

    vec4 texColor = texture2D(tDiffuse, uv);

    if (u_lite == 1) {
        vec3 liteCol = mix(texColor.rgb, 1.0 - texColor.rgb, u_invert);
        gl_FragColor = vec4(liteCol, 1.0);
        return;
    }

    float dynInt = u_intensity + (u_audio * 1.35) + (u_punch * 0.65);
    float dynScale = u_scale + (u_audio * 0.4);
    vec2 px = vec2(1.0) / max(u_resolution, vec2(640.0, 360.0));
    float luma = getLuma(texColor.rgb);

    vec3 colorA = evalEffect(u_mode, uv, px, aspect, texColor.rgb, luma, dynInt, dynScale);
    vec3 finalColor = colorA;

    // Dual-FX Strict Stencil Mask / Translucent Holographic Overlay
    if (u_maskActive == 1) {
        vec2 mCenter = (vUv - 0.5) * vec2(aspect.x / max(u_maskAspect, 0.2), 1.0);
        float mZoom = max(u_maskScale * (1.0 + u_audio * 0.14 * float(u_maskPulse)), 0.08);
        vec2 mUv = mCenter / mZoom + 0.5;
        float inBounds = step(0.0, mUv.x) * step(mUv.x, 1.0) * step(0.0, mUv.y) * step(mUv.y, 1.0);
        vec4 maskSample = texture2D(tMask, clamp(mUv, 0.001, 0.999));
        float maskAlpha = clamp(maskSample.a * inBounds, 0.0, 1.0);

        vec2 mPx = vec2(2.0 / 512.0);
        float mL = texture2D(tMask, clamp(mUv - vec2(mPx.x, 0.0), 0.001, 0.999)).a * inBounds;
        float mR = texture2D(tMask, clamp(mUv + vec2(mPx.x, 0.0), 0.001, 0.999)).a * inBounds;
        float mU = texture2D(tMask, clamp(mUv + vec2(0.0, mPx.y), 0.001, 0.999)).a * inBounds;
        float mD = texture2D(tMask, clamp(mUv - vec2(0.0, mPx.y), 0.001, 0.999)).a * inBounds;
        float maskRim = clamp((abs(mR - mL) + abs(mU - mD)) * 1.15, 0.0, 1.0);

        if (u_modeB >= 0) {
            // Strict stencil cut: 100% colorB inside mask, 100% colorA outside (never blended together)
            float hardCut = smoothstep(0.06, 0.22, maskAlpha);
            float regionStencil = (u_maskInvert == 1) ? (1.0 - hardCut) : hardCut;
            vec3 colorB = evalEffect(u_modeB, uv, px, aspect, texColor.rgb, luma, dynInt, dynScale);
            finalColor = mix(colorA, colorB, regionStencil);
            finalColor += mix(u_color, u_colorB, 0.5) * maskRim * (0.35 + u_audio * 0.75) * u_maskOpacity;
        } else {
            vec3 tintedLogo = mix(maskSample.rgb, maskSample.rgb * mix(vec3(1.0), u_color * 1.15, 0.35), 0.45);
            if (u_maskInvert == 1) {
                vec3 outerVeil = mix(colorA, colorA * 0.45 + u_colorB * 0.45, 0.55);
                finalColor = mix(colorA, outerVeil, (1.0 - maskAlpha) * u_maskOpacity * 0.72);
                finalColor += mix(u_color, u_colorB, 0.5) * maskRim * (0.24 + u_audio * 0.55) * u_maskOpacity;
            } else {
                float overlayMix = clamp(maskAlpha * u_maskOpacity * 0.78, 0.0, 0.88);
                vec3 glassOverlay = max(tintedLogo, colorA * 0.42) + colorA * 0.28;
                finalColor = mix(colorA, glassOverlay, overlayMix);
                finalColor += mix(u_color, u_colorB, 0.5) * maskRim * (0.22 + u_audio * 0.5) * u_maskOpacity;
            }
        }
    }

    // Interactive ripple highlight ring
    finalColor += mix(u_colorB, u_color, 0.5) * rippleRing * 0.65;

    // Momentary Glitch Punch chromatic flash
    if (u_punch > 0.01) {
        vec3 punchFlash = mix(u_color, u_colorB, step(0.5, fract(u_time * 12.0)));
        finalColor = mix(finalColor, 1.0 - finalColor, u_punch * 0.35) + punchFlash * u_punch * 0.32;
    }

    // Split-screen laser divider for dual PeerJS cameras
    if (u_splitscreen == 1) {
        float distToCenter = abs(uv.x - 0.5);
        if (distToCenter < 0.004) {
            float pulseLine = 0.55 + 0.45 * sin(uv.y * 40.0 + u_time * 8.0);
            finalColor = mix(finalColor, u_color * 1.8, pulseLine);
        }
    }

    // Soft bloom lift + Invert modifier (gentler on Manga & Cartoon Doodle)
    float brightMask = smoothstep(0.55, 1.0, getLuma(finalColor));
    bool isPrintMode = (u_mode == 21 || u_mode == 22) && (u_maskActive == 0 || u_modeB == -1 || u_modeB == 21 || u_modeB == 22);
    float bloomFactor = isPrintMode ? u_bloom * 0.16 : u_bloom * 0.75;
    finalColor += finalColor * brightMask * bloomFactor;
    finalColor = mix(finalColor, 1.0 - clamp(finalColor, 0.0, 1.0), u_invert);

    // SGX Grade Pass: film grain + cinema vignette (gentler on Manga & Cartoon Doodle)
    float grain = (hash21(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * 0.032;
    float vig = 1.0 - smoothstep(0.58, 1.12, length((vUv - 0.5) * vec2(1.12, 1.04)));
    float vigFloor = isPrintMode ? 0.92 : 0.78;
    finalColor = clamp(finalColor * mix(vigFloor, 1.0, vig) + grain, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;
