"""Download public test inputs; do not commit song contents to the repository."""
import json
import pathlib
import re
import urllib.request
from urllib.parse import urljoin

root = pathlib.Path(__file__).resolve().parent

def get(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

banana_url = 'https://www.bananacifras.com/cifra/c/casa-worship/a-casa-e-sua'
page = get(banana_url)
(root / 'banana-song.html').write_bytes(page)
match = re.search(r'"init_tab",(\{[^}]*\})', page.decode())
if not match:
    raise RuntimeError('Banana page declaration changed; review the extractor.')
config = json.loads(match.group(1))
(root / 'banana-tab.json').write_bytes(get(urljoin(banana_url, config['json'])))
(root / 'cifras-page.html').write_bytes(get('https://www.cifras.com.br/cifra/casa-worship/a-casa-e-sua'))
print('Public fixtures downloaded; keep them out of version control.')
