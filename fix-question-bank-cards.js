const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, 'question-bank');
const targetRange = new Set(Array.from({ length: 21 }, (_, i) => String(i + 4).padStart(2, '0')));

function decodeBasic(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(text) {
  return decodeBasic(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function splitTopLevelBlocks(html) {
  const blocks = [];
  const re = /<(p|div|pre|table|ul|ol|blockquote|details)\b[\s\S]*?<\/\1>/gi;
  let match;
  let last = 0;
  while ((match = re.exec(html))) {
    if (match.index > last && html.slice(last, match.index).trim()) {
      blocks.push(html.slice(last, match.index));
    }
    blocks.push(match[0]);
    last = re.lastIndex;
  }
  if (last < html.length && html.slice(last).trim()) {
    blocks.push(html.slice(last));
  }
  return blocks.filter((b) => b.trim());
}

function isP(block) {
  return /^<p\b/i.test(block.trim());
}

function pInner(block) {
  const match = block.trim().match(/^<p\b[^>]*>([\s\S]*?)<\/p>$/i);
  return match ? match[1].trim() : block.trim();
}

function makeP(inner) {
  return `<p>${inner.trim()}</p>`;
}

function optionStart(block) {
  if (!isP(block)) return null;
  const inner = pInner(block);
  const plain = stripTags(inner);
  const match = plain.match(/^([A-H])[\.\．、]\s*/);
  return match ? match[1] : null;
}

function splitInlineOptions(inner) {
  const normalized = inner.replace(/\s+/g, ' ').trim();
  const positions = [];
  const re = /(^|\s)([A-H])[\.\．、]\s*/g;
  let match;
  while ((match = re.exec(normalized))) {
    positions.push({ label: match[2], index: match.index + match[1].length, end: re.lastIndex });
  }
  const labels = positions.map((p) => p.label).join('');
  if (!labels.startsWith('ABCD')) return null;
  const question = normalized.slice(0, positions[0].index).trim();
  const options = [];
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].end;
    const end = i + 1 < positions.length ? positions[i + 1].index : normalized.length;
    options.push({ label: positions[i].label, content: normalized.slice(start, end).trim() });
  }
  return { question, options };
}

function renderOptions(options) {
  const hasCode = options.some((opt) => /<(div|pre)\b[^>]*(sourceCode|class="[^"]*sourceCode|<pre)/i.test(opt.content));
  const items = options
    .map((opt) => {
      const content = opt.content.replace(/^<p>\s*/i, '').replace(/\s*<\/p>$/i, '').trim();
      return `<li><span class="option-label">${opt.label}</span><div class="option-content">${content}</div></li>`;
    })
    .join('');
  return `<div class="option-list${hasCode ? ' option-list-code' : ''}"><ul>${items}</ul></div>`;
}

function convertOptions(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (isP(block)) {
      const inline = splitInlineOptions(pInner(block));
      if (inline) {
        if (inline.question) out.push(makeP(inline.question));
        out.push(renderOptions(inline.options));
        continue;
      }
    }

    const firstLabel = optionStart(block);
    if (firstLabel) {
      const options = [];
      while (i < blocks.length) {
        const label = optionStart(blocks[i]);
        if (!label) break;
        let content = pInner(blocks[i]).replace(new RegExp(`^${label}[\\.．、]\\s*`), '').trim();
        i += 1;
        while (i < blocks.length && !optionStart(blocks[i]) && !isAnswerStart(blocks[i])) {
          content += blocks[i];
          i += 1;
        }
        options.push({ label, content });
      }
      i -= 1;
      out.push(renderOptions(options));
      continue;
    }

    if (/^<ul\b/i.test(block.trim())) {
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      const options = [];
      let liMatch;
      while ((liMatch = liRe.exec(block))) {
        const inner = liMatch[1].trim();
        const plain = stripTags(inner);
        const label = plain.match(/^([A-H])[\.\．、]\s*/)?.[1];
        if (!label) {
          options.length = 0;
          break;
        }
        const content = inner.replace(new RegExp(`^${label}[\\.．、]\\s*`), '').trim();
        options.push({ label, content });
      }
      if (options.length >= 2) {
        out.push(renderOptions(options));
        continue;
      }
    }

    out.push(block);
  }
  return out;
}

function isAnswerStart(block) {
  const plain = stripTags(block);
  return /^(答案|参考答案|解析|参考解析|评分标准|判定|判断|说明)\s*[:：]/.test(plain) || /^<details\b/i.test(block.trim());
}

function splitAnswer(blocks) {
  const idx = blocks.findIndex(isAnswerStart);
  if (idx < 0) return { body: blocks, answer: [] };
  return { body: blocks.slice(0, idx), answer: blocks.slice(idx) };
}

function renderAnswer(blocks) {
  if (!blocks.length) return '';
  if (blocks.some((b) => /^<details\b/i.test(b.trim()))) return blocks.join('');
  const content = blocks.join('').trim();
  if (/^<blockquote\b/i.test(content)) return content;
  return `<blockquote>${content}</blockquote>`;
}

function normalizeHeading(headingHtml) {
  const text = stripTags(headingHtml);
  return text.replace(/\s+/g, ' ').trim();
}

function headingId(headingHtml) {
  return headingHtml.match(/^<h3 id="([^"]+)"/i)?.[1] || '';
}

function convertQuestionBlock(headingHtml, bodyHtml, hrHtml) {
  const heading = normalizeHeading(headingHtml);
  const id = headingId(headingHtml);
  const idAttr = id ? ` id="${id}"` : '';
  const trailingHr = bodyHtml.match(/\s*<hr\s*\/?>\s*$/i);
  const cleanBody = trailingHr ? bodyHtml.slice(0, trailingHr.index) : bodyHtml;
  const blocks = splitTopLevelBlocks(cleanBody);
  const { body, answer } = splitAnswer(blocks);
  const convertedBody = convertOptions(body).join('').trim();
  const renderedAnswer = renderAnswer(answer);
  return `<section class="question-card"${idAttr}><p><strong>${heading}</strong></p>${convertedBody}${renderedAnswer}</section>\n${hrHtml || (trailingHr ? '<hr />' : '')}`;
}

function originalContent(file) {
  return execFileSync('git', ['show', `HEAD:question-bank/${file}`], {
    cwd: __dirname,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
}

function processFile(file) {
  const code = file.slice(0, 2);
  if (!targetRange.has(code)) return null;
  const full = path.join(root, file);
  let html = originalContent(file);
  let changed = 0;
  const re = new RegExp(`<h3 id="[^"]*">${code}-[\\s\\S]*?<\\/h3>([\\s\\S]*?)(?=<h3 id="[^"]*">${code}-|<h2 id="[^"]*">|<\\/article>)`, 'g');
  html = html.replace(re, (match, body) => {
    const heading = match.slice(0, match.indexOf('</h3>') + 5);
    changed += 1;
    return `${convertQuestionBlock(heading, body, '')}\n`;
  });

  fs.writeFileSync(full, html, 'utf8');
  return { file, changed };
}

const results = fs.readdirSync(root)
  .filter((file) => /^\d{2}-题库-.*\.html$/.test(file))
  .sort()
  .map(processFile)
  .filter(Boolean);

for (const item of results) {
  console.log(`${item.file}: converted ${item.changed}`);
}
