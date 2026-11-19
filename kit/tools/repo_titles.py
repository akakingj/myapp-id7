#!/usr/bin/env python3
"""Lists each app whose Korean title differs from its English one in mgu-repo.json on its own, under
its Korean title.

The Store builds the apps in Korean, so an installed app's name (its entry point's en_GB text) is the
Korean title. When the source an app came from is gone, the Store hands its updates to the source whose
listing has that name (mgu-updater README, "Ids").

    python3 kit/tools/repo_titles.py           rewrite mgu-repo.json
    python3 kit/tools/repo_titles.py --check   exit 1 when it is out of date
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from localize import localize_spec  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
REPO = ROOT / 'mgu-repo.json'


def generate():
    doc = json.loads(REPO.read_text(encoding='utf-8'))
    pattern = {k: v for k, v in doc['apps'].items() if k != 'exclude'}
    folder = pattern['path'].rstrip('*')
    components = []
    for manifest in sorted(ROOT.glob(folder + '*/' + pattern['manifest'])):
        spec = json.loads(manifest.read_text(encoding='utf-8'))
        title = localize_spec(spec, 'ko')['title']
        if title != spec['title']:
            name = manifest.parent.name
            entry = {'id': name, 'kind': 'app', 'path': folder + name, 'title': title}
            entry.update({k: v for k, v in pattern.items() if k != 'path'})
            components.append(entry)
    apps = dict(pattern, exclude=[c['id'] for c in components]) if components else pattern
    out = {'schema': doc['schema']}
    if components:
        out['components'] = components
    out['apps'] = apps
    out.update({k: v for k, v in doc.items() if k not in ('schema', 'components', 'apps')})
    return json.dumps(out, indent=2, ensure_ascii=False) + '\n'


if __name__ == '__main__':
    text = generate()
    if '--check' in sys.argv[1:]:
        if REPO.read_text(encoding='utf-8') != text:
            print('mgu-repo.json is out of date: python3 kit/tools/repo_titles.py')
            sys.exit(1)
        print('PASS: mgu-repo.json lists the Korean titles')
    else:
        REPO.write_text(text, encoding='utf-8')
        print('mgu-repo.json written')
