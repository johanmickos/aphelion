/**
 * Spec [00 · §1](../../docs/spec/00-tokens.md)'s acceptance, as a lint: *"every
 * colour drawn by the renderer resolves to one of the eight palette tokens, the
 * body fill, or true black; a lint over the render layer finds no other
 * literal."*
 *
 * It is written now, while the renderer draws three colours, because the rule is
 * cheap to hold and expensive to reintroduce: a palette is a thing a codebase
 * either has from the first colour or spends a milestone recovering. Colours are
 * found by parsing rather than by scanning text, so a hex quoted in a comment —
 * this file quotes several — is not a violation and a colour built out of string
 * pieces still is.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as palette from '../../src/render/palette.ts';

const RENDER = fileURLToPath(new URL('../../src/render', import.meta.url));

/** `#RGB`, `#RRGGBB`, `rgb()`, `hsl()`, `oklch()` — every way to write a colour. */
const COLOUR = /#[0-9a-fA-F]{3,8}|\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch|color)\s*\(/;

function literalsIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    // Template pieces count. Spec 00 §2 generates identity hues, so the one
    // colour in the game that is *built* rather than named arrives as
    // `oklch(${…})` — and a scan that only saw plain strings would have let any
    // file assemble a colour out of a template and pass.
    const text =
      ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node)
        ? node.text
        : null;
    if (text !== null && COLOUR.test(text)) found.push(text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The identity family — spec [00 · §2](../../docs/spec/00-tokens.md)'s
 * `oklch(0.72 0.13 H)`, which is one colour per body and therefore not a
 * literal this lint can enumerate.
 *
 * It is allowed in `palette.ts` and nowhere else, which is the same rule the
 * eight tokens live under: **one file writes colour down.** What varies is the
 * hue, and the hue is presentation state's
 * ([`identity.ts`](../../src/state/identity.ts)) — so no file outside the
 * palette can invent one even here.
 */
const IDENTITY_FORM = 'oklch(';

const files = readdirSync(RENDER, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(RENDER, name));

describe('the render layer', () => {
  it('has files to lint', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.filter((file) => !file.endsWith('palette.ts')))(
    'writes no colour of its own in %s',
    (file) => {
      expect(literalsIn(file)).toEqual([]);
    },
  );

  /**
   * And the palette is the palette. Spec 00 §1 names eight tokens, one derived
   * surface and one exception; a tenth colour appearing here is the same failure
   * as a colour appearing anywhere else, one file further along.
   */
  it('names exactly the colours spec 00 §1 allows', () => {
    expect(new Set(literalsIn(join(RENDER, 'palette.ts')))).toEqual(
      new Set([
        IDENTITY_FORM,
        palette.VOID,
        palette.DUSK,
        palette.AURORA,
        palette.ION,
        palette.CORE,
        palette.LUMEN,
        palette.SOLAR,
        palette.INK,
        palette.BODY_FILL,
        palette.TRUE_BLACK,
      ]),
    );
  });

  it('holds the eight tokens at the values the spec states', () => {
    expect(palette.VOID).toBe('#0A0814');
    expect(palette.DUSK).toBe('#6C64A6');
    expect(palette.AURORA).toBe('#9D6BFF');
    expect(palette.ION).toBe('#FF5FA2');
    expect(palette.CORE).toBe('#FFF4E0');
    expect(palette.LUMEN).toBe('#7FE0A8');
    expect(palette.SOLAR).toBe('#FFC94A');
    expect(palette.INK).toBe('#EDEAF7');
    expect(palette.BODY_FILL).toBe('#100C20');
    expect(palette.TRUE_BLACK).toBe('#000000');
  });

  /**
   * Brightness is the only ordinal channel (§3), so the one operation the
   * renderer has for making a colour out of another must not touch the colour.
   */
  /**
   * And the generated family is generated where the tokens are named, at the
   * fixed lightness and chroma spec 00 §2 states *"so every identity is equally
   * loud"*. Only the hue moves, so identity stays a hue and nothing else.
   */
  it('paints an identity from its hue alone', () => {
    expect(palette.identity(215, 1)).toBe('oklch(0.72 0.13 215 / 1)');
    expect(palette.identity(215, 0.5)).toBe('oklch(0.72 0.13 215 / 0.5)');
    // Two bodies differ in the hue and in nothing else.
    const [a, b] = [palette.identity(40, 1), palette.identity(215, 1)];
    expect(a.replace('40', 'H')).toBe(b.replace('215', 'H'));
    // The tide is the same hue further up the lightness axis, which is the
    // ordinal channel inside one identity rather than a second colour.
    expect(palette.identityLit(215, 1).endsWith('0.13 215 / 1)')).toBe(true);
    expect(palette.identityLit(215, 1)).not.toBe(palette.identity(215, 1));
  });

  it('dims a token without changing it', () => {
    expect(palette.dim(palette.DUSK, 1)).toBe('#6C64A6ff');
    expect(palette.dim(palette.DUSK, 0)).toBe('#6C64A600');
    expect(palette.dim(palette.DUSK, 0.35).startsWith(palette.DUSK)).toBe(true);
  });
});
