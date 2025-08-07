export function formatMathAndExtract(text: string): {
  formatted: string;
  mathBlocks: string[];
  contentType: string;
} {
  if (!text) return { formatted: '', mathBlocks: [], contentType: 'plain' };

  let formatted = text
    .replace(/\\\[/g, '$$\n')
    .replace(/\\\]/g, '\n$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/(?<!\n)\$\$(.+?)\$\$(?!\n)/gs, '\n$$$1$$\n')
    .replace(/\n{3,}/g, '\n\n');

  const lines = formatted.split('\n');
  const cleaned: string[] = [];
  const mathBlocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim();

    // Remove ( ... ) or [ ... ] wrapping raw expressions
    const isWrappedExpr = /^\(([^()]+)\)$/.test(line) || /^\[([^\[\]]+)\]$/.test(line);
    const inner = line.replace(/^[\[(]\s*/, '').replace(/\s*[\])]\s*$/, '').trim();
    const next = nextLine?.replace(/^[\[(]\s*/, '').replace(/\s*[\])]\s*$/, '').trim();

    // If this line and next are the same expression, keep only one
    if (isWrappedExpr && inner === next) {
      cleaned.push(`$${inner}$`);
      mathBlocks.push(inner);
      i++; // skip duplicate
    } else {
      // Handle block math
      if (line.startsWith('$$') && line.endsWith('$$')) {
        const latex = line.replace(/\$\$/g, '').trim();
        mathBlocks.push(latex);

        const plain = latex.replace(/\\/g, '').replace(/\s+/g, '').toLowerCase();
        const nextPlain = next?.replace(/\\/g, '').replace(/\s+/g, '').toLowerCase();

        if (plain === nextPlain) {
          cleaned.push(line);
          i++;
        } else {
          cleaned.push(line);
        }
      } else {
        cleaned.push(lines[i]);
      }
    }
  }

  const contentType = mathBlocks.length > 0 ? 'latex' : 'plain';

  return {
    formatted: cleaned.join('\n'),
    mathBlocks,
    contentType,
  };
}