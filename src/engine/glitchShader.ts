// Shader maestro de SGX Glitch Master. Portado sin cambios.
export const GLITCH_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float u_time;

uniform float u_block;
uniform float u_tear;
uniform float u_wave;
uniform float u_pixel;

uniform vec2 u_rgb;
uniform float u_bleed;

uniform float u_crt;
uniform float u_noise;
uniform float u_jitter;

uniform float u_bright;
uniform float u_cont;
uniform float u_sat;
uniform float u_hue;
uniform float u_invert;

varying vec2 vUv;

// PRNG (Pseudo-Random Number Generator)
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
float getLuma(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }

vec3 hueShift(vec3 color, float hue) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosAngle = cos(hue);
    return vec3(color * cosAngle + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosAngle));
}

void main() {
    vec2 uv = vUv;
    
    // 0. JITTER (Vertical VHS Shake)
    if (u_jitter > 0.0) {
        float jitterY = random(vec2(u_time, 0.0)) * u_jitter * 0.05;
        uv.y += (random(vec2(u_time * 10.0, 0.0)) > 0.8) ? jitterY : 0.0;
    }

    // 1. WAVE WARP
    if (u_wave > 0.0) {
        uv.x += sin(uv.y * 20.0 + u_time * 5.0) * u_wave * 0.05;
        uv.y += cos(uv.x * 15.0 - u_time * 3.0) * u_wave * 0.02;
    }

    // 2. PIXELATE
    if (u_pixel > 0.0) {
        float pixels = mix(2000.0, 20.0, u_pixel);
        uv = floor(uv * pixels) / pixels;
    }

    // 3. HORIZONTAL TEAR
    if (u_tear > 0.0) {
        float tearRow = floor(uv.y * 50.0);
        float tearFactor = random(vec2(tearRow, u_time));
        if (tearFactor > 1.0 - u_tear) {
            uv.x += (random(vec2(u_time, tearRow)) - 0.5) * u_tear * 0.2;
        }
    }

    // 4. BLOCK GLITCH (Data Corruption)
    if (u_block > 0.0) {
        vec2 blockUv = floor(uv * vec2(16.0, 16.0));
        float blockNoise = random(blockUv + floor(u_time * 10.0));
        if (blockNoise > 1.0 - (u_block * 0.5)) {
            uv.x += (random(blockUv) - 0.5) * u_block * 0.2;
            uv.y += (random(blockUv + 1.0) - 0.5) * u_block * 0.2;
        }
    }

    // Wrap UVs to prevent edge tearing into black
    uv = fract(uv);

    // 5. CHROMATIC ABERRATION & BLEED
    vec2 rgbOffset = u_rgb * 0.1;
    
    // Bleed simulates bad VHS tracking (horizontal blur on red/blue)
    vec4 color = vec4(0.0);
    if (u_bleed > 0.0) {
        float bAmt = u_bleed * 0.02;
        color.r = texture2D(tDiffuse, uv + rgbOffset + vec2(bAmt, 0.0)).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - rgbOffset - vec2(bAmt, 0.0)).b;
        
        // Extra sample for bleed smearing
        color.r += texture2D(tDiffuse, uv + rgbOffset + vec2(bAmt*2.0, 0.0)).r * 0.5;
        color.b += texture2D(tDiffuse, uv - rgbOffset - vec2(bAmt*2.0, 0.0)).b * 0.5;
    } else {
        color.r = texture2D(tDiffuse, uv + rgbOffset).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - rgbOffset).b;
    }

    vec3 finalColor = color.rgb;

    // 6. COLOR GRADING
    finalColor = (finalColor - 0.5) * u_cont + 0.5 + (u_bright - 1.0);
    float luma = getLuma(finalColor);
    finalColor = mix(vec3(luma), finalColor, u_sat);
    if(abs(u_hue) > 0.0) finalColor = hueShift(finalColor, u_hue);
    finalColor = mix(finalColor, 1.0 - finalColor, u_invert);

    // 7. ARTIFACTS (Noise & CRT)
    if (u_noise > 0.0) {
        float n = random(uv + u_time * 100.0);
        finalColor += (n - 0.5) * u_noise * 0.5;
    }
    if (u_crt > 0.0) {
        float scanline = sin(uv.y * 800.0) * 0.04 * u_crt;
        finalColor -= scanline;
        
        // CRT Vignette
        float vig = smoothstep(1.5, 0.5 - u_crt * 0.3, length(vUv - 0.5));
        finalColor *= vig;
    }

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`;
