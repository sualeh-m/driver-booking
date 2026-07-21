---
name: Report export branding
description: How the KPI report exports embed the company logo (PDF via jsPDF, Excel via exceljs) and pitfalls hit.
---
- CSV cannot embed images — when a logo was required in the "Excel" export, it was upgraded to a real .xlsx via exceljs (lazily dynamic-imported so the initial bundle stays small).
- The logo is baked in as a base64 data-URL TS module (with pixel-dimension constants for aspect-ratio math) so exports never depend on network/asset paths.
- **Why:** the source logo JPEG was CMYK — browsers/jsPDF mishandle CMYK; it must be converted to sRGB (ImageMagick `-colorspace sRGB`) and whitespace-trimmed before embedding, or it renders wrong/tiny.
- **How to apply:** any future embedded export image: trim, convert to sRGB, resize modestly, bake as base64 module; PDF size from a fixed width / aspect constant.
