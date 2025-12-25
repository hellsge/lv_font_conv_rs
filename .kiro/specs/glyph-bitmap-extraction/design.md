# 设计文档

## 概述

本设计文档描述了为 lv_font_conv 添加 glyph bitmap 提取功能的技术实现方案。该功能允许将字形 bitmap 数据从 C 源文件中分离到独立的二进制文件中，用于嵌入式系统的 flash 存储优化。

核心设计原则：
- 在字体生成过程中同时输出 C 文件和二进制文件（而非后处理）
- 保持与现有 LVGL writer 架构的兼容性
- 确保提取的二进制数据与内联版本完全一致
- 最小化对现有代码的侵入性修改

## 架构

### 整体流程

```
CLI 参数解析 (cli.js)
    ↓
字体数据采集 (collect_font_data.js)
    ↓
转换器调度 (convert.js)
    ↓
LVGL Writer (lib/writers/lvgl/)
    ├─ 检测 --extract-glyph-bitmap 标志
    ├─ LvGlyf.lv_compile() - 生成 bitmap 数据
    ├─ 条件分支：
    │   ├─ 提取模式：生成宏引用 C + 二进制文件
    │   └─ 标准模式：生成内联数组 C 文件
    ↓
输出多个文件
    ├─ {font_name}.c (带宏引用或内联数组)
    └─ {font_name}_glyph_bitmap.bin (仅提取模式)
```

### 关键设计决策

**决策 1：在生成过程中直接输出，而非后处理**
- **理由**：`LvGlyf.lv_compile()` 已经生成了所有 glyph 的 Buffer 数据（`lv_data[].bin`），直接使用这些数据可以保证字节序、对齐、压缩设置的完全一致性
- **影响**：需要修改 writer 接口以支持返回多个文件

**决策 2：通过 CLI 标志控制功能启用**
- **理由**：保持向后兼容，默认行为不变
- **实现**：添加 `--extract-glyph-bitmap` 参数

**决策 3：使用宏引用而非直接地址**
- **理由**：允许用户在编译时定义 flash 地址，提供最大灵活性
- **实现**：生成 `#ifndef GLYPH_BITMAP_BIN` 保护的宏定义

## 组件和接口

### 1. CLI 参数扩展 (lib/cli.js)

**新增参数：**
```javascript
parser.add_argument('--extract-glyph-bitmap', {
  dest: 'extract_glyph_bitmap',
  action: 'store_true',
  default: false,
  help: 'Extract glyph bitmap data to a separate binary file for flash storage.'
});
```

**验证逻辑：**
- 仅在 `--format lvgl` 时允许使用
- 与其他参数（压缩、对齐等）兼容性检查

### 2. Writer 接口修改 (lib/writers/lvgl/index.js)

**当前接口：**
```javascript
module.exports = function write_images(args, fontData) {
  return {
    [args.output]: font.toLVGL()
  };
};
```

**修改后接口：**
```javascript
module.exports = function write_images(args, fontData) {
  const font = new Font(fontData, args);
  const result = {};
  
  if (args.extract_glyph_bitmap) {
    const ext = path.extname(args.output);
    const baseName = path.basename(args.output, ext);
    const dir = path.dirname(args.output);
    
    result[args.output] = font.toLVGL(true); // 带宏引用的 C 代码
    result[path.join(dir, `${baseName}_glyph_bitmap.bin`)] = font.glyf.toBinaryFile();
  } else {
    result[args.output] = font.toLVGL(false); // 标准内联数组
  }
  
  return result;
};
```

### 3. LvGlyf 类扩展 (lib/writers/lvgl/lv_table_glyf.js)

**新增方法：**

```javascript
// 生成二进制文件内容
toBinaryFile() {
  this.lv_compile();
  
  // 将所有 glyph bitmap 拼接成单个 Buffer
  const buffers = [];
  this.lv_data.forEach((d, idx) => {
    if (idx === 0) return; // 跳过保留的 id=0
    buffers.push(d.bin);
  });
  
  return Buffer.concat(buffers);
}

// 生成带宏引用的 LVGL 代码
toLVGLWithExternalBitmap(macroName) {
  this.lv_compile();
  
  return `
/*-----------------
 *    BITMAPS
 *----------------*/

/*Glyph bitmap data is stored in external binary file: ${macroName}_glyph_bitmap.bin
 *Define ${macroName.toUpperCase()}_GLYPH_BITMAP_BIN as the memory address where the binary is loaded.*/
#ifndef ${macroName.toUpperCase()}_GLYPH_BITMAP_BIN
#define ${macroName.toUpperCase()}_GLYPH_BITMAP_BIN 0
#warning "Please define ${macroName.toUpperCase()}_GLYPH_BITMAP_BIN to the flash memory address"
#endif

static const uint8_t * const glyph_bitmap = (const uint8_t *)${macroName.toUpperCase()}_GLYPH_BITMAP_BIN;

/*---------------------
 *  GLYPH DESCRIPTION
 *--------------------*/

static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
${this.to_lv_glyph_dsc()}
};
`.trim();
}
```

**修改现有方法：**

```javascript
toLVGL(extractBitmap = false, macroName = '') {
  if (extractBitmap) {
    return this.toLVGLWithExternalBitmap(macroName);
  }
  
  // 现有逻辑保持不变
  return `
/*-----------------
 *    BITMAPS
 *----------------*/

/*Store the image of the glyphs*/
static ${this.font.opts.align !== 1 ? 'LV_ATTRIBUTE_MEM_ALIGN ' : ''}LV_ATTRIBUTE_LARGE_CONST const uint8_t glyph_bitmap[] = {
${this.to_lv_bitmaps()}
};

/*---------------------
 *  GLYPH DESCRIPTION
 *--------------------*/

static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
${this.to_lv_glyph_dsc()}
};
`.trim();
}
```

### 4. LvFont 类修改 (lib/writers/lvgl/lv_font.js)

**修改 toLVGL 方法签名：**

```javascript
toLVGL(extractBitmap = false) {
  let guard_name = this.font_name.toUpperCase();

  return `/*******************************************************************************
 * Size: ${this.src.size} px
 * Bpp: ${this.opts.bpp}
 * Opts: ${this.opts.opts_string}
 ******************************************************************************/

#ifdef __has_include
    #if __has_include("lvgl.h")
        #ifndef LV_LVGL_H_INCLUDE_SIMPLE
            #define LV_LVGL_H_INCLUDE_SIMPLE
        #endif
    #endif
#endif

#ifdef LV_LVGL_H_INCLUDE_SIMPLE
    #include "lvgl.h"
#else
    #include "${this.opts.lv_include || 'lvgl/lvgl.h'}"
#endif

${this.stride_guard()}

#ifndef ${guard_name}
#define ${guard_name} 1
#endif

#if ${guard_name}

${this.glyf.toLVGL(extractBitmap, this.font_name)}

${this.cmap.toLVGL()}

${this.kern.toLVGL()}

${this.head.toLVGL()}

${this.large_format_guard()}

#endif /*#if ${guard_name}*/
`;
}
```

## 数据模型

### Glyph Bitmap 数据结构

**内存中的表示（lv_data 数组）：**
```javascript
[
  { bin: Buffer, offset: 0, glyph: {...} },      // id=0 保留
  { bin: Buffer, offset: 0, glyph: {...} },      // id=1
  { bin: Buffer, offset: N, glyph: {...} },      // id=2
  ...
]
```

**二进制文件布局：**
```
+------------------+
| Glyph 1 bitmap   |  (lv_data[1].bin)
+------------------+
| Glyph 2 bitmap   |  (lv_data[2].bin)
+------------------+
| ...              |
+------------------+
| Glyph N bitmap   |  (lv_data[N].bin)
+------------------+
```

**关键属性：**
- 每个 glyph 的 bitmap 已经包含了对齐填充（由 `lv_bitmap()` 方法处理）
- offset 值在 `glyph_dsc` 数组中的 `bitmap_index` 字段中使用
- 二进制文件中的偏移量与内联数组版本完全一致

### C 代码中的引用

**标准模式（内联数组）：**
```c
static const uint8_t glyph_bitmap[] = {
    /* U+0041 "A" */
    0x00, 0x01, 0x02, ...
};

static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
    {.bitmap_index = 0, .adv_w = 256, ...}
};
```

**提取模式（宏引用）：**
```c
#ifndef MYFONT_GLYPH_BITMAP_BIN
#define MYFONT_GLYPH_BITMAP_BIN 0
#warning "Please define MYFONT_GLYPH_BITMAP_BIN to the flash memory address"
#endif

static const uint8_t * const glyph_bitmap = (const uint8_t *)MYFONT_GLYPH_BITMAP_BIN;

static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {
    {.bitmap_index = 0, .adv_w = 256, ...}
};
```

**用户使用示例：**
```c
// 在编译时定义 flash 地址
#define MYFONT_GLYPH_BITMAP_BIN 0x08100000

#include "myfont.c"
```

## 正确性属性

*属性是应该在系统所有有效执行中保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1：二进制文件内容一致性
*对于任何* 字体配置（bpp、对齐、压缩设置），提取模式生成的二进制文件内容应该与标准模式下 `glyph_bitmap[]` 数组的字节序列完全相同
**验证：需求 1.1, 2.3, 4.1, 4.2, 4.5**

### 属性 2：Offset 值保持不变
*对于任何* 字体，提取模式下 `glyph_dsc[]` 中的 `bitmap_index` 值应该与标准模式下的值完全相同
**验证：需求 1.5, 5.4**

### 属性 3：文件命名一致性
*对于任何* 输出文件名 `{name}.c`，生成的二进制文件应该命名为 `{name}_glyph_bitmap.bin`，且宏名称应该为 `{NAME}_GLYPH_BITMAP_BIN`
**验证：需求 1.2, 1.4**

### 属性 4：宏引用替换
*对于任何* 启用提取模式的字体，生成的 C 代码应该使用宏引用指针而非内联数组，且包含外部文件依赖的注释
**验证：需求 1.3, 2.4, 5.1, 5.2**

### 属性 5：多字体独立性
*对于任何* 多次调用转换器的场景，每个字体应该生成独立的二进制文件，文件之间不应有数据共享或冲突
**验证：需求 2.5**

### 属性 6：格式兼容性验证
*对于任何* 启用 `--extract-glyph-bitmap` 的命令，如果 `--format` 不是 `lvgl`，应该产生错误并阻止执行
**验证：需求 3.2, 3.4**

### 属性 7：元数据完整性
*对于任何* 字体，提取模式下生成的 C 文件应该包含与标准模式相同的 cmap、kern、head 表数据
**验证：需求 1.5, 2.2**

### 属性 8：对齐保持
*对于任何* 使用 `--align N` 参数的字体，二进制文件中每个 glyph bitmap 的起始位置应该满足 N 字节对齐
**验证：需求 4.4, 5.3**

### 属性 9：输出目录一致性
*对于任何* 指定的输出路径，二进制文件应该与 C 源文件创建在同一目录中
**验证：需求 3.5**

### 属性 10：LVGL 结构兼容性
*对于任何* 启用提取模式的字体，生成的 C 代码应该能够被 C 编译器成功编译为有效的 LVGL 字体结构
**验证：需求 2.1**

### 属性 11：压缩一致性
*对于任何* 启用压缩的字体配置，提取的二进制文件应该包含压缩后的数据，且与标准模式下的压缩数据完全一致
**验证：需求 4.3**

### 属性 12：成功输出报告
*对于任何* 成功完成的转换，CLI 应该报告所有生成的文件名称和位置，包括 C 文件和二进制文件
**验证：需求 3.3**

## 错误处理

### 错误场景和处理策略

**1. 不兼容的输出格式**
- **场景**：用户在非 LVGL 格式下使用 `--extract-glyph-bitmap`
- **检测点**：`cli.js` 参数验证阶段
- **处理**：抛出 `AppError`，提示仅支持 `--format lvgl`
- **错误消息**：`"--extract-glyph-bitmap is only supported with --format lvgl"`

**2. 输出路径未指定**
- **场景**：启用提取但未提供 `--output` 参数
- **检测点**：`lib/writers/lvgl/index.js`
- **处理**：已有检查逻辑，无需修改
- **错误消息**：`"Output is required for 'lvgl' writer"`

**3. 文件写入失败**
- **场景**：磁盘空间不足或权限问题
- **检测点**：`cli.js` 文件写入阶段
- **处理**：捕获异常并显示详细错误信息
- **错误消息**：包含文件路径和系统错误原因

**4. 二进制文件大小异常**
- **场景**：生成的二进制文件大小与预期不符
- **检测点**：`toBinaryFile()` 方法
- **处理**：添加断言检查，验证总大小等于所有 `lv_data[].bin.length` 之和
- **错误消息**：`"Binary file size mismatch: expected X bytes, got Y bytes"`

### 验证和警告

**编译时警告（C 代码）：**
```c
#ifndef MYFONT_GLYPH_BITMAP_BIN
#warning "Please define MYFONT_GLYPH_BITMAP_BIN to the flash memory address"
#endif
```

**运行时验证（JavaScript）：**
- 在 `toBinaryFile()` 中验证所有 buffer 非空
- 在 writer 中验证文件名不冲突
- 在 CLI 中验证参数组合的有效性

## 测试策略

### 单元测试

**测试文件：** `test/test_extract_glyph_bitmap.js`

**测试用例：**

1. **基本功能测试**
   - 测试 `toBinaryFile()` 返回正确的 Buffer
   - 测试 `toLVGLWithExternalBitmap()` 生成正确的宏引用代码
   - 测试文件命名逻辑

2. **边界条件测试**
   - 空字体（仅保留字符）
   - 单个字符
   - 大量字符（1000+）
   - 不同 bpp 值（1, 2, 4, 8）

3. **参数组合测试**
   - 不同对齐值（1, 4, 8, 16）
   - 启用/禁用压缩
   - 启用/禁用 prefilter
   - 不同 stride 值

4. **错误处理测试**
   - 不兼容格式组合
   - 缺少必需参数

### 属性测试

**测试框架：** fast-check (JavaScript 属性测试库)

**配置：** 每个属性测试运行至少 100 次迭代

**属性测试用例：**

1. **属性 1 测试：二进制内容一致性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 1: 二进制文件内容一致性
   // Validates: Requirements 1.1, 2.3, 4.1, 4.2, 4.5
   fc.assert(
     fc.property(
       fontConfigArbitrary(), // 生成随机字体配置
       async (config) => {
         const standardOutput = await convert({...config, extract_glyph_bitmap: false});
         const extractedOutput = await convert({...config, extract_glyph_bitmap: true});
         
         // 从标准输出中提取 glyph_bitmap 数组的字节
         const standardBytes = extractBitmapBytesFromC(standardOutput[config.output]);
         const extractedBytes = extractedOutput[`${baseName}_glyph_bitmap.bin`];
         
         return Buffer.compare(standardBytes, extractedBytes) === 0;
       }
     ),
     { numRuns: 100 }
   );
   ```

2. **属性 2 测试：Offset 值一致性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 2: Offset 值保持不变
   // Validates: Requirements 1.5, 5.4
   fc.assert(
     fc.property(
       fontConfigArbitrary(),
       async (config) => {
         const standardOutput = await convert({...config, extract_glyph_bitmap: false});
         const extractedOutput = await convert({...config, extract_glyph_bitmap: true});
         
         const standardOffsets = extractOffsetsFromC(standardOutput[config.output]);
         const extractedOffsets = extractOffsetsFromC(extractedOutput[config.output]);
         
         return JSON.stringify(standardOffsets) === JSON.stringify(extractedOffsets);
       }
     ),
     { numRuns: 100 }
   );
   ```

3. **属性 3 测试：文件命名一致性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 3: 文件命名一致性
   // Validates: Requirements 1.2, 1.4
   fc.assert(
     fc.property(
       fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
       (fontName) => {
         const output = `${fontName}.c`;
         const expectedBinName = `${fontName}_glyph_bitmap.bin`;
         const expectedMacroName = `${fontName.toUpperCase()}_GLYPH_BITMAP_BIN`;
         
         // 测试命名逻辑
         const actualBinName = generateBinaryFileName(output);
         const actualMacroName = generateMacroName(fontName);
         
         return actualBinName === expectedBinName && actualMacroName === expectedMacroName;
       }
     ),
     { numRuns: 100 }
   );
   ```

4. **属性 4 测试：宏引用替换**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 4: 宏引用替换
   // Validates: Requirements 1.3, 2.4, 5.1, 5.2
   fc.assert(
     fc.property(
       fontConfigArbitrary(),
       async (config) => {
         config.extract_glyph_bitmap = true;
         const output = await convert(config);
         const cCode = output[config.output];
         
         // 验证使用了宏引用而非内联数组
         const hasMacroReference = cCode.includes('_GLYPH_BITMAP_BIN');
         const hasPointerDeclaration = /const uint8_t \* const glyph_bitmap/.test(cCode);
         const hasComment = cCode.includes('external binary file');
         const noInlineArray = !cCode.includes('glyph_bitmap[] = {');
         
         return hasMacroReference && hasPointerDeclaration && hasComment && noInlineArray;
       }
     ),
     { numRuns: 100 }
   );
   ```

5. **属性 5 测试：多字体独立性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 5: 多字体独立性
   // Validates: Requirements 2.5
   fc.assert(
     fc.property(
       fc.array(fontConfigArbitrary(), { minLength: 2, maxLength: 5 }),
       async (configs) => {
         const outputs = [];
         for (const config of configs) {
           config.extract_glyph_bitmap = true;
           config.output = `font_${configs.indexOf(config)}.c`;
           outputs.push(await convert(config));
         }
         
         // 验证每个字体有独立的二进制文件
         const binFiles = outputs.flatMap(o => Object.keys(o).filter(k => k.endsWith('.bin')));
         const uniqueBinFiles = new Set(binFiles);
         
         return binFiles.length === uniqueBinFiles.size && binFiles.length === configs.length;
       }
     ),
     { numRuns: 100 }
   );
   ```

6. **属性 6 测试：格式兼容性验证**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 6: 格式兼容性验证
   // Validates: Requirements 3.2, 3.4
   fc.assert(
     fc.property(
       fc.constantFrom('bin', 'dump'), // 非 lvgl 格式
       (format) => {
         const config = { format, extract_glyph_bitmap: true, /* ... */ };
         
         try {
           validateArgs(config);
           return false; // 应该抛出错误
         } catch (err) {
           return err.message.includes('only supported with --format lvgl');
         }
       }
     ),
     { numRuns: 100 }
   );
   ```

7. **属性 7 测试：元数据完整性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 7: 元数据完整性
   // Validates: Requirements 1.5, 2.2
   fc.assert(
     fc.property(
       fontConfigArbitrary(),
       async (config) => {
         const standardOutput = await convert({...config, extract_glyph_bitmap: false});
         const extractedOutput = await convert({...config, extract_glyph_bitmap: true});
         
         // 提取并比较 cmap、kern、head 表数据
         const standardMetadata = extractMetadata(standardOutput[config.output]);
         const extractedMetadata = extractMetadata(extractedOutput[config.output]);
         
         return JSON.stringify(standardMetadata) === JSON.stringify(extractedMetadata);
       }
     ),
     { numRuns: 100 }
   );
   ```

8. **属性 8 测试：对齐保持**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 8: 对齐保持
   // Validates: Requirements 4.4, 5.3
   fc.assert(
     fc.property(
       fc.constantFrom(1, 4, 8, 16, 32, 64), // 对齐值
       fontConfigArbitrary(),
       async (align, config) => {
         config.align = align;
         config.extract_glyph_bitmap = true;
         
         const output = await convert(config);
         const binFile = output[`${baseName}_glyph_bitmap.bin`];
         
         // 解析二进制文件，检查每个 glyph 的起始位置
         const offsets = extractOffsetsFromC(output[config.output]);
         
         return offsets.every(offset => offset % align === 0);
       }
     ),
     { numRuns: 100 }
   );
   ```

9. **属性 9 测试：输出目录一致性**
   ```javascript
   // Feature: glyph-bitmap-extraction, Property 9: 输出目录一致性
   // Validates: Requirements 3.5
   fc.assert(
     fc.property(
       fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
       fontConfigArbitrary(),
       async (pathParts, config) => {
         const outputPath = path.join(...pathParts, 'font.c');
         config.output = outputPath;
         config.extract_glyph_bitmap = true;
         
         const output = await convert(config);
         const binFileName = Object.keys(output).find(k => k.endsWith('.bin'));
         
         return path.dirname(binFileName) === path.dirname(outputPath);
       }
     ),
     { numRuns: 100 }
   );
   ```

10. **属性 11 测试：压缩一致性**
    ```javascript
    // Feature: glyph-bitmap-extraction, Property 11: 压缩一致性
    // Validates: Requirements 4.3
    fc.assert(
      fc.property(
        fontConfigArbitrary(),
        async (config) => {
          config.no_compress = false; // 启用压缩
          
          const standardOutput = await convert({...config, extract_glyph_bitmap: false});
          const extractedOutput = await convert({...config, extract_glyph_bitmap: true});
          
          const standardBytes = extractBitmapBytesFromC(standardOutput[config.output]);
          const extractedBytes = extractedOutput[`${baseName}_glyph_bitmap.bin`];
          
          // 压缩后的数据应该完全一致
          return Buffer.compare(standardBytes, extractedBytes) === 0;
        }
      ),
      { numRuns: 100 }
    );
    ```

### 集成测试

**测试场景：**

1. **端到端 CLI 测试**
   - 使用真实字体文件（HarmonyOS.ttf）
   - 执行完整的 CLI 命令
   - 验证生成的 C 文件和 bin 文件
   - 使用 C 编译器验证 C 代码可编译

2. **多字体测试**
   - 连续转换多个字体
   - 验证文件不冲突
   - 验证每个二进制文件独立

3. **实际嵌入式场景模拟**
   - 生成字体文件
   - 模拟将 bin 文件加载到特定地址
   - 验证 C 代码可以正确访问数据

### 测试辅助工具

**生成器（Arbitraries）：**

```javascript
// 生成随机字体配置
function fontConfigArbitrary() {
  return fc.record({
    size: fc.integer({ min: 8, max: 72 }),
    bpp: fc.constantFrom(1, 2, 4, 8),
    align: fc.constantFrom(1, 4, 8, 16),
    no_compress: fc.boolean(),
    font: fc.array(fontSourceArbitrary(), { minLength: 1, maxLength: 3 })
  });
}

// 生成随机字体源
function fontSourceArbitrary() {
  return fc.record({
    source_path: fc.constant('HarmonyOS.ttf'),
    ranges: fc.array(rangeArbitrary(), { minLength: 1, maxLength: 5 })
  });
}
```

**解析辅助函数：**

```javascript
// 从 C 代码中提取 glyph_bitmap 数组的字节
function extractBitmapBytesFromC(cCode) {
  // 解析 C 代码，提取十六进制数据
  // 返回 Buffer
}

// 从 C 代码中提取 bitmap_index 值
function extractOffsetsFromC(cCode) {
  // 解析 glyph_dsc 数组
  // 返回 offset 数组
}
```

### 测试覆盖率目标

- 行覆盖率：> 90%
- 分支覆盖率：> 85%
- 函数覆盖率：> 95%

### 持续集成

- 所有测试在 PR 合并前必须通过
- 属性测试在 CI 中运行完整的 100 次迭代
- 集成测试使用真实字体文件
- 性能回归测试：确保提取模式不显著增加处理时间
