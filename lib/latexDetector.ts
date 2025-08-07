export function detectLatexFormats(text: string): {
  original: string;
  sanitized: string;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {
    'Valid Inline Math ($...$)': 0,
    'Unclosed Inline Math ($... no end)': 0,
    'Double Ended Inline Math ($...$$)': 0,
    'Triple Dollar ($$$)': 0,
    'Valid Block Math ($$...$$)': 0,
    'Unclosed Block Math ($$... no end)': 0,
    'Trailing Dollar After Block ($$...$$$)': 0,
    'MathJax Inline (\\(...\\))': 0,
    'MathJax Block (\\[...\\])': 0,
    '❌ Red Flags Detected': 0,
  };

  const original = text;

  const filteredText = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('###'))
    .join('\n');

  const patterns: Record<string, RegExp> = {
    'Valid Inline Math ($...$)': /\$(?!\$)([^$\n]{1,200}?)\$(?!\$)/g,
    'Unclosed Inline Math ($... no end)': /\$[^$\n]{1,200}(?!\$)(?=\s|$|\n)/g,
    'Double Ended Inline Math ($...$$)': /\$[^$\n]+?\$\$(?!\$)/g,
    'Triple Dollar ($$$)': /\${3}(?!\$)/g,
    'Valid Block Math ($$...$$)': /\$\$[^$]{1,2000}?\$\$/gs,
    'Unclosed Block Math ($$... no end)': /\$\$[^$]{1,2000}(?!\$\$)/gs,
    'Trailing Dollar After Block ($$...$$$)': /\$\$[^$]{1,2000}?\$\$\$(?!\$)/gs,
    'MathJax Inline (\\(...\\))': /\\\([^\n]{1,200}?\\\)/g,
    'MathJax Block (\\[...\\])': /\\\[[^\n]{1,2000}?\\\]/g,
  };

  for (const [label, regex] of Object.entries(patterns)) {
    const matches = filteredText.match(regex);
    counts[label] = matches ? matches.length : 0;
  }

  const redPatterns: RegExp[] = [
    /\$\s+[a-zA-Z]/g,
    /[a-zA-Z]\s+\$/g,
    /\$[^\s$]+\s+[a-zA-Z]/g,
    /[^$]\$[^$\n]*$/gm,
    /[^$]\$[^$\n]+\$[^$\n]+\$/g,
    /\$\$\$\s*[^\$]/g,
    /\$\$[\s\S]*?\$\$\$/g,
    /\$[^$\n]*\$\$\$/g,
    /\$\$[a-zA-Z]/g,
    /\$\$[\.\,\)\:\;!?\]]/g,
    /\$\$[^\s]/g,
  ];

  let redCount = 0;
  for (const redRegex of redPatterns) {
    const matches = filteredText.match(redRegex);
    redCount += matches ? matches.length : 0;
  }

  counts['❌ Red Flags Detected'] = redCount;

  console.log('🟡 Original Message:\n', original);
  console.log('\n🟢 Sanitized Message (headers removed):\n', filteredText);

  return { original, sanitized: filteredText, counts };
}