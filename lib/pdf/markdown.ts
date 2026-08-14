/**
 * Minimal Markdown parser for contract bodies (MVP4 §6.4).
 *
 * Contracts store `body_markdown`; the PDF template needs a structured form to
 * lay out. A full Markdown library is deliberately avoided: the output feeds a
 * document whose SHA-256 is legal evidence, so the transformation must be small,
 * auditable, and free of upstream behaviour changes between versions.
 *
 * Supported: ATX headings (#..###), unordered lists (-, *), ordered lists,
 * blockquotes, horizontal rules, paragraphs, and inline bold/italic stripping.
 */

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'listItem'; text: string; ordered: boolean; index: number }
  | { type: 'quote'; text: string }
  | { type: 'rule' };

/**
 * Removes inline emphasis markers, keeping the text.
 *
 * React-PDF has no rich-text runs inside a single `<Text>`, so emphasis is
 * dropped rather than half-rendered with stray asterisks.
 */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .trim();
}

/**
 * Parses a Markdown string into a flat list of renderable blocks.
 *
 * @param markdown - Raw `contracts.body_markdown`.
 * @returns Blocks in document order; consecutive plain lines join into one
 *   paragraph, and a blank line closes it.
 */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];
  let orderedIndex = 0;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', text: stripInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      orderedIndex = 0;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      orderedIndex = 0;
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      orderedIndex = 0;
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: stripInline(heading[2]),
      });
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      orderedIndex = 0;
      blocks.push({ type: 'listItem', text: stripInline(bullet[1]), ordered: false, index: 0 });
      continue;
    }

    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      orderedIndex += 1;
      blocks.push({
        type: 'listItem',
        text: stripInline(ordered[2]),
        ordered: true,
        index: orderedIndex,
      });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      orderedIndex = 0;
      blocks.push({ type: 'quote', text: stripInline(quote[1]) });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}
