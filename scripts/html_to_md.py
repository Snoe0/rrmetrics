"""Convert HTML guide pages to clean Markdown for AI web scrapers."""

import os
import re

GUIDES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'guides')


def html_to_md(html):
    """Convert a guide HTML file to clean markdown."""

    # Extract metadata
    title_m = re.search(r'<title>(.*?)</title>', html)
    desc_m = re.search(r'<meta\s+name="description"\s+content="(.*?)"', html)
    url_m = re.search(r'<meta\s+property="og:url"\s+content="(.*?)"', html)
    h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)

    title = h1_m.group(1).strip() if h1_m else (title_m.group(1).strip() if title_m else 'Untitled')
    title = re.sub(r'<[^>]+>', '', title)  # strip inline tags
    title = unescape(title)
    desc = unescape(desc_m.group(1)) if desc_m else ''
    url = url_m.group(1) if url_m else ''

    # Extract <main> content
    main_m = re.search(r'<main[^>]*>(.*?)</main>', html, re.DOTALL)
    if not main_m:
        return build_frontmatter(title, desc, url) + f'# {title}\n'

    content = main_m.group(1)

    # Remove TOC nav
    content = re.sub(r'<nav\s+class="bg-bg-surface[^"]*"[^>]*>.*?</nav>', '', content, flags=re.DOTALL)

    # Remove SVG icons
    content = re.sub(r'<svg[^>]*>.*?</svg>', '', content, flags=re.DOTALL)

    # Convert card link grids to simple link lists
    def card_link(m):
        href = m.group(1)
        inner = m.group(2)
        # Extract the visible text spans
        texts = re.findall(r'<span[^>]*>(.*?)</span>', inner, re.DOTALL)
        texts = [strip_tags(t).strip() for t in texts if strip_tags(t).strip()]
        # Also check for <p> text
        ptexts = re.findall(r'<p[^>]*>(.*?)</p>', inner, re.DOTALL)
        ptexts = [strip_tags(t).strip() for t in ptexts if strip_tags(t).strip()]
        label = ' — '.join(texts + ptexts) if texts or ptexts else href
        return f'- [{label}]({href})'
    content = re.sub(r'<a\s+href="([^"]*)"[^>]*class="[^"]*group[^"]*"[^>]*>(.*?)</a>', card_link, content, flags=re.DOTALL)

    # Remove CTA block
    content = re.sub(r'<div\s+class="[^"]*border-accent/30[^"]*text-center[^"]*"[^>]*>.*?</div>\s*</div>', '', content, flags=re.DOTALL)
    content = re.sub(r'<div\s+class="[^"]*border-accent/30[^"]*text-center[^"]*"[^>]*>.*?</div>', '', content, flags=re.DOTALL)

    # Remove related guides section
    content = re.sub(r'<div\s+class="border-t border-border mt-14[^"]*"[^>]*>.*', '', content, flags=re.DOTALL)

    # Convert callout divs to blockquotes
    def callout_to_quote(m):
        text = strip_tags(m.group(1))
        return f'\n> {text.strip()}\n'
    content = re.sub(r'<div\s+class="[^"]*bg-accent/5[^"]*border-accent/20[^"]*rounded-lg[^"]*"[^>]*>(.*?)</div>', callout_to_quote, content, flags=re.DOTALL)

    # Convert step divs FIRST (before headings/lists, since steps contain h3 + ul)
    def convert_step(m):
        num = strip_tags(m.group(1)).strip()
        body = m.group(2)
        step_title = re.search(r'<h3[^>]*>(.*?)</h3>', body, re.DOTALL)
        parts = []
        if step_title:
            parts.append(f'\n### Step {num}: {strip_tags(step_title.group(1)).strip()}\n')

        # Process body sequentially - find all p and ul elements in order
        elements = list(re.finditer(r'<(p|ul|ol)[^>]*>(.*?)</\1>', body, re.DOTALL))
        for elem in elements:
            tag = elem.group(1)
            inner = elem.group(2)
            if tag == 'p':
                parts.append(f'\n{inline_format(inner.strip())}\n')
            elif tag in ('ul', 'ol'):
                items = re.findall(r'<li>(.*?)</li>', inner, re.DOTALL)
                prefix = '-' if tag == 'ul' else '1.'
                for item in items:
                    parts.append(f'{prefix} {inline_format(item.strip())}')
                parts.append('')

        return '\n'.join(parts)

    content = re.sub(
        r'<div\s+class="flex gap-4[^"]*"[^>]*>\s*<div\s+class="[^"]*rounded-full[^"]*"[^>]*>(.*?)</div>\s*<div\s+class="flex-1">(.*?)</div>\s*</div>',
        convert_step, content, flags=re.DOTALL
    )

    # Convert headings
    content = re.sub(r'<h2[^>]*>(.*?)</h2>', lambda m: f'\n## {strip_tags(unescape(m.group(1)))}\n', content, flags=re.DOTALL)
    content = re.sub(r'<h3[^>]*>(.*?)</h3>', lambda m: f'\n### {strip_tags(unescape(m.group(1)))}\n', content, flags=re.DOTALL)
    content = re.sub(r'<h4[^>]*>(.*?)</h4>', lambda m: f'\n#### {strip_tags(unescape(m.group(1)))}\n', content, flags=re.DOTALL)

    # Convert pre/code blocks
    content = re.sub(r'<pre[^>]*>(.*?)</pre>', lambda m: f'\n```\n{strip_tags(unescape(m.group(1))).strip()}\n```\n', content, flags=re.DOTALL)

    # Convert lists
    def convert_ul(m):
        items = re.findall(r'<li>(.*?)</li>', m.group(1), re.DOTALL)
        lines = [f'- {inline_format(item.strip())}' for item in items]
        return '\n' + '\n'.join(lines) + '\n'

    def convert_ol(m):
        items = re.findall(r'<li>(.*?)</li>', m.group(1), re.DOTALL)
        lines = [f'{i+1}. {inline_format(item.strip())}' for i, item in enumerate(items)]
        return '\n' + '\n'.join(lines) + '\n'

    content = re.sub(r'<ul[^>]*>(.*?)</ul>', convert_ul, content, flags=re.DOTALL)
    content = re.sub(r'<ol[^>]*>(.*?)</ol>', convert_ol, content, flags=re.DOTALL)

    # Convert remaining paragraphs
    content = re.sub(r'<p[^>]*>(.*?)</p>', lambda m: f'\n{inline_format(m.group(1).strip())}\n', content, flags=re.DOTALL)

    # Convert tables
    def convert_table(m):
        table_html = m.group(0)
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)
        if not rows:
            return ''

        md_rows = []
        for i, row in enumerate(rows):
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL)
            cells = [inline_format(strip_tags(c).strip()) for c in cells]
            md_rows.append('| ' + ' | '.join(cells) + ' |')
            if i == 0:
                md_rows.append('| ' + ' | '.join(['---'] * len(cells)) + ' |')

        return '\n' + '\n'.join(md_rows) + '\n'

    content = re.sub(r'<table[^>]*>.*?</table>', convert_table, content, flags=re.DOTALL)

    # Strip remaining HTML tags
    content = re.sub(r'<[^>]+>', '', content)

    # Unescape HTML entities
    content = unescape(content)

    # Clean up whitespace - strip lines that are only spaces/tabs
    content = '\n'.join(line.rstrip() for line in content.split('\n'))
    content = re.sub(r'\n[ \t]+\n', '\n\n', content)
    content = re.sub(r'\n{3,}', '\n\n', content)
    content = content.strip()

    return build_frontmatter(title, desc, url) + f'# {title}\n\n{content}\n'


def build_frontmatter(title, desc, url):
    lines = ['---']
    lines.append(f'title: "{title}"')
    if desc:
        lines.append(f'description: "{desc}"')
    if url:
        lines.append(f'url: "{url}"')
    lines.append('---\n\n')
    return '\n'.join(lines)


def strip_tags(text):
    return re.sub(r'<[^>]+>', '', text)


def inline_format(text):
    """Convert inline HTML (strong, a, em, code) to markdown."""
    # Bold
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text)
    text = re.sub(r'<b>(.*?)</b>', r'**\1**', text)
    # Italic
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text)
    # Inline code
    text = re.sub(r'<code>(.*?)</code>', r'`\1`', text)
    # Links
    text = re.sub(r'<a\s+href="([^"]*)"[^>]*>(.*?)</a>', r'[\2](\1)', text)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    text = unescape(text)
    return text


def unescape(text):
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    text = text.replace('&middot;', '\u00b7')
    text = text.replace('&copy;', '\u00a9')
    text = text.replace('&mdash;', '\u2014')
    text = text.replace('&ndash;', '\u2013')
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&rarr;', '\u2192')
    text = text.replace('&larr;', '\u2190')
    text = text.replace('&times;', '\u00d7')
    text = text.replace('&hellip;', '\u2026')
    return text


def convert_file(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    md = html_to_md(html)

    md_path = html_path.replace('.html', '.md')
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md)

    return os.path.basename(md_path)


def main():
    html_files = sorted([
        f for f in os.listdir(GUIDES_DIR)
        if f.endswith('.html')
    ])

    print(f'Converting {len(html_files)} guides to Markdown...')
    for fname in html_files:
        md_name = convert_file(os.path.join(GUIDES_DIR, fname))
        print(f'  {fname} -> {md_name}')

    print(f'\nDone! {len(html_files)} .md files created in public/guides/')


if __name__ == '__main__':
    main()
