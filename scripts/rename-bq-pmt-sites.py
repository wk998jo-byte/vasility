"""Rename camp prefixes in room data files for BQ/PMT site split."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = [
    # Order matters: longer / more specific first
    ('"Madina Camp 1 - ', '"Madina Camp 1 PMT - '),
    ('"Madina Camp 2 - ', '"Madina Camp 2 BQ - '),
    ('"MGS Camp - ', '"MGS BQ - '),
]

FILES = [
    ROOT / 'web' / 'src' / 'data' / 'roomsData.js',
    ROOT / 'web' / 'src' / 'campRoomsData.js',
]

for path in FILES:
    text = path.read_text(encoding='utf-8')
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding='utf-8')
        print(f'updated {path.relative_to(ROOT)}')
    else:
        print(f'no change {path.relative_to(ROOT)}')

# camp users
users = ROOT / 'web' / 'src' / 'campUsersData.js'
ut = users.read_text(encoding='utf-8')
ut2 = (
    ut.replace('camp: "MGS Camp"', 'camp: "MGS BQ"')
      .replace('camp: "Madina Camp 1"', 'camp: "Madina Camp 1 PMT"')
      .replace('camp: "Madina Camp 2"', 'camp: "Madina Camp 2 BQ"')
)
if ut2 != ut:
    users.write_text(ut2, encoding='utf-8')
    print('updated campUsersData.js')
else:
    print('no change campUsersData.js')
