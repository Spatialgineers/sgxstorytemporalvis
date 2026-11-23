export const TEMPORAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const TEMPORAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform sampler2D tMask;
  uniform float u_time;
  uniform float u_decade;
  uniform float u_variant;
  uniform float u_intensity;
  uniform float u_scale;
  uniform float u_grain;
  uniform vec2 u_resolution;
  uniform float u_mediaAspect;
  uniform float u_flip;
  uniform vec3 u_tintColor;
  uniform float u_tintPower;
  uniform float u_splitEnabled;
  uniform float u_splitMode; // 0=1x, 1=ab, 2=2xV, 3=3x, 4=4x, 5=2xH, 6=6x(3x2), 7=9x(3x3), 8=mask
  uniform float u_splitX;
  uniform float u_splitY;
  uniform float u_zoneDecades[9];
  uniform float u_zoneVariants[9];
  uniform float u_activeZone;
  uniform float u_maskAspect;
  uniform float u_maskScale;
  uniform vec2 u_maskOffset;
  uniform float u_maskInvert;
  uniform float u_maskFeather;
  uniform float u_maskEdge;
  uniform vec3 u_maskEdgeColor;
  uniform float u_lite;
  uniform float u_warp;
  uniform float u_warpDir;
  uniform float u_frameRatio;

  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float getLuma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  vec2 coverUv(vec2 uv, float mediaAspect, float viewAspect) {
    vec2 outUv = uv;
    if (viewAspect > mediaAspect) {
      float scaleY = mediaAspect / viewAspect;
      outUv.y = (uv.y - 0.5) * scaleY + 0.5;
    } else {
      float scaleX = viewAspect / mediaAspect;
      outUv.x = (uv.x - 0.5) * scaleX + 0.5;
    }
    return clamp(outUv, 0.001, 0.999);
  }

  vec3 rgbSplit(sampler2D tex, vec2 uv, float amount) {
    float r = texture2D(tex, clamp(vec2(uv.x + amount, uv.y), 0.001, 0.999)).r;
    float g = texture2D(tex, clamp(uv, 0.001, 0.999)).g;
    float b = texture2D(tex, clamp(vec2(uv.x - amount, uv.y), 0.001, 0.999)).b;
    return vec3(r, g, b);
  }

  // Constant-index array lookup for 100% WebGL1 & WebGL2 compatibility
  vec2 getZoneEra(int z) {
    if (z == 0) return vec2(u_zoneDecades[0], u_zoneVariants[0]);
    if (z == 1) return vec2(u_zoneDecades[1], u_zoneVariants[1]);
    if (z == 2) return vec2(u_zoneDecades[2], u_zoneVariants[2]);
    if (z == 3) return vec2(u_zoneDecades[3], u_zoneVariants[3]);
    if (z == 4) return vec2(u_zoneDecades[4], u_zoneVariants[4]);
    if (z == 5) return vec2(u_zoneDecades[5], u_zoneVariants[5]);
    if (z == 6) return vec2(u_zoneDecades[6], u_zoneVariants[6]);
    if (z == 7) return vec2(u_zoneDecades[7], u_zoneVariants[7]);
    return vec2(u_zoneDecades[8], u_zoneVariants[8]);
  }

  // Aspect-correct contain sampling for arbitrary transparent PNG/WebP/SVG masks
  float sampleMaskAlpha(vec2 screenUv, float viewAspect) {
    vec2 p = screenUv - (vec2(0.5) + u_maskOffset);
    float mAspect = max(u_maskAspect, 0.05);
    if (viewAspect > mAspect) {
      p.x *= viewAspect / mAspect;
    } else {
      p.y *= mAspect / viewAspect;
    }
    p /= max(u_maskScale, 0.12);
    vec2 mUv = p + 0.5;
    if (mUv.x < 0.0 || mUv.x > 1.0 || mUv.y < 0.0 || mUv.y > 1.0) {
      return 0.0;
    }
    return texture2D(tMask, mUv).a;
  }

  // =========================================================================
  // 16-ERA TEMPORAL PIPELINE (1890s -> 2090s) WITH 3 VARIANTS PER ERA
  // =========================================================================
  vec3 evalTemporalEra(
    float activeDecade,
    float v,
    vec3 rawColor,
    vec2 uv,
    vec2 screenUv,
    float viewAspect,
    float time,
    float inten,
    float sc,
    float grainAmt,
    float filmNoise
  ) {
    vec3 color = rawColor;
    float luma = getLuma(color);
    vec3 finalColor = color;

    if (activeDecade < 1900.0) {
      // 1890s: Wet-Plate Daguerreotype / Cyanotype / Albumen
      float plateGrain = (hash12(floor(uv * u_resolution * 0.35) + 13.7) - 0.5) * 0.22;
      float edgeDist = length((screenUv - 0.5) * vec2(1.05, 1.15));
      float chemBurn = smoothstep(0.76, 0.32, edgeDist + plateGrain * 0.35 * sc);
      float silver = smoothstep(0.06, 0.94, pow(luma, 0.92));

      vec3 palette;
      if (v < 0.5) {
        palette = vec3(silver * 0.92, silver * 0.93, silver * 0.97);
      } else if (v < 1.5) {
        palette = mix(vec3(0.03, 0.11, 0.24), vec3(0.86, 0.93, 0.98), silver);
      } else {
        palette = mix(vec3(0.14, 0.08, 0.04), vec3(0.97, 0.88, 0.72), silver);
      }
      finalColor = mix(color, palette, clamp(inten, 0.0, 1.15));
      finalColor += (filmNoise * 0.18 + plateGrain * 0.25) * grainAmt * inten;
      finalColor *= mix(1.0, chemBurn, clamp(0.85 * inten, 0.0, 1.0));
    }
    else if (activeDecade < 1915.0) {
      // 1910s: Silent Cinema & Hand-Crank 16fps Iris
      float crank = floor(time * 16.0);
      float flicker = 1.0 + (hash12(vec2(crank, 4.1)) - 0.5) * 0.14 * inten;
      float bw = clamp((luma - 0.48) * (1.15 + 0.55 * inten) + 0.48, 0.0, 1.0) * flicker;

      vec3 bath = vec3(bw);
      if (v > 0.5 && v < 1.5) {
        bath = vec3(1.18, 0.94, 0.62) * bw;
      } else if (v >= 1.5) {
        bath = vec3(0.55, 0.76, 1.15) * bw;
      }

      float dust = step(0.9965, hash12(floor(uv * 220.0 * sc) + crank));
      float iris = smoothstep(0.84 - 0.1 * min(inten, 1.5), 0.34, length(screenUv - 0.5));
      finalColor = mix(color, bath, clamp(inten, 0.0, 1.15));
      finalColor -= dust * 0.35 * inten;
      finalColor += filmNoise * 0.24 * grainAmt * inten;
      finalColor *= mix(1.0, iris, 0.85);
    }
    else if (activeDecade < 1925.0) {
      // 1920s: Expressionist Ortho & Silver Halo
      float ortho = dot(color, vec3(0.20, 0.65, 0.15));
      float contrast = (v < 0.5) ? (1.2 + 0.95 * inten) : (v < 1.5 ? 1.15 + 0.65 * inten : 0.95 + 0.35 * inten);
      float bw = clamp((ortho - 0.47) * contrast + 0.49, 0.0, 1.0);
      float halo = smoothstep(0.62, 1.0, ortho) * (v >= 1.5 ? 0.38 : 0.20) * inten;
      vec3 silverTone = vec3(bw + halo) * vec3(0.96, 0.97, 1.02);

      float irisRadius = (v > 0.5 && v < 1.5) ? 0.56 : 0.88;
      float vignette = smoothstep(irisRadius + 0.25, irisRadius - 0.26, length(screenUv - 0.5));
      finalColor = mix(color, silverTone, clamp(inten, 0.0, 1.1));
      finalColor += filmNoise * 0.22 * grainAmt * inten;
      finalColor *= mix(1.0, vignette, 0.9);
    }
    else if (activeDecade < 1935.0) {
      // 1930s: Nitrate Celluloid & Sepia
      float jitterChance = (v > 0.5 && v < 1.5) ? 0.20 : 0.09;
      float jitterGate = step(1.0 - jitterChance * inten, fract(time * 2.2));
      vec2 jUv = uv;
      jUv.y = clamp(uv.y + jitterGate * (hash12(vec2(floor(time * 18.0), 1.7)) - 0.5) * 0.04 * sc, 0.001, 0.999);
      color = texture2D(tDiffuse, jUv).rgb;
      luma = getLuma(color);
      float flicker = 1.0 + sin(time * 31.0) * 0.045 * inten;
      vec3 sepiaTint = (v >= 1.5) ? vec3(1.22, 1.04, 0.78) : vec3(1.16, 0.96, 0.72);
      vec3 sepia = sepiaTint * pow(luma, 0.94) * flicker;
      finalColor = mix(color, sepia, clamp(inten, 0.0, 1.3));

      float scratchThresh = (v > 0.5 && v < 1.5) ? 0.985 : 0.993;
      float scratchLane = hash12(vec2(floor(jUv.x * 160.0 * sc), floor(time * 12.0)));
      float scratchMask = step(scratchThresh - 0.004 * inten, scratchLane);
      finalColor += vec3(0.24, 0.21, 0.16) * scratchMask * inten;
      finalColor += filmNoise * 0.22 * grainAmt * inten;
      finalColor *= smoothstep(1.38, 0.35 - 0.12 * min(inten, 1.5), length(screenUv - 0.5));
    }
    else if (activeDecade < 1945.0) {
      // 1940s: Noir Monochrome
      float ortho = dot(color, vec3(0.24, 0.62, 0.14));
      float contrast = (v < 0.5) ? (1.1 + 1.05 * inten) : (1.0 + 0.72 * inten);
      float bw = smoothstep(0.03, 0.97, clamp((ortho - 0.46) * contrast + 0.48, 0.0, 1.0));
      vec3 tint = (v >= 1.5) ? vec3(1.03, 0.99, 0.93) : vec3(0.97, 0.98, 1.02);
      float grainBoost = (v > 0.5 && v < 1.5) ? 0.48 : 0.30;
      finalColor = mix(color, vec3(bw) * tint, clamp(inten, 0.0, 1.05));
      finalColor += filmNoise * grainBoost * grainAmt * inten;
      finalColor *= smoothstep(1.22, 0.28, length(screenUv - 0.5));
    }
    else if (activeDecade < 1955.0) {
      // 1950s: Technicolor 2-Strip
      vec3 twoStrip;
      if (v < 0.5) {
        twoStrip = vec3(color.r * 1.18 + color.g * 0.08, color.g * 1.04 + color.b * 0.12, color.g * 0.32 + color.b * 0.68);
      } else if (v < 1.5) {
        twoStrip = vec3(color.r * 1.28, color.g * 0.95 + color.b * 0.25, color.b * 0.90 + color.g * 0.22);
      } else {
        twoStrip = mix(vec3(0.95, 0.90, 0.84), color * vec3(1.12, 1.06, 0.96), 0.72);
      }
      twoStrip = mix(vec3(getLuma(twoStrip)), twoStrip, 1.0 + 0.45 * inten);
      finalColor = mix(color, twoStrip, clamp(inten, 0.0, 1.25));
      finalColor += filmNoise * 0.14 * grainAmt * inten;
      finalColor *= smoothstep(1.45, 0.45, length(screenUv - 0.5));
    }
    else if (activeDecade < 1965.0) {
      // 1960s: Warm Kodachrome / Ektachrome / Instant 68
      vec3 koda = color;
      if (v < 0.5) {
        koda.r = pow(koda.r, 0.92) * (1.0 + 0.14 * inten);
        koda.g = pow(koda.g, 0.98) * (1.0 + 0.04 * inten);
        koda.b = pow(koda.b, 1.08) * (1.0 - 0.16 * inten);
      } else if (v < 1.5) {
        koda.r = pow(koda.r, 0.95) * (1.0 + 0.09 * inten);
        koda.g = pow(koda.g, 0.96) * (1.0 + 0.08 * inten);
        koda.b = mix(koda.b + 0.08, koda.b * 0.92, luma);
      } else {
        koda = vec3(0.12, 0.10, 0.07) + color * vec3(0.95, 0.89, 0.78);
      }
      finalColor = mix(color, koda, clamp(inten, 0.0, 1.2));
      finalColor += filmNoise * 0.13 * grainAmt * inten;
    }
    else if (activeDecade < 1975.0) {
      // 1970s: Super 8 & Light Leaks
      float satMul = (v > 0.5 && v < 1.5) ? 0.95 : 0.50;
      vec3 vintage = mix(vec3(luma), color, 1.0 + satMul * inten);
      vintage *= (v >= 1.5) ? vec3(1.05, 1.01, 0.88) : vec3(1.0 + 0.12 * inten, 1.0 + 0.02 * inten, 1.0 - 0.18 * inten);
      float leakWave = sin(screenUv.x * 4.5 * sc + time * 0.9) * cos(screenUv.y * 2.8 * sc - time * 0.5);
      float edgeMask = smoothstep(0.45, 1.0, screenUv.x) + smoothstep(0.28, 0.0, screenUv.x) * 0.45;
      float leakStrength = (v >= 1.5) ? 0.16 : 0.48;
      vec3 leakCol = (v > 0.5 && v < 1.5) ? vec3(1.0, 0.32, 0.42) : vec3(1.0, 0.48, 0.12);
      finalColor = mix(color, vintage, clamp(inten, 0.0, 1.15)) + leakCol * max(0.0, leakWave * 0.55 + 0.35) * edgeMask * leakStrength * inten;
      finalColor += filmNoise * (v >= 1.5 ? 0.24 : 0.15) * grainAmt * inten;
    }
    else if (activeDecade < 1985.0) {
      // 1980s: VHS NTSC / CRT Monitor / Night 1984
      vec2 vUv = uv;
      float bandPos = fract(time * 0.18);
      float trackingBand = smoothstep(0.07, 0.0, abs(screenUv.y - bandPos));
      float bottomWarp = smoothstep(0.12, 0.0, screenUv.y);
      float warpAmt = (v < 0.5) ? 1.0 : (v < 1.5 ? 0.35 : 0.65);
      vUv.x += (trackingBand * 0.014 + bottomWarp * 0.02) * sin(screenUv.y * 120.0 + time * 18.0) * sc * inten * warpAmt;

      finalColor = rgbSplit(tDiffuse, vUv, 0.0065 * inten * sc);
      float scanScale = (v > 0.5 && v < 1.5) ? 1.35 : 0.92;
      float scan = sin(screenUv.y * u_resolution.y * scanScale * sc) * (v > 0.5 && v < 1.5 ? 0.09 : 0.055) * inten;
      finalColor -= scan;
      finalColor += trackingBand * 0.08 * inten * warpAmt;
      if (v >= 1.5) {
        finalColor = mix(finalColor, mix(vec3(0.07, 0.16, 0.38), vec3(1.0, 0.72, 0.22), getLuma(finalColor)), 0.45 * inten);
      } else {
        finalColor = mix(finalColor, vec3(getLuma(finalColor)), 0.16 * inten);
      }
      finalColor += filmNoise * 0.14 * grainAmt * inten;
    }
    else if (activeDecade < 1995.0) {
      // 1990s: Camcorder Hi8 / Data Mosh / Cyber 1999
      vec2 mUv = uv;
      float moshGain = (v > 0.5 && v < 1.5) ? 1.7 : 0.85;
      float glitchRow = step(0.96 - 0.045 * min(inten * moshGain, 1.8), sin(time * 9.0 + floor(screenUv.y * 36.0 * sc) * 3.1));
      mUv.x += glitchRow * 0.036 * inten * moshGain;

      float blockGrid = max(42.0, (v > 0.5 && v < 1.5 ? 130.0 : 220.0) / sc);
      vec2 quantUv = floor(mUv * blockGrid) / blockGrid;
      vec3 splitCol = rgbSplit(tDiffuse, mUv, 0.010 * inten);
      vec3 blockCol = texture2D(tDiffuse, quantUv).rgb;
      finalColor = mix(splitCol, blockCol, clamp(0.42 * inten * moshGain, 0.0, 0.85));
      if (v >= 1.5) {
        finalColor *= vec3(0.84, 1.08, 0.98);
      }
      finalColor += filmNoise * 0.11 * grainAmt * inten;
    }
    else if (activeDecade < 2005.0) {
      // 2000s: Y2K CCD Digital Bloom
      vec2 texel = (1.0 / max(u_resolution, vec2(1.0))) * sc * 3.2;
      vec3 blur = color;
      if (u_lite < 0.5) {
        blur = (
          texture2D(tDiffuse, clamp(uv + vec2(texel.x, texel.y), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(uv - vec2(texel.x, texel.y), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(uv + vec2(texel.x, -texel.y), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(uv + vec2(-texel.x, texel.y), 0.001, 0.999)).rgb
        ) * 0.25;
      }
      float thresh = (v > 0.5 && v < 1.5) ? 0.42 : 0.55;
      vec3 bloomTint = (v >= 1.5) ? vec3(0.76, 0.98, 1.18) : vec3(0.92, 0.96, 1.08);
      vec3 highlights = max(blur - vec3(thresh), vec3(0.0)) * 1.5 * inten;
      finalColor = color + highlights * bloomTint;
      if (v > 0.5 && v < 1.5) {
        finalColor *= smoothstep(1.32, 0.28, length(screenUv - 0.5));
        finalColor *= 1.12;
      }
      finalColor = mix(vec3(luma), finalColor, 1.0 + 0.30 * inten);
      finalColor += filmNoise * 0.07 * grainAmt * inten;
    }
    else if (activeDecade < 2015.0) {
      // 2010s: Cinema Teal & Orange / Indie Matte / Anamorphic
      vec3 shadows = (v > 0.5 && v < 1.5) ? vec3(0.09, 0.14, 0.18) : vec3(0.04, 0.19, 0.28);
      vec3 highlights = (v > 0.5 && v < 1.5) ? vec3(0.95, 0.89, 0.78) : vec3(1.0, 0.82, 0.62);
      vec3 graded = mix(shadows, highlights, smoothstep(0.05, 0.95, luma));
      finalColor = mix(color, mix(color * 0.6 + graded * 0.55, graded, 0.35), clamp(0.85 * inten, 0.0, 1.0));
      if (v > 0.5 && v < 1.5) {
        finalColor = finalColor * 0.88 + vec3(0.07 * inten);
      } else if (v >= 1.5 && u_lite < 0.5) {
        float sx = (14.0 / max(u_resolution.x, 1.0)) * sc;
        vec3 streak = (
          texture2D(tDiffuse, clamp(uv + vec2(sx, 0.0), 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(uv - vec2(sx, 0.0), 0.001, 0.999)).rgb
        ) * 0.5;
        finalColor += max(streak - vec3(0.70), vec3(0.0)) * vec3(0.45, 0.82, 1.25) * 1.15 * inten;
      }
      finalColor *= smoothstep(1.48, 0.42, length(screenUv - 0.5));
      finalColor += filmNoise * 0.06 * grainAmt * inten;
    }
    else if (activeDecade < 2025.0) {
      // 2020s: SGX.Story Prístino / SGX.Stage Oro / SGX.Showcase Cian
      finalColor = rgbSplit(tDiffuse, uv, 0.0022 * inten * sc);
      finalColor = (finalColor - 0.5) * (1.0 + 0.26 * inten) + 0.5;
      vec3 sgxBlue = vec3(0.196, 0.322, 0.482);
      vec3 sgxYellow = vec3(0.992, 0.800, 0.051);
      vec3 sgxCyan = vec3(0.0, 0.867, 1.0);

      float shadowMask = 1.0 - smoothstep(0.12, 0.58, luma);
      float hiMask = smoothstep(0.58, 0.96, luma);
      if (v < 0.5) {
        finalColor = mix(finalColor, sgxBlue, shadowMask * 0.22 * inten);
        finalColor = mix(finalColor, finalColor * 0.85 + sgxYellow * 0.28, hiMask * 0.24 * inten);
      } else if (v < 1.5) {
        finalColor = mix(finalColor, vec3(0.07, 0.06, 0.05), shadowMask * 0.22 * inten);
        finalColor = mix(finalColor, finalColor * 0.82 + sgxYellow * 0.40, hiMask * 0.32 * inten);
      } else {
        finalColor = mix(finalColor, sgxBlue, shadowMask * 0.25 * inten);
        finalColor = mix(finalColor, finalColor * 0.84 + sgxCyan * 0.30, hiMask * 0.26 * inten);
      }
      finalColor += filmNoise * 0.045 * grainAmt * inten;
    }
    else if (activeDecade < 2040.0) {
      // 2030s: Holographic Light-Field Optics
      vec2 centered = screenUv - 0.5;
      float dist = length(centered);
      vec3 sgxYellow = vec3(0.992, 0.800, 0.051);
      vec3 sgxCyan = vec3(0.0, 0.867, 1.0);
      vec3 sgxBlue = vec3(0.196, 0.322, 0.482);

      if (v < 0.5) {
        vec2 dir = normalize(centered + vec2(0.0001));
        float disp = dist * 0.022 * inten * sc;
        float r = texture2D(tDiffuse, clamp(uv + dir * disp, 0.001, 0.999)).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, clamp(uv - dir * disp, 0.001, 0.999)).b;
        float shimmer = 0.5 + 0.5 * sin((screenUv.x + screenUv.y) * 28.0 * sc - time * 2.2);
        finalColor = vec3(r, g, b) + mix(sgxCyan, sgxYellow, shimmer) * smoothstep(0.55, 1.0, luma) * 0.28 * inten;
      } else if (v < 1.5) {
        vec3 q1 = mix(vec3(0.02, 0.03, 0.06), sgxBlue, smoothstep(0.0, 0.38, luma));
        vec3 q2 = mix(q1, sgxCyan, smoothstep(0.35, 0.70, luma));
        vec3 q3 = mix(q2, sgxYellow, smoothstep(0.68, 0.96, luma));
        finalColor = mix(color, q3, clamp(inten, 0.0, 1.1));
      } else {
        float bands = sin((screenUv.y * 160.0 + sin(screenUv.x * 8.0 + time) * 6.0) * sc);
        vec3 holo = mix(sgxBlue, sgxCyan, 0.5 + 0.5 * bands) * (0.35 + luma * 0.9);
        finalColor = mix(color, color * 0.55 + holo * 0.72 + sgxYellow * smoothstep(0.75, 1.0, luma) * 0.35, clamp(inten, 0.0, 1.15));
      }
      finalColor += filmNoise * 0.03 * grainAmt * inten;
    }
    else if (activeDecade < 2070.0) {
      // 2050s: Neural AR / Cyan Mesh / Lidar Scanner
      vec2 texel = (1.0 / max(u_resolution, vec2(1.0))) * sc * 1.8;
      float s00 = getLuma(texture2D(tDiffuse, clamp(uv + texel * vec2(-1.0, -1.0), 0.001, 0.999)).rgb);
      float s22 = getLuma(texture2D(tDiffuse, clamp(uv + texel * vec2(1.0, 1.0), 0.001, 0.999)).rgb);
      float s02 = getLuma(texture2D(tDiffuse, clamp(uv + texel * vec2(-1.0, 1.0), 0.001, 0.999)).rgb);
      float s20 = getLuma(texture2D(tDiffuse, clamp(uv + texel * vec2(1.0, -1.0), 0.001, 0.999)).rgb);
      float edge = clamp((abs(s00 - s22) + abs(s02 - s20)) * 2.8, 0.0, 1.0);

      vec2 aspectUv = screenUv;
      aspectUv.x *= viewAspect;
      float gridDensity = (v > 0.5 && v < 1.5) ? 130.0 : 92.0;
      vec2 cell = fract(aspectUv * gridDensity * sc) - 0.5;
      float dotGrid = 1.0 - smoothstep(0.09, 0.14, length(cell));

      float sweep = smoothstep(0.07, 0.0, abs(fract(time * 0.24) - screenUv.y));
      vec3 sgxYellow = vec3(0.992, 0.800, 0.051);
      vec3 sgxCyan = vec3(0.0, 0.867, 1.0);
      vec3 sgxBlue = vec3(0.196, 0.322, 0.482);

      vec3 baseDark = color * (1.0 - 0.48 * min(inten, 1.2));
      vec3 arOverlay;
      if (v < 0.5) {
        arOverlay = sgxYellow * edge * 1.35 + mix(sgxBlue, sgxCyan, sweep) * dotGrid * 0.42 + sgxCyan * sweep * 0.14;
      } else if (v < 1.5) {
        arOverlay = sgxCyan * edge * 1.45 + sgxCyan * dotGrid * 0.45 + sgxYellow * sweep * 0.18;
      } else {
        float contour = step(0.86, fract(luma * 12.0 * sc + time * 0.35));
        arOverlay = sgxCyan * contour * 0.55 + sgxYellow * edge * 1.15 + sgxCyan * sweep * 0.28;
      }
      finalColor = mix(color, baseDark + arOverlay, clamp(inten, 0.0, 1.25));
      finalColor += filmNoise * 0.035 * grainAmt * inten;
    }
    else {
      // 2090s: Synthetic Memory Archive
      vec3 sgxYellow = vec3(0.992, 0.800, 0.051);
      vec3 sgxCyan = vec3(0.0, 0.867, 1.0);
      vec3 sgxBlue = vec3(0.196, 0.322, 0.482);

      vec2 texel = (1.0 / max(u_resolution, vec2(1.0))) * sc * 2.2;
      float e1 = abs(getLuma(texture2D(tDiffuse, clamp(uv + vec2(texel.x, 0.0), 0.001, 0.999)).rgb) -
                     getLuma(texture2D(tDiffuse, clamp(uv - vec2(texel.x, 0.0), 0.001, 0.999)).rgb));
      float e2 = abs(getLuma(texture2D(tDiffuse, clamp(uv + vec2(0.0, texel.y), 0.001, 0.999)).rgb) -
                     getLuma(texture2D(tDiffuse, clamp(uv - vec2(0.0, texel.y), 0.001, 0.999)).rgb));
      float edge = clamp((e1 + e2) * 3.4, 0.0, 1.0);

      if (v < 0.5) {
        vec2 aspectUv = screenUv * vec2(viewAspect, 1.0) * 58.0 * sc;
        vec2 g = abs(fract(aspectUv) - 0.5);
        float wire = 1.0 - smoothstep(0.44, 0.49, max(g.x, g.y));
        vec3 mem = vec3(0.03, 0.05, 0.09) + color * 0.45 + sgxCyan * edge * 1.1 + sgxYellow * wire * luma * 0.55;
        finalColor = mix(color, mem, clamp(inten, 0.0, 1.15));
      } else if (v < 1.5) {
        vec2 echoOff = vec2(sin(time * 0.9) * 0.018, cos(time * 0.7) * 0.012) * sc * inten;
        vec3 echoA = texture2D(tDiffuse, clamp(uv + echoOff, 0.001, 0.999)).rgb;
        vec3 echoB = texture2D(tDiffuse, clamp(uv - echoOff, 0.001, 0.999)).rgb;
        vec3 composed = color * 0.62 + echoA * vec3(0.15, 0.85, 1.0) * 0.35 + echoB * vec3(1.0, 0.80, 0.10) * 0.35;
        finalColor = mix(color, composed, clamp(inten, 0.0, 1.15));
      } else {
        float pulse = 0.5 + 0.5 * sin(length(screenUv - 0.5) * 30.0 - time * 3.5);
        vec3 voidCol = vec3(0.02, 0.03, 0.05) + sgxBlue * 0.14 * pulse;
        vec3 sing = voidCol + sgxYellow * edge * 1.65 + sgxCyan * smoothstep(0.65, 1.0, luma) * 0.55;
        finalColor = mix(color, sing, clamp(inten, 0.0, 1.15));
      }
      finalColor += filmNoise * 0.03 * grainAmt * inten;
    }

    return finalColor;
  }

  void main() {
    float viewAspect = max(u_resolution.x / max(u_resolution.y, 1.0), 0.1);
    vec2 screenUv = vUv;

    // Optional Cinema Aspect Mask (2.39:1, 4:3, 9:16)
    if (u_frameRatio > 0.05) {
      if (viewAspect > u_frameRatio) {
        float halfW = 0.5 * (u_frameRatio / viewAspect);
        float distX = abs(screenUv.x - 0.5);
        if (distX > halfW) {
          float borderLine = step(distX, halfW + (1.5 / max(u_resolution.x, 1.0)));
          gl_FragColor = vec4(mix(vec3(0.02, 0.02, 0.025), vec3(0.196, 0.322, 0.482), borderLine), 1.0);
          return;
        }
      } else {
        float halfH = 0.5 * (viewAspect / u_frameRatio);
        float distY = abs(screenUv.y - 0.5);
        if (distY > halfH) {
          float borderLine = step(distY, halfH + (1.5 / max(u_resolution.y, 1.0)));
          gl_FragColor = vec4(mix(vec3(0.02, 0.02, 0.025), vec3(0.196, 0.322, 0.482), borderLine), 1.0);
          return;
        }
      }
    }

    // Temporal Warp UV Distortion when jumping between eras
    vec2 warpedScreenUv = screenUv;
    float warp = clamp(u_warp, 0.0, 1.0);
    if (warp > 0.004) {
      vec2 centered = screenUv - 0.5;
      float r = length(centered);
      float pull = 1.0 - warp * 0.24 * u_warpDir * (0.35 + r);
      warpedScreenUv = 0.5 + centered * pull;
      float tear = (hash12(vec2(floor(screenUv.y * 42.0), floor(u_time * 40.0))) - 0.5) * 0.045 * warp;
      warpedScreenUv.x += tear;
    }

    vec2 uv = coverUv(warpedScreenUv, max(u_mediaAspect, 0.1), viewAspect);
    if (u_flip > 0.5) {
      uv.x = 1.0 - uv.x;
    }

    vec3 rawColor = texture2D(tDiffuse, uv).rgb;
    float time = u_time;
    float inten = u_intensity;
    float sc = max(u_scale, 0.1);
    float grainAmt = u_grain;
    float filmNoise = (hash12(floor(uv * u_resolution * 0.55) + fract(time * 24.0) * 100.0) - 0.5);

    float pxX = 1.5 / max(u_resolution.x, 1.0);
    float pxY = 1.5 / max(u_resolution.y, 1.0);
    float dividerLine = 0.0;
    vec3 finalColor = rawColor;

    // Mode 1: Classic A/B Original vs Active Era (or Hold-to-Peek Original)
    if (u_splitEnabled > 0.5 && u_splitMode < 1.5) {
      if (screenUv.x < u_splitX) {
        gl_FragColor = vec4(rawColor, 1.0);
        return;
      }
      finalColor = evalTemporalEra(u_decade, u_variant, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
    }
    // Mode 8: Transparent PNG/SVG Alpha Mask Split (Inside = Zone 0, Outside = Zone 1)
    else if (u_splitMode >= 7.5) {
      float alpha = sampleMaskAlpha(screenUv, viewAspect);
      if (u_maskInvert > 0.5) {
        alpha = 1.0 - alpha;
      }
      float f = clamp(u_maskFeather, 0.0, 0.45);
      float maskMix = (f < 0.008) ? step(0.5, alpha) : smoothstep(0.5 - f, 0.5 + f, alpha);

      vec2 eraIn = getZoneEra(0);
      vec2 eraOut = getZoneEra(1);

      if (maskMix >= 0.992) {
        finalColor = evalTemporalEra(eraIn.x, eraIn.y, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
      } else if (maskMix <= 0.008) {
        finalColor = evalTemporalEra(eraOut.x, eraOut.y, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
      } else {
        vec3 colIn = evalTemporalEra(eraIn.x, eraIn.y, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
        vec3 colOut = evalTemporalEra(eraOut.x, eraOut.y, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
        finalColor = mix(colOut, colIn, maskMix);
      }

      // Optional crisp SGX contour outline along the transparent PNG silhouette
      if (u_maskEdge > 0.5) {
        vec2 stepUv = vec2(2.0 / max(u_resolution.x, 1.0), 2.0 / max(u_resolution.y, 1.0));
        float aL = sampleMaskAlpha(screenUv - vec2(stepUv.x, 0.0), viewAspect);
        float aR = sampleMaskAlpha(screenUv + vec2(stepUv.x, 0.0), viewAspect);
        float aD = sampleMaskAlpha(screenUv - vec2(0.0, stepUv.y), viewAspect);
        float aU = sampleMaskAlpha(screenUv + vec2(0.0, stepUv.y), viewAspect);
        float grad = abs(aL - aR) + abs(aD - aU);
        dividerLine = smoothstep(0.28, 0.65, grad);
      }
    }
    // Grid / Slice Modes (0=1x, 2=2xV, 3=3x, 4=4x, 5=2xH, 6=6x, 7=9x)
    else {
      int zoneIdx = 0;

      if (u_splitMode < 0.5) {
        zoneIdx = 0;
      } else if (u_splitMode < 2.5) {
        // Mode 2: 2x Vertical
        zoneIdx = (screenUv.x < u_splitX) ? 0 : 1;
        dividerLine = step(abs(screenUv.x - u_splitX), pxX);
      } else if (u_splitMode < 3.5) {
        // Mode 3: 3x Vertical Slices
        zoneIdx = (screenUv.x < 0.33333) ? 0 : ((screenUv.x < 0.66667) ? 1 : 2);
        dividerLine = max(
          step(abs(screenUv.x - 0.33333), pxX),
          step(abs(screenUv.x - 0.66667), pxX)
        );
      } else if (u_splitMode < 4.5) {
        // Mode 4: 4x Quad (2x2)
        int col = (screenUv.x < 0.5) ? 0 : 1;
        int row = (screenUv.y >= 0.5) ? 0 : 1;
        zoneIdx = row * 2 + col;
        dividerLine = max(
          step(abs(screenUv.x - 0.5), pxX),
          step(abs(screenUv.y - 0.5), pxY)
        );
      } else if (u_splitMode < 5.5) {
        // Mode 5: 2x Horizontal (Top = Zone 0, Bottom = Zone 1)
        float cutY = 1.0 - u_splitY; // convert top-down splitY into bottom-up GLSL vUv.y
        zoneIdx = (screenUv.y >= cutY) ? 0 : 1;
        dividerLine = step(abs(screenUv.y - cutY), pxY);
      } else if (u_splitMode < 6.5) {
        // Mode 6: 6x Mosaic (3 columns x 2 rows)
        int col = (screenUv.x < 0.33333) ? 0 : ((screenUv.x < 0.66667) ? 1 : 2);
        int row = (screenUv.y >= 0.5) ? 0 : 1;
        zoneIdx = row * 3 + col;
        float vx = max(step(abs(screenUv.x - 0.33333), pxX), step(abs(screenUv.x - 0.66667), pxX));
        float hy = step(abs(screenUv.y - 0.5), pxY);
        dividerLine = max(vx, hy);
      } else {
        // Mode 7: 9x Mosaic (3 columns x 3 rows)
        int col = (screenUv.x < 0.33333) ? 0 : ((screenUv.x < 0.66667) ? 1 : 2);
        int row = (screenUv.y >= 0.66667) ? 0 : ((screenUv.y >= 0.33333) ? 1 : 2);
        zoneIdx = row * 3 + col;
        float vx = max(step(abs(screenUv.x - 0.33333), pxX), step(abs(screenUv.x - 0.66667), pxX));
        float hy = max(step(abs(screenUv.y - 0.33333), pxY), step(abs(screenUv.y - 0.66667), pxY));
        dividerLine = max(vx, hy);
      }

      vec2 era = (u_splitMode < 0.5) ? vec2(u_decade, u_variant) : getZoneEra(zoneIdx);
      finalColor = evalTemporalEra(era.x, era.y, rawColor, uv, screenUv, viewAspect, time, inten, sc, grainAmt, filmNoise);
    }

    // --- GLOBAL LUMA-PRESERVING TINT ---
    if (u_tintPower > 0.001) {
      vec3 lumaTint = getLuma(finalColor) * u_tintColor * 1.85;
      finalColor = mix(finalColor, lumaTint, clamp(u_tintPower, 0.0, 1.0));
    }

    // --- ACTIVE TIME-WARP SHOCKWAVE OVERLAY ---
    if (warp > 0.004) {
      vec2 centered = screenUv - 0.5;
      float r = length(centered);
      vec3 sgxYellow = vec3(0.992, 0.800, 0.051);
      vec3 sgxCyan = vec3(0.0, 0.867, 1.0);

      if (u_lite < 0.5) {
        vec2 streakStep = centered * 0.075 * warp;
        vec3 s1 = texture2D(tDiffuse, clamp(uv - streakStep, 0.001, 0.999)).rgb;
        vec3 s2 = texture2D(tDiffuse, clamp(uv - streakStep * 2.0, 0.001, 0.999)).rgb;
        finalColor = mix(finalColor, (finalColor + s1 + s2) * 0.333, warp * 0.55);
      }

      float ringRadius = (1.0 - warp) * 0.95;
      float ring = smoothstep(0.09, 0.0, abs(r - ringRadius)) * warp;
      vec3 ringColor = (u_warpDir >= 0.0) ? sgxCyan : sgxYellow;
      finalColor += ringColor * ring * 0.85;
      finalColor += mix(sgxYellow, sgxCyan, r) * warp * 0.14;
    }

    // Crisp SGX Multi-Era Divider / Pillar-Colored Alpha Mask Contour Line
    if (dividerLine > 0.01) {
      vec3 lineCol = (u_splitMode >= 7.5) ? u_maskEdgeColor : vec3(0.992, 0.800, 0.051);
      finalColor = mix(finalColor, lineCol, clamp(dividerLine, 0.0, 1.0));
    }

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
  }
`;
