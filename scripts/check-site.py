#!/usr/bin/env python3
"""Check Zola output without network access: links, anchors and CSP markup."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import sys

ROOT = Path(__file__).resolve().parent.parent / 'public'
ORIGIN = 'https://wasmkeep.dev'

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path, self.ids, self.links, self.refs, self.errors = path, [], [], [], []
        self.headings = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag.startswith('h') and tag[1:] in ('1', '2', '3', '4', '5', '6'):
            self.headings.append(int(tag[1]))
        if tag in ('a', 'link') and 'href' in a:
            self.links.append(a['href'])
        if tag in ('script', 'img') and 'src' in a:
            self.links.append(a['src'])
        for key in ('aria-labelledby', 'aria-describedby', 'aria-controls'):
            self.refs.extend(a.get(key, '').split())
        if 'for' in a:
            self.refs.extend(a['for'].split())
        if 'style' in a or any(k.startswith('on') for k in a):
            self.errors.append(f'inline style or event handler on {tag}')
        if tag == 'style' or (tag == 'script' and not a.get('src')):
            self.errors.append(f'inline {tag}')
        if tag == 'svg' and a.get('aria-hidden') != 'true' and not (a.get('aria-label') or a.get('aria-labelledby')):
            self.errors.append('SVG has no accessible name or decorative marker')
        if tag == 'a' and a.get('target') == '_blank' and 'noopener' not in a.get('rel', '').split():
            self.errors.append('new-window link missing noopener')

pages = {path.resolve(): Page(path) for path in ROOT.rglob('*.html')}
errors, checked = ([] if pages else ["No built HTML pages found; run zola build first."]), 0
for path, page in pages.items():
    rel = path.relative_to(ROOT)
    base = '/' + str(rel)
    if base.endswith('index.html'):
        base = base[:-len('index.html')]
    for ident, count in Counter(page.ids).items():
        if count > 1:
            page.errors.append(f'duplicate id {ident}')
    for ident in page.refs:
        if ident not in page.ids:
            page.errors.append(f'missing label/control target #{ident}')
    if page.headings.count(1) != 1:
        page.errors.append('expected exactly one h1')
    for previous, current in zip(page.headings, page.headings[1:]):
        if current > previous + 1:
            page.errors.append(f'heading skips h{previous} to h{current}')
    for link in page.links:
        url = urlsplit(urljoin(ORIGIN + base, link))
        if url.scheme not in ('http', 'https') or url.netloc != urlsplit(ORIGIN).netloc:
            continue
        checked += 1
        target = ROOT / unquote(url.path).lstrip('/')
        if target.is_dir():
            target /= 'index.html'
        target = target.resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            page.errors.append(f'missing local destination: {link}')
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            page.errors.append(f'missing anchor: {link}')
    errors.extend(f'{rel}: {error}' for error in page.errors)
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'Passed: {len(pages)} HTML pages, {checked} internal links/assets, anchors, heading order, SVG names and CSP markup.')
