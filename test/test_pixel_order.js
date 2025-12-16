'use strict';

const assert = require('assert');
const fc = require('fast-check');
const { reorderByte, validateOrder, validateBpp, VALID_BPP } = require('../lib/pixel_order');
const Font = require('../lib/font/font');

describe('PixelOrder', function () {

  describe('validateOrder', function () {
    it('Should accept MSB', function () {
      assert.strictEqual(validateOrder('MSB'), true);
    });

    it('Should accept LSB', function () {
      assert.strictEqual(validateOrder('LSB'), true);
    });

    it('Should reject invalid order', function () {
      assert.strictEqual(validateOrder('invalid'), false);
      assert.strictEqual(validateOrder(''), false);
      assert.strictEqual(validateOrder(null), false);
    });
  });

  describe('validateBpp', function () {
    it('Should accept valid BPP values', function () {
      assert.strictEqual(validateBpp(1), true);
      assert.strictEqual(validateBpp(2), true);
      assert.strictEqual(validateBpp(4), true);
      assert.strictEqual(validateBpp(8), true);
    });

    it('Should reject invalid BPP values', function () {
      assert.strictEqual(validateBpp(0), false);
      assert.strictEqual(validateBpp(3), false);
      assert.strictEqual(validateBpp(5), false);
      assert.strictEqual(validateBpp(16), false);
    });
  });

  describe('reorderByte', function () {
    /**
     * **Feature: pixel-order-control, Property 1: MSB 像素排序正确性**
     * *对于任何*像素数据和支持的 BPP 配置，当指定 MSB 排序时，
     * 生成的字节中最高有效位应代表最左侧的像素
     * **Validates: Requirements 1.1**
     */
    it('Property 1: MSB pixel ordering - highest bit represents leftmost pixel', function () {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 255 }),
          fc.constantFrom(...VALID_BPP),
          (byte, bpp) => {
            const result = reorderByte(byte, bpp, 'MSB');

            // MSB 模式下，输入应该等于输出（默认行为）
            assert.strictEqual(result, byte & 0xFF);

            // 验证最高有效位代表最左侧像素
            // 对于 MSB，第一个像素在最高位
            const pixelsPerByte = 8 / bpp;
            const mask = (1 << bpp) - 1;
            const firstPixelShift = (pixelsPerByte - 1) * bpp;
            const firstPixel = (byte >> firstPixelShift) & mask;

            // 结果的第一个像素也应该在最高位
            const resultFirstPixel = (result >> firstPixelShift) & mask;
            assert.strictEqual(resultFirstPixel, firstPixel);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: pixel-order-control, Property 2: LSB 像素排序正确性**
     * *对于任何*像素数据和支持的 BPP 配置，当指定 LSB 排序时，
     * 生成的字节中最低有效位应代表最左侧的像素
     * **Validates: Requirements 1.2**
     */
    it('Property 2: LSB pixel ordering - lowest bit represents leftmost pixel', function () {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 255 }),
          fc.constantFrom(1, 2, 4), // 排除 8 BPP，因为它不需要重排序
          (byte, bpp) => {
            const result = reorderByte(byte, bpp, 'LSB');

            // 验证最低有效位代表最左侧像素
            const pixelsPerByte = 8 / bpp;
            const mask = (1 << bpp) - 1;

            // 从原字节提取第一个像素（在最高位）
            const firstPixelShift = (pixelsPerByte - 1) * bpp;
            const firstPixel = (byte >> firstPixelShift) & mask;

            // LSB 模式下，第一个像素应该在最低位
            const resultFirstPixel = result & mask;
            assert.strictEqual(resultFirstPixel, firstPixel);
          }
        ),
        { numRuns: 100 }
      );
    });

    // 具体示例测试
    describe('1 BPP specific cases', function () {
      it('Should reverse pixel order for LSB', function () {
        // 1 BPP: 8 pixels per byte
        // MSB: bit7=p0, bit6=p1, ..., bit0=p7
        // LSB: bit0=p0, bit1=p1, ..., bit7=p7
        assert.strictEqual(reorderByte(0b10000000, 1, 'LSB'), 0b00000001);
        assert.strictEqual(reorderByte(0b11110000, 1, 'LSB'), 0b00001111);
        assert.strictEqual(reorderByte(0b10101010, 1, 'LSB'), 0b01010101);
      });

      it('Should keep MSB unchanged', function () {
        assert.strictEqual(reorderByte(0b10000000, 1, 'MSB'), 0b10000000);
        assert.strictEqual(reorderByte(0b11110000, 1, 'MSB'), 0b11110000);
      });
    });

    describe('2 BPP specific cases', function () {
      it('Should reverse pixel order for LSB', function () {
        // 2 BPP: 4 pixels per byte
        // MSB: [p0:bits7-6][p1:bits5-4][p2:bits3-2][p3:bits1-0]
        // LSB: [p3:bits7-6][p2:bits5-4][p1:bits3-2][p0:bits1-0]
        assert.strictEqual(reorderByte(0b11000000, 2, 'LSB'), 0b00000011);
        assert.strictEqual(reorderByte(0b11100100, 2, 'LSB'), 0b00011011);
      });
    });

    describe('4 BPP specific cases', function () {
      it('Should reverse pixel order for LSB', function () {
        // 4 BPP: 2 pixels per byte
        // MSB: [p0:bits7-4][p1:bits3-0]
        // LSB: [p1:bits7-4][p0:bits3-0]
        assert.strictEqual(reorderByte(0xF0, 4, 'LSB'), 0x0F);
        assert.strictEqual(reorderByte(0xAB, 4, 'LSB'), 0xBA);
      });
    });

    describe('8 BPP specific cases', function () {
      it('Should not change byte for 8 BPP (single pixel per byte)', function () {
        assert.strictEqual(reorderByte(0xFF, 8, 'LSB'), 0xFF);
        assert.strictEqual(reorderByte(0x42, 8, 'LSB'), 0x42);
        assert.strictEqual(reorderByte(0x00, 8, 'MSB'), 0x00);
      });
    });
  });
});


describe('BPP Packing Properties', function () {

  /**
   * **Feature: pixel-order-control, Property 12: 1 BPP 打包正确性**
   * *对于任何*1 BPP 像素数据，应以指定的位顺序正确打包每字节 8 个像素
   * **Validates: Requirements 4.1**
   */
  it('Property 12: 1 BPP packing - 8 pixels per byte with correct bit order', function () {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.constantFrom('MSB', 'LSB'),
        (byte, order) => {
          const result = reorderByte(byte, 1, order);

          // 验证结果仍然是有效字节
          assert.ok(result >= 0 && result <= 255);

          // 验证 8 个像素被正确打包
          // 每个像素是 1 bit，所以一个字节包含 8 个像素
          let pixelCount = 0;
          for (let i = 0; i < 8; i++) {
            const pixel = (result >> i) & 1;
            assert.ok(pixel === 0 || pixel === 1);
            pixelCount++;
          }
          assert.strictEqual(pixelCount, 8);

          // 验证位顺序：MSB 时第一个像素在 bit7，LSB 时第一个像素在 bit0
          const firstPixelInInput = (byte >> 7) & 1;
          if (order === 'MSB') {
            assert.strictEqual((result >> 7) & 1, firstPixelInInput);
          } else {
            assert.strictEqual(result & 1, firstPixelInInput);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: pixel-order-control, Property 13: 2 BPP 打包正确性**
   * *对于任何*2 BPP 像素数据，应以指定的位顺序正确打包每字节 4 个像素
   * **Validates: Requirements 4.2**
   */
  it('Property 13: 2 BPP packing - 4 pixels per byte with correct bit order', function () {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.constantFrom('MSB', 'LSB'),
        (byte, order) => {
          const result = reorderByte(byte, 2, order);

          // 验证结果仍然是有效字节
          assert.ok(result >= 0 && result <= 255);

          // 验证 4 个像素被正确打包，每个像素 2 bits
          const pixels = [];
          for (let i = 0; i < 4; i++) {
            const pixel = (result >> (i * 2)) & 0x03;
            assert.ok(pixel >= 0 && pixel <= 3);
            pixels.push(pixel);
          }
          assert.strictEqual(pixels.length, 4);

          // 验证位顺序
          const firstPixelInInput = (byte >> 6) & 0x03;
          if (order === 'MSB') {
            assert.strictEqual((result >> 6) & 0x03, firstPixelInInput);
          } else {
            assert.strictEqual(result & 0x03, firstPixelInInput);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: pixel-order-control, Property 14: 4 BPP 打包正确性**
   * *对于任何*4 BPP 像素数据，应以指定的位顺序正确打包每字节 2 个像素
   * **Validates: Requirements 4.3**
   */
  it('Property 14: 4 BPP packing - 2 pixels per byte with correct bit order', function () {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.constantFrom('MSB', 'LSB'),
        (byte, order) => {
          const result = reorderByte(byte, 4, order);

          // 验证结果仍然是有效字节
          assert.ok(result >= 0 && result <= 255);

          // 验证 2 个像素被正确打包，每个像素 4 bits
          const pixel0 = result & 0x0F;
          const pixel1 = (result >> 4) & 0x0F;
          assert.ok(pixel0 >= 0 && pixel0 <= 15);
          assert.ok(pixel1 >= 0 && pixel1 <= 15);

          // 验证位顺序
          const firstPixelInInput = (byte >> 4) & 0x0F;
          if (order === 'MSB') {
            assert.strictEqual((result >> 4) & 0x0F, firstPixelInInput);
          } else {
            assert.strictEqual(result & 0x0F, firstPixelInInput);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: pixel-order-control, Property 15: 8 BPP 无重排序**
   * *对于任何*8 BPP 像素数据，应保持每字节 1 个像素，无需进行位重排序
   * **Validates: Requirements 4.4**
   */
  it('Property 15: 8 BPP no reordering - 1 pixel per byte unchanged', function () {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.constantFrom('MSB', 'LSB'),
        (byte, order) => {
          const result = reorderByte(byte, 8, order);

          // 8 BPP 时，无论 MSB 还是 LSB，结果都应该与输入相同
          // 因为每字节只有一个像素，不需要重排序
          assert.strictEqual(result, byte);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Default Behavior Properties', function () {

  // Test font data - minimal glyph for testing
  function createTestFontData() {
    return {
      size: 10,
      ascent: 8,
      descent: -2,
      typoAscent: 8,
      typoDescent: -2,
      typoLineGap: 0,
      glyphs: [
        {
          code: 65, // 'A'
          advanceWidth: 7,
          bbox: { x: 0, y: 0, width: 6, height: 8 },
          kerning: {},
          pixels: [
            [ 0, 128, 128, 128, 128, 0 ],
            [ 128, 128, 0, 0, 128, 128 ],
            [ 128, 128, 0, 0, 128, 128 ],
            [ 255, 255, 255, 255, 255, 255 ],
            [ 128, 128, 0, 0, 128, 128 ],
            [ 128, 128, 0, 0, 128, 128 ],
            [ 128, 128, 0, 0, 128, 128 ],
            [ 0, 0, 0, 0, 0, 0 ]
          ]
        }
      ]
    };
  }

  /**
   * **Feature: pixel-order-control, Property 3: 默认排序行为**
   * *对于任何*像素数据，当未指定像素排序时，结果应与明确指定 MSB 排序相同
   * **Validates: Requirements 1.3**
   */
  it('Property 3: Default ordering behavior - undefined equals MSB', function () {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 2, 4, 8), // BPP values
        bpp => {
          const fontData = createTestFontData();

          // Create font with explicit MSB
          const fontMSB = new Font(fontData, {
            bpp,
            no_compress: true,
            pixel_order: 'MSB'
          });

          // Create font with undefined pixel_order (default behavior)
          const fontDefault = new Font(fontData, {
            bpp,
            no_compress: true
            // pixel_order is undefined
          });

          // Get glyf table binary data
          const binMSB = fontMSB.glyf.toBin();
          const binDefault = fontDefault.glyf.toBin();

          // The binary output should be identical
          assert.strictEqual(binMSB.length, binDefault.length,
            `Glyf table length mismatch for BPP ${bpp}`);
          assert.ok(binMSB.equals(binDefault),
            `Glyf table content mismatch for BPP ${bpp}: default should equal MSB`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
