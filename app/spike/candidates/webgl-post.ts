/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * Rung (b) of M0.5's ladder: the Canvas2D scene uploaded as a texture to a
 * single WebGL post pass doing bloom, grade, dither, grain and scanlines
 * together.
 *
 * Two things about it are the actual experiment:
 *
 *   - **The upload.** A full-resolution scene is ~11.8 MB of RGBA per frame at
 *     the design size. Whether a phone can hand that to the GPU sixty times a
 *     second is the question that decides this rung, and it is a question no
 *     amount of desktop testing answers.
 *   - **One pass, not a pipeline.** The plan says a single post pass, so the
 *     bloom comes from the scene texture's own mip chain — three levels sampled
 *     with four taps each — rather than from a bright-pass into a ping-pong pair
 *     of framebuffers. The cost of that choice is that the threshold is applied
 *     *after* mip filtering rather than before it, so a large area of mid
 *     brightness blooms slightly when it should not. Against a VOID sky and a
 *     palette whose lit elements are the only bright things on screen, that is a
 *     small error; it is recorded here so the ADR can price it.
 */
import { drawScene } from '../scene.ts';
import type { Scene } from '../scene.ts';
import { GRADE } from '../grade.ts';
import type { Backing, Candidate, Renderer } from './types.ts';

const VERT = `#version 300 es
// No attributes and no buffer: three vertices addressed by index cover the
// screen with one triangle, which beats two for the same reason it always does
// — no shared edge to rasterise twice.
out vec2 vUv;
void main() {
  vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uWeights;
uniform float uThreshold;
uniform float uKnee;
uniform float uBloom;
uniform float uDither;
uniform float uGrain;
uniform float uScan;
uniform float uPitch;

in vec2 vUv;
out vec4 outColour;

// Spec 00 §3: brightness is the ordinal channel, so bloom is keyed off
// luminance and never off hue. A soft knee rather than a hard step, or the
// energy steps pop between E1 and E2 instead of ranking.
vec3 brightPass(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float s = clamp((l - uThreshold) / max(uKnee, 1e-4), 0.0, 1.0);
  return c * s * s;
}

vec3 bloomLevel(float lod) {
  vec2 t = exp2(lod) / uRes;
  return 0.25 * (
      brightPass(textureLod(uScene, vUv + vec2( t.x,  t.y), lod).rgb)
    + brightPass(textureLod(uScene, vUv + vec2(-t.x,  t.y), lod).rgb)
    + brightPass(textureLod(uScene, vUv + vec2( t.x, -t.y), lod).rgb)
    + brightPass(textureLod(uScene, vUv + vec2(-t.x, -t.y), lod).rgb));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Spec 14 §2 stage 3: ordered 4×4 Bayer.
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = y * 4 + x;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0 - 0.5;
}

void main() {
  vec3 c = texture(uScene, vUv).rgb;

  // 1 · bloom, three radii from three mip levels
  vec3 b = bloomLevel(2.0) * uWeights.x
         + bloomLevel(4.0) * uWeights.y
         + bloomLevel(6.0) * uWeights.z;
  c += b * uBloom;

  // 2 · grade: lift / gamma / gain, per channel. CORE stays at 1.0.
  c = uGain * pow(max(c, vec3(0.0)), vec3(1.0) / uGamma) + uLift;

  // 3 · dither
  c += bayer(gl_FragCoord.xy) * uDither;

  // 4 · grain, resampled every frame. Luminance only — a coloured grain would
  // put hue where hue means identity.
  c += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;

  // 5 · scanlines, at a pitch measured in backing pixels
  float line = step(0.5, fract(gl_FragCoord.y / uPitch));
  c *= 1.0 - uScan * line;

  outColour = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('cannot create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader) ?? 'unknown'}`);
  }
  return shader;
}

export const webglPost: Candidate = {
  id: 'b',
  label: '(b) Canvas2D → WebGL post pass',

  create(host: HTMLElement, scene: Scene, backing: Backing): Renderer {
    const canvas = document.createElement('canvas');
    canvas.width = backing.w;
    canvas.height = backing.h;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    host.append(canvas);

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The post pass writes every pixel every frame, so there is nothing worth
      // preserving between them.
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      canvas.remove();
      throw new Error('no webgl2');
    }

    // The scene is drawn in Canvas2D exactly as the other candidates draw it —
    // same module, same calls — and only then handed to the GPU.
    const src = document.createElement('canvas');
    src.width = backing.w;
    src.height = backing.h;
    const ctx = src.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) {
      canvas.remove();
      throw new Error('no 2d context for the scene');
    }

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
    }
    gl.useProgram(program);

    const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
    const uTime = u('uTime');

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Canvas2D's origin is top-left and a GL texture's is bottom-left. Flipping
    // on upload rather than in the shader keeps gl_FragCoord — which the
    // scanlines and the dither both read — in the same space as the design
    // coordinates the scene was drawn in.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.uniform1i(u('uScene'), 0);
    gl.uniform2f(u('uRes'), backing.w, backing.h);
    gl.uniform3f(u('uLift'), GRADE.lift[0], GRADE.lift[1], GRADE.lift[2]);
    gl.uniform3f(u('uGamma'), GRADE.gamma[0], GRADE.gamma[1], GRADE.gamma[2]);
    gl.uniform3f(u('uGain'), GRADE.gain[0], GRADE.gain[1], GRADE.gain[2]);
    gl.uniform3f(u('uWeights'), ...GRADE.bloom.weights);
    gl.uniform1f(u('uThreshold'), GRADE.bloom.threshold);
    gl.uniform1f(u('uKnee'), GRADE.bloom.knee);
    gl.uniform1f(u('uBloom'), GRADE.bloom.intensity);
    gl.uniform1f(u('uDither'), GRADE.dither);
    gl.uniform1f(u('uGrain'), GRADE.grain);
    gl.uniform1f(u('uScan'), GRADE.scanlines.strength);
    gl.uniform1f(u('uPitch'), Math.max(2, GRADE.scanlines.pitch * backing.scale));

    gl.viewport(0, 0, backing.w, backing.h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let allocated = true;

    return {
      note:
        'single pass, so bloom comes from the scene texture mip chain and the threshold is ' +
        'applied after mip filtering rather than before it. The per-frame texture upload of the ' +
        'full-resolution scene is the cost this rung stands or falls on.',

      frame(t: number): void {
        ctx.setTransform(backing.scale, 0, 0, backing.scale, 0, 0);
        drawScene(ctx, scene);

        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (allocated) {
          // Reallocating the texture every frame costs more than overwriting
          // it, so storage is allocated once and the pixels are replaced.
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          allocated = true;
        }
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.uniform1f(uTime, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },

      dispose(): void {
        gl.deleteTexture(tex);
        gl.deleteProgram(program);
        allocated = false;
        canvas.remove();
      },
    };
  },
};
