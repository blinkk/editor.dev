const OPENING_SENTINEL = '---\n';
const CLOSING_SENTINEL = '\n---';

export interface FrontMatterCombineOptions {
  trailingNewline?: boolean;
}

export interface DocumentFormat {
  frontMatter?: string;
  body?: string;
}

export class FrontMatter {
  static combine(
    doc: DocumentFormat,
    options?: FrontMatterCombineOptions
  ): string {
    if (!doc.frontMatter && !doc.body) {
      console.error('no frontmatter or body');
      return '';
    }

    // Body only.
    if (!doc.frontMatter) {
      return doc.body as string;
    }

    const formatted = `${OPENING_SENTINEL}${
      doc.frontMatter || ''
    }${CLOSING_SENTINEL}\n${doc.body || ''}`.trim();

    return options?.trailingNewline ? `${formatted}\n` : formatted;
  }

  static split(content: string | null): DocumentFormat {
    if (!content) {
      return {};
    }

    content = content.trim();

    // No opening part present, assume the whole file is not front matter.
    if (!content.startsWith(OPENING_SENTINEL)) {
      return {
        body: content,
      };
    }

    // Strip the opening part.
    content = content.slice(OPENING_SENTINEL.length);
    const closingIndex = content.indexOf(CLOSING_SENTINEL);

    // No closing part present, assume the whole file is front matter.
    if (closingIndex === -1) {
      return {
        frontMatter: content,
      };
    }

    return {
      frontMatter: content.slice(0, closingIndex).trim(),
      body: content.slice(closingIndex + CLOSING_SENTINEL.length).trim(),
    };
  }
}
