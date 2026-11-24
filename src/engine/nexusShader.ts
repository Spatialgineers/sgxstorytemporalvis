// Nube de puntos de SGX Nexus Scanner: cada punto toma color y profundidad del cuadro que recibe.
export const NEXUS_VERTEX_SHADER = /* glsl */ `
  #define PI 3.14159265359
  uniform sampler2D tDiffuse;
  uniform float u_aspect;
  uniform float u_pointSize;
  uniform float u_zExtrusion;
  uniform float u_morph;
  uniform float u_bass;
  uniform float u_time;
  uniform float u_turbulence;

  varying float vLuma;
  varying float vDepth;
  varying vec3 vTexColor;

  void main() {
    vec4 texColor = texture2D(tDiffuse, uv);
    vTexColor = texColor.rgb;
    float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    vLuma = luma;

    vec3 planePos = position;
    planePos.x *= u_aspect;

    float zPush = luma * u_zExtrusion;
    float wave = sin(planePos.x * 5.0 + u_time * 2.0) * cos(planePos.y * 5.0 - u_time);
    zPush += wave * u_turbulence * u_bass * luma;
    planePos.z += zPush * (1.0 + u_bass);

    float radius = 1.5 + (zPush * 0.5);
    float phi = (1.0 - uv.y) * PI;
    float theta = uv.x * PI * 2.0;
    vec3 spherePos = vec3(
      radius * sin(phi) * cos(theta),
      radius * cos(phi),
      radius * sin(phi) * sin(theta)
    );

    vec3 finalPos = mix(planePos, spherePos, u_morph);
    vDepth = clamp(planePos.z / (u_zExtrusion + 0.1), 0.0, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = u_pointSize * (2.0 / -mvPosition.z);
  }
`;

export const NEXUS_FRAGMENT_SHADER = /* glsl */ `
  uniform int u_shape;
  uniform int u_colorMode;
  uniform vec3 u_colorNear;
  uniform vec3 u_colorDeep;
  uniform float u_chroma;

  varying float vLuma;
  varying float vDepth;
  varying vec3 vTexColor;

  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    float alpha = 1.0;

    vec3 finalColor = vTexColor;
    if (u_colorMode == 1) { finalColor = mix(u_colorDeep, u_colorNear, vDepth); }
    if (u_chroma > 0.0) { finalColor.r += vLuma * u_chroma; finalColor.b -= vLuma * u_chroma; }

    if (u_shape == 0) { if (ll > 0.5) discard; alpha = smoothstep(0.5, 0.4, ll); }
    else if (u_shape == 1) { if (ll > 0.5 || ll < 0.3) discard; alpha = smoothstep(0.5, 0.45, ll) * smoothstep(0.3, 0.35, ll); }
    else if (u_shape == 3) {
      float d1 = max(abs(xy.x), abs(xy.y) * 0.2);
      float d2 = max(abs(xy.x) * 0.2, abs(xy.y));
      if (min(d1, d2) > 0.1) discard;
    }

    gl_FragColor = vec4(finalColor * 1.5, alpha);
  }
`;

/** Une la nube de puntos (ya con bloom) con el cuadro 2D que venía por la cadena. */
export const NEXUS_COMPOSITE_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tNexus;
  uniform float u_backdrop;
  varying vec2 vUv;
  void main() {
    vec3 frame = texture2D(tDiffuse, vUv).rgb * u_backdrop;
    vec3 cloud = texture2D(tNexus, vUv).rgb;
    gl_FragColor = vec4(clamp(frame + cloud, 0.0, 1.0), 1.0);
  }
`;

export const COPY_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }
`;
