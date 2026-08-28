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
    if (ts.isStringLiteralLike(node) && COLOUR.test(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

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
  it('dims a token without changing it', () => {
    expect(palette.dim(palette.DUSK, 1)).toBe('#6C64A6ff');
    expect(palette.dim(palette.DUSK, 0)).toBe('#6C64A600');
    expect(palette.dim(palette.DUSK, 0.35).startsWith(palette.DUSK)).toBe(true);
  });
});
