export function formatMathMarkdown(text: string): string {
  if (!text) return '';

  // ✅ Remove Markdown-style headers like ### Derivation
  text = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('###'))
    .join('\n');

  // ✅ Fix broken bold markdown with no spaces: **1.TaylorSeriesExpansion**
  text = text.replace(/\*\*([A-Za-z0-9.]+)\*\*/g, (_, match) => {
    const spaced = match
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Z])/g, '$1 $2')
      .replace(/\./g, '. ');
    return `**${spaced.trim()}**`;
  });

  // ✅ Fix malformed bold lines like **1.TaylorSeriesExpansion:**
  text = text.replace(/\*\*([^*]+?)\*\*/g, (_, match) => {
    const needsSpacing = !/\s/.test(match);
    if (!needsSpacing) return `**${match}**`;

    const spaced = match
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Z])/g, '$1 $2')
      .replace(/\./g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    return `** ${spaced} **`;
  });

  // ✅ Fix escaped LaTeX delimiters
  let formatted = text
    .replace(/\\\[/g, '$$\n')
    .replace(/\\\]/g, '\n$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\n{3,}/g, '\n\n');

  // ✅ Fix heading collisions
  formatted = formatted.replace(/(\$\$[^\$]*?\$\$)([ \t]*#+)/g, (_, math, heading) => `${math.trim()}\n\n${heading}`);
  formatted = formatted.replace(/(\$[^\$]+?\$)([ \t]*#+)/g, (_, math, heading) => `${math.trim()}\n\n${heading}`);
  formatted = formatted.replace(/(#+.*?)\s+\$([^$]+?)\$\s*[-–—]/g, (_, heading, expr) => `${heading}\n\n$${expr}$\n`);

  // ✅ Fix unclosed math delimiters line-by-line
  const lines = formatted.split('\n');
  const cleaned: string[] = [];

  for (let line of lines) {
    const dollarCount = (line.match(/\$(?!\$)/g) || []).length;
    if (dollarCount % 2 !== 0) {
      if (line.includes('$$')) line += ' $$';
      else line += ' $';
    }

    // Normalize inline-block mixups
    line = line.replace(/\$\$(.+?)\$(?!\$)/g, (_, expr) => `$$${expr}$$`);
    line = line.replace(/\$(.+?)\$\$/g, (_, expr) => `$$${expr}$$`);
    cleaned.push(line);
  }

  let result = cleaned.join('\n');

  // ✅ Handle obvious triple-dollar cases only
  result = result
    .replace(/\$\$\$/g, '$$')
    .replace(/\$\$([^\$]+?)\$(?!\$)/g, (_, expr) => `$$${expr}$$`)
    .replace(/\$([^\$]+?)\$\$/g, (_, expr) => `$$${expr}$$`);

  // ✅ Inject $$ around standalone $ $ blocks only if content looks mathy
  const resultLines = result.split('\n');
  const outputLines: string[] = [];

  const isStandaloneDollar = (line: string) => line.trim() === '$ $' || line.trim() === '$';

  let i = 0;
  while (i < resultLines.length) {
    const line = resultLines[i].trim();

    if (isStandaloneDollar(line)) {
      let j = i + 1;
      while (j < resultLines.length && !isStandaloneDollar(resultLines[j])) j++;

      if (j < resultLines.length) {
        const inner = resultLines.slice(i + 1, j);
        const content = inner.map(l => l.trim()).join(' ').trim();
        if (/\d|=|\\frac/.test(content)) {
          outputLines.push('$$');
          outputLines.push(...inner);
          outputLines.push('$$');
        } else {
          outputLines.push(resultLines[i]);
          outputLines.push(...inner);
          outputLines.push(resultLines[j]);
        }
        i = j + 1;
        continue;
      }
    }

    outputLines.push(resultLines[i]);
    i++;
  }

  // ✅ Remove $$...$$ blocks that have no numeric content
  const finalSanitizedOutput: string[] = [];
  let insideDouble = false;
  let tempBlock: string[] = [];

  for (let line of outputLines) {
    if (line.trim() === '$$') {
      if (!insideDouble) {
        insideDouble = true;
        tempBlock = ['$$'];
      } else {
        tempBlock.push('$$');
        const content = tempBlock.slice(1, -1).join(' ');
        if (/\d|=/.test(content)) {
          finalSanitizedOutput.push(...tempBlock);
        }
        insideDouble = false;
        tempBlock = [];
      }
    } else if (insideDouble) {
      tempBlock.push(line);
    } else {
      finalSanitizedOutput.push(line);
    }
  }

  return finalSanitizedOutput.join('\n');
}