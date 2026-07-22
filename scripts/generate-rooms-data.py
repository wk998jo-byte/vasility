"""
Parse MAINTAINENCE APP inventory Excel files → web/src/data/roomsData.js

Camp key prefixes align with SubAdmin RBAC labels (staff-seed-data.js):
  MGS Camp, Madina Camp 1, Madina Camp 2, Khurais Camp, Juaymah Camp, Dhahran Camp

Regenerate:
  python scripts/generate-rooms-data.py
"""
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_ROOMS = {
    "TOTAL", "ITEMS NO", "ITEMS NAME", "A/B TYPES ROOMS & AREA",
    "S.NO", "S#", "DESCRIPTION OF ITEMS", "UNIT", "REMARKS",
}

# Filename → RBAC camp prefix (must match SubAdmin camp labels)
FILE_CAMP = {
    "MGS BQ CAMP.xlsx": "MGS Camp",
    "KHURAIS CAMP.xlsx": "Khurais Camp",
    "BQ CAMP TCF-2 inventory.xlsx": "Madina Camp 2",
    "MADINA CAMP 2 -PMT.xlsx": "Madina Camp 2",
    "MADINA CAMP 2_SAPMT_TCF2.xlsx": "Madina Camp 2",
    "CAMP 2 ROOMS EQUIPMENTS (1).xlsx": "Madina Camp 2",
    "MADINA CAMP 2_SAPMT-TCF01.xlsx": "Madina Camp 1",
}


def col_row(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def col_to_idx(col):
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            texts = [
                t.text or ""
                for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
            ]
            ss.append("".join(texts))

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rel_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to = {r.get("Id"): r.get("Target") for r in rels}

    sheets = []
    for sh in wb.findall(".//m:sheet", NS):
        name = sh.get("name")
        target = rid_to.get(sh.get(f"{{{rel_ns}}}id"))
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"
        root = ET.fromstring(z.read(sheet_path))
        rows = {}
        for c in root.findall(".//m:c", NS):
            ref = c.get("r")
            if not ref:
                continue
            col, row = col_row(ref)
            v = c.find("m:v", NS)
            if v is None or v.text is None:
                val = ""
            elif c.get("t") == "s":
                val = ss[int(v.text)] if int(v.text) < len(ss) else v.text
            else:
                val = v.text
            rows.setdefault(row, {})[col_to_idx(col)] = str(val).replace("\xa0", " ").strip()

        table = []
        for r in sorted(rows):
            maxc = max(rows[r]) if rows[r] else 0
            table.append([rows[r].get(i, "") for i in range(maxc + 1)])
        sheets.append((name, table))
    return sheets


def is_valid_desc(desc):
    u = desc.upper()
    if not desc:
        return False
    if u.startswith(("PREPARE", "PREPAIR", "NOTE")):
        return False
    if u in SKIP_ROOMS:
        return False
    return True


def is_qty(val):
    v = clean(val)
    if not v or v in ("0", "0.0"):
        return False
    if v.upper() in ("ALL", "EA", "YES", "Y"):
        return True
    try:
        return float(v) > 0
    except ValueError:
        return bool(v)


def dedupe_assets(assets):
    seen = set()
    out = []
    for a in assets:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def room_key(camp, room):
    return f"{camp} - {room}"


def infer_facility_room(table, sheet_name):
    for row in table[:4]:
        for cell in row:
            c = clean(cell)
            if not c:
                continue
            u = c.upper()
            if any(u.startswith(x) for x in ("SSC", "MGS", "BQ CAMP", "SAPMT", "TCF")):
                continue
            if "EXISTING CAMP" in u:
                name = re.sub(r"\s*existing camp\s*", "", c, flags=re.I).strip()
                return name or clean(sheet_name)
            if len(c) > 2 and not u.startswith("S.NO"):
                return c
    return clean(sheet_name)


def sheet_is_transposed(table):
    for row in table[:8]:
        joined = " ".join((c or "").upper() for c in row)
        if "ITEMS NAME" in joined:
            for r2 in table[:8]:
                j2 = " ".join((c or "").upper() for c in r2)
                if "ROOMS & AREA" in j2 or "A/B TYPES" in j2:
                    return True
    return False


def parse_transposed(table, camp):
    items_row = None
    rooms_start = None
    for i, row in enumerate(table[:10]):
        joined = " ".join((c or "").upper() for c in row)
        if "ITEMS NAME" in joined:
            items_row = i
        if "ROOMS & AREA" in joined or "A/B TYPES" in joined:
            rooms_start = i + 1

    if items_row is None:
        return {}

    header = table[items_row]
    # items may start col 0 label or col 1
    start_col = 1 if (header[0] or "").upper().startswith("ITEMS") else 0
    if start_col == 0:
        start_col = 1
    items = [clean(c) for c in header[start_col:] if clean(c)]

    if rooms_start is None:
        rooms_start = items_row + 2

    rooms = {}
    for row in table[rooms_start:]:
        if not row:
            continue
        name = clean(row[0])
        if not name or name.upper() in SKIP_ROOMS or name.upper() == "TOTAL":
            continue
        assets = []
        for j, item in enumerate(items):
            col = start_col + j
            if col >= len(row):
                break
            if is_qty(row[col]):
                assets.append(item.upper())
        if assets:
            key = room_key(camp, name)
            rooms[key] = dedupe_assets(assets)
    return rooms


def parse_matrix(table, camp, sheet_name):
    hdr_i = None
    for i, row in enumerate(table[:12]):
        if any("DESCRIPTION" in (c or "").upper() for c in row):
            hdr_i = i
            break
    if hdr_i is None:
        return {}

    header = table[hdr_i]
    header_upper = [(h or "").upper() for h in header]

    unit_idx = None
    for i, h in enumerate(header_upper):
        if h in ("UNIT", "UOM"):
            unit_idx = i
            break
    start = (unit_idx + 1) if unit_idx is not None else 3

    # Single shared facility (Mess Hall, Gym, Laundry, Masjid, etc.)
    no_idx = next((i for i, h in enumerate(header_upper) if h == "NO"), None)
    room_cols = []
    for i in range(start, len(header)):
        h = clean(header[i])
        if not h:
            continue
        hu = h.upper()
        if hu in ("REMARKS", "NOTE"):
            break
        if hu == "NO" and no_idx is not None and len(room_cols) == 0 and i == no_idx:
            continue
        room_cols.append((i, h))

    # Only NO column → one facility room for the whole sheet
    if no_idx is not None and (len(room_cols) == 0 or (len(room_cols) == 1 and room_cols[0][1].upper() == "NO")):
        facility = infer_facility_room(table, sheet_name)
        assets = []
        desc_idx = 1
        for i, h in enumerate(header_upper):
            if "DESCRIPTION" in h:
                desc_idx = i
                break
        for row in table[hdr_i + 1:]:
            if len(row) <= desc_idx:
                continue
            desc = clean(row[desc_idx])
            if not is_valid_desc(desc):
                continue
            qty = row[no_idx] if no_idx < len(row) else ""
            if is_qty(qty):
                assets.append(desc.upper())
        if assets:
            return {room_key(camp, facility): dedupe_assets(assets)}
        return {}

    if not room_cols:
        return {}

    rooms = {}
    desc_idx = 1
    for i, h in enumerate(header_upper):
        if "DESCRIPTION" in h:
            desc_idx = i
            break

    for col_i, room_name in room_cols:
        if room_name.upper() in SKIP_ROOMS:
            continue
        assets = []
        for row in table[hdr_i + 1:]:
            if len(row) <= desc_idx:
                continue
            desc = clean(row[desc_idx])
            if not is_valid_desc(desc):
                continue
            qty = row[col_i] if col_i < len(row) else ""
            if is_qty(qty):
                assets.append(desc.upper())
        if assets:
            key = room_key(camp, room_name)
            rooms[key] = dedupe_assets(assets)
    return rooms


def parse_file(path, camp):
    rooms = OrderedDict()
    for sheet_name, table in read_xlsx(path):
        if not table:
            continue
        parsed = (
            parse_transposed(table, camp)
            if sheet_is_transposed(table)
            else parse_matrix(table, camp, sheet_name)
        )
        for key, assets in parsed.items():
            if key in rooms:
                rooms[key] = dedupe_assets(rooms[key] + assets)
            else:
                rooms[key] = assets
    return rooms


def merge_rooms(target, source):
    for key, assets in source.items():
        if key in target:
            target[key] = dedupe_assets(target[key] + assets)
        else:
            target[key] = assets


def discover_inventory_files():
    paths = []
    seen_basenames = set()
    inv_dir = os.path.join(ROOT, "MAINTAINENCE APP", "INVENTORY LIST")
    if os.path.isdir(inv_dir):
        for fname in sorted(os.listdir(inv_dir)):
            if fname.lower().endswith(".xlsx"):
                seen_basenames.add(fname.lower())
                paths.append(os.path.join(inv_dir, fname))
    root_mgs = os.path.join(ROOT, "MGS BQ CAMP.xlsx")
    if os.path.exists(root_mgs) and os.path.basename(root_mgs).lower() not in seen_basenames:
        paths.append(root_mgs)
    return paths


def camp_for_file(fname):
    base = os.path.basename(fname)
    if base in FILE_CAMP:
        return FILE_CAMP[base]
    u = base.upper()
    if "MGS" in u:
        return "MGS Camp"
    if "KHURAIS" in u:
        return "Khurais Camp"
    if "TCF-2" in u or "TCF2" in u or "CAMP 2" in u:
        return "Madina Camp 2"
    if "TCF-01" in u or "TCF01" in u or "TCF-1" in u:
        return "Madina Camp 1"
    if "DHAHRAN" in u:
        return "Dhahran Camp"
    if "JUAYMAH" in u or "JUYAMAH" in u:
        return "Juaymah Camp"
    if "JUBAIL" in u:
        return "Jubail Camp"
    return None


def js_string(s):
    return json.dumps(s, ensure_ascii=False)


def write_rooms_js(rooms, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = [
        "/**",
        " * Auto-generated from MAINTAINENCE APP/INVENTORY LIST/*.xlsx",
        " * Regenerate: python scripts/generate-rooms-data.py",
        " *",
        " * Keys: \"{Camp Name} - {Room Name}\" — camp prefix matches SubAdmin RBAC labels.",
        " */",
        "export const ROOM_DATA = {",
    ]
    for key, assets in rooms.items():
        arr = ", ".join(js_string(a) for a in assets)
        lines.append(f"  {js_string(key)}: [{arr}],")
    lines.append("};")
    lines.append("")
    lines.append("export default ROOM_DATA;")
    lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    all_rooms = OrderedDict()
    stats = []

    for path in discover_inventory_files():
        fname = os.path.basename(path)
        camp = camp_for_file(path)
        if not camp:
            print(f"Skip (unknown camp): {fname}")
            continue
        parsed = parse_file(path, camp)
        merge_rooms(all_rooms, parsed)
        stats.append((fname, camp, len(parsed)))
        print(f"  {fname}: {len(parsed)} rooms -> {camp}")

    out_path = os.path.join(ROOT, "web", "src", "data", "roomsData.js")
    write_rooms_js(all_rooms, out_path)

    camps = sorted({k.split(" - ", 1)[0] for k in all_rooms})
    print(f"\nWrote {len(all_rooms)} rooms -> {out_path}")
    print(f"Camps: {camps}")
    print("Sample keys:", list(all_rooms.keys())[:4])


if __name__ == "__main__":
    main()
