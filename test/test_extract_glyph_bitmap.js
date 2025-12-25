'use strict';

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const run = require('../lib/cli').run;

const font = require.resolve('roboto-fontface/fonts/roboto/Roboto-Black.woff');

describe('Extract Glyph Bitmap', function () {
  // Helper function to extract bitmap bytes from C code
  function extractBitmapBytesFromC(cCode) {
    const match = cCode.match(/glyph_bitmap\[\]\s*=\s*\{([^}]+)\}/s);
    if (!match) return null;

    const hexData = match[1];
    const bytes = [];
    const hexPattern = /0x([0-9A-Fa-f]{2})/g;
    let m;

    while ((m = hexPattern.exec(hexData)) !== null) {
      bytes.push(parseInt(m[1], 16));
    }

    return Buffer.from(bytes);
  }

  // Helper to generate random test file name
  function randomFileName(ext) {
    return `test_${Math.random().toString(16).slice(2, 10)}${ext}`;
  }

  // Helper to clean up test files
  function cleanupFiles(...files) {
    files.forEach(f => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
  }

  describe('Property 1: Binary file content consistency', function () {
    /**
     * Feature: glyph-bitmap-extraction, Property 1: 二进制文件内容一致性
     * Validates: Requirements 1.1, 2.3, 4.1, 4.2, 4.5
     */
    it('Should generate binary file with same content as inline array', async function () {
      this.timeout(30000);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 12, max: 48 }),
          fc.constantFrom(1, 2, 4, 8),
          fc.boolean(),
          async (size, bpp, no_compress) => {
            const standardFile = path.join(__dirname, randomFileName('.c'));
            const extractedFile = path.join(__dirname, randomFileName('.c'));
            const binFile = extractedFile.replace(/\.c$/, '_glyph_bitmap.bin');

            try {
              // Generate standard output (inline array)
              const args = [
                '--font', font, '--range', '0x41-0x5A',
                '--size', String(size), '--bpp', String(bpp),
                '--format', 'lvgl', '-o', standardFile
              ];
              if (no_compress) args.push('--no-compress');
              await run(args, true);

              // Generate extracted output (external binary)
              const extractArgs = [
                '--font', font, '--range', '0x41-0x5A',
                '--size', String(size), '--bpp', String(bpp),
                '--format', 'lvgl', '--extract-glyph-bitmap',
                '-o', extractedFile
              ];
              if (no_compress) extractArgs.push('--no-compress');
              await run(extractArgs, true);

              // Read files
              const standardCode = fs.readFileSync(standardFile, 'utf8');
              const extractedBin = fs.readFileSync(binFile);

              // Extract bitmap bytes from standard C code
              const standardBytes = extractBitmapBytesFromC(standardCode);

              if (!standardBytes) {
                throw new Error('Failed to extract bitmap bytes from standard C code');
              }

              // Compare
              return Buffer.compare(standardBytes, extractedBin) === 0;
            } finally {
              cleanupFiles(standardFile, extractedFile, binFile);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property 4: Macro reference replacement', function () {
    /**
     * Feature: glyph-bitmap-extraction, Property 4: 宏引用替换
     * Validates: Requirements 1.3, 2.4, 5.1, 5.2
     */
    it('Should use macro reference instead of inline array when extraction is enabled',
      async function () {
        this.timeout(30000);

        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 12, max: 48 }),
            fc.constantFrom(1, 2, 4, 8),
            async (size, bpp) => {
              const extractedFile = path.join(__dirname, randomFileName('.c'));
              const binFile = extractedFile.replace(/\.c$/, '_glyph_bitmap.bin');

              try {
                // Generate extracted output (external binary)
                await run([
                  '--font', font, '--range', '0x41-0x5A',
                  '--size', String(size), '--bpp', String(bpp),
                  '--format', 'lvgl', '--extract-glyph-bitmap',
                  '-o', extractedFile
                ], true);

                // Read C file
                const cCode = fs.readFileSync(extractedFile, 'utf8');

                // Verify macro reference is present
                const hasMacroReference = cCode.includes('_GLYPH_BITMAP_BIN');

                // Verify pointer declaration is present
                const hasPointerDeclaration = /const uint8_t \* const glyph_bitmap/.test(cCode);

                // Verify comment about external binary file is present
                const hasComment = cCode.includes('external binary file');

                // Verify no inline array declaration
                const noInlineArray = !cCode.includes('glyph_bitmap[] = {');

                return hasMacroReference && hasPointerDeclaration && hasComment && noInlineArray;
              } finally {
                cleanupFiles(extractedFile, binFile);
              }
            }
          ),
          { numRuns: 5 }
        );
      });
  });
});
