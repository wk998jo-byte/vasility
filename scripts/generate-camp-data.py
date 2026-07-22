"""Parse maintenance Excel sheets → web/src/campUsersData.js + campRoomsData.js"""
import zipfile
import xml.etree.ElementTree as ET
import re
import os
import json
from collections import OrderedDict

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def col_row(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


def col_to_idx(col):
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n - 1


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
    sheets = sorted(
        n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")
    )
    out = []
    for sheet in sheets:
        root = ET.fromstring(z.read(sheet))
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
        out.append(table)
    return out


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def normalize_camp(raw, fallback=""):
    t = clean(raw).upper()
    if not t:
        t = clean(fallback).upper()
    if not t:
        return None
    if "ALL" in t or "GLOBAL" in t:
        return "All"
    if "MGS" in t:
        return "MGS Camp"
    if "DHAHRAN" in t or "DHAHRAN" in t:
        return "Dhahran Camp"
    if "JUBAIL" in t:
        return "Jubail Camp"
    if "KHURAIS" in t or "KHUIRAIS" in t:
        return "Khurais Camp"
    if "JUAYMAH" in t or "JUYAMAH" in t:
        return "Juaymah Camp"
    if "TCF3" in t or "TCF-3" in t or "CAMP 3" in t:
        return "TCF3 Camp"
    if "TCF-1" in t or "TCF1" in t or "MADINAH" in t or "MADINA CAMP 1" in t or "YANBU" in t:
        return "Madina Camp 1"
    if "TCF-2" in t or "TCF2" in t or "MADINA CAMP 2" in t:
        return "Madina Camp 2"
    # first line only if multi-line assignment
    first = clean(raw).split("/")[0].split(",")[0]
    return first.title() if first else None


# Official command-center staff (matches server/staff-seed-data.js).
OFFICIAL_STAFF = [
    {"username": "m.irfan", "name": "Mohammad Irfan", "phone": "+966530089716",
     "title": "Civil Engineer", "role": "admin", "camp": "All"},
    {"username": "abdulaziz.bq", "name": "Abdulaziz Bin Quraya", "phone": "+966535555844",
     "title": "Facility and Maintenance Operations Manager", "role": "admin", "camp": "All"},
    {"username": "ansar.basha", "name": "Ansar Basha", "phone": "+966570822231",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "MGS Camp"},
    {"username": "shakir.sabir", "name": "Shakir Hussain Sabir", "phone": "+966598512638",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Madina Camp 1"},
    {"username": "shaik.rahmatullah", "name": "Shaik Rahmatullah", "phone": "+966572399416",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Madina Camp 2"},
    {"username": "haja.fakruddin", "name": "Haja Fakruddin", "phone": "+966530739703",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Juaymah Camp"},
    {"username": "jack.dhahran", "name": "Jack", "phone": "+966552650673",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Dhahran Camp"},
    {"username": "muzammil.khurais", "name": "Muzammil", "phone": "+966562012614",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Khurais Camp"},
    {"username": "saroj.chettri", "name": "Saroj Chettri", "phone": "+966593327276",
     "title": "Camp Sub-Admin", "role": "subadmin", "camp": "Dhahran Camp"},
]


def norm_name(name):
    return re.sub(r"[^a-z]", "", (name or "").lower())


def names_match(a, b):
    na, nb = norm_name(a), norm_name(b)
    if na == nb:
        return True
    pa = re.findall(r"[a-z]+", (a or "").lower())
    pb = re.findall(r"[a-z]+", (b or "").lower())
    if pa and pb and pa[0] == pb[0] and len(pa[0]) >= 4:
        return True
    return False


def assign_rbac(title, camp, loc=""):
    """Strict RBAC: global managers → admin/All; camp staff → subadmin/exact camp."""
    title_u = (title or "").upper()
    loc_u = (loc or "").upper()
    camp = normalize_camp(camp) or camp or "MGS Camp"

    if camp == "All" or "ALL" in loc_u or "GLOBAL" in loc_u:
        return "admin", "All"
    if any(k in title_u for k in ("MANAGER", "DIRECTOR", "TOP ADMIN", "OPERATIONS MANAGER")):
        return "admin", "All"
    if "SUPERVISOR" in title_u:
        return "admin", "All"
    return "subadmin", camp


def make_username(full_name, used):
    parts = re.findall(r"[A-Za-z]+", full_name or "")
    base = (parts[0] if parts else "user").lower()
    candidate = base
    i = 2
    while candidate in used:
        # append next name part or number
        if i - 1 < len(parts):
            candidate = (base + parts[i - 1].lower())[:20]
        else:
            candidate = f"{base}{i}"
        i += 1
    used.add(candidate)
    return candidate


def parse_mgs_inventory(path, camp="MGS Camp"):
    sheets = read_xlsx(path)
    rooms = OrderedDict()
    block_floor = {0: "A Block", 1: "B Block", 2: "C Block"}
    for ti, table in enumerate(sheets[:3]):
        hdr_i = None
        for i, row in enumerate(table[:8]):
            if any("DESCRIPTION" in (c or "").upper() for c in row):
                hdr_i = i
                break
        if hdr_i is None:
            continue
        header = table[hdr_i]
        start = 3
        for i, h in enumerate(header):
            if (h or "").upper() == "UNIT":
                start = i + 1
                break
        room_names = [h for h in header[start:] if h and h.upper() not in ("REMARKS", "NO", "NOTE")]
        for col_off, room in enumerate(room_names):
            assets = []
            for row in table[hdr_i + 1 :]:
                if len(row) < 2:
                    continue
                desc = clean(row[1])
                if not desc or desc.upper().startswith("PREPAIR") or desc.upper().startswith("PREPARE") or desc.upper().startswith("NOTE"):
                    continue
                qty = row[start + col_off] if start + col_off < len(row) else ""
                if qty and str(qty) not in ("0", "0.0"):
                    assets.append(desc.upper())
            # dedupe preserve order
            seen = set()
            uniq = []
            for a in assets:
                if a not in seen:
                    seen.add(a)
                    uniq.append(a)
            key = f"{camp} - {room}"
            if uniq:
                rooms[key] = uniq
    return rooms


def find_col(header, *names):
    upper = [(h or "").upper() for h in header]
    for name in names:
        for i, h in enumerate(upper):
            if name in h:
                return i
    return None


def parse_staff_file(path, default_camp=None):
    sheets = read_xlsx(path)
    if not sheets:
        return []
    table = sheets[0]
    # find header
    hdr_i = None
    for i, row in enumerate(table[:6]):
        joined = " ".join((c or "").upper() for c in row)
        if "NAME" in joined and ("DESIGNATION" in joined or "POSITION" in joined or "LOCATION" in joined or "CAMP" in joined):
            hdr_i = i
            break
    if hdr_i is None:
        return []
    header = table[hdr_i]
    name_i = find_col(header, "EMP. NAME", "NAME")
    title_i = find_col(header, "DESIGNATION", "POSITION")
    loc_i = find_col(header, "CAMP/ LOCATION", "CAMP/LOCATION", "LOCATION", "CAMP/LOCATION ASSIGNED", "CAMP")
    phone_i = find_col(header, "PHONE", "MOBILE", "CONTACT")
    badge_i = find_col(header, "BADGE", "BADG", "BQ#", "BQ")
    users = []
    # title row may imply camp
    file_camp = default_camp
    for row in table[:2]:
        joined = " ".join(row)
        c = normalize_camp(joined)
        if c and c != "All":
            file_camp = c
    last_camp = file_camp
    for row in table[hdr_i + 1 :]:
        if not any(row):
            continue
        name = clean(row[name_i]) if name_i is not None and name_i < len(row) else ""
        if not name or name.upper().startswith("PREPARE") or name.upper() in ("NAME",):
            continue
        # skip non-person rows
        if re.match(r"^\d+$", name):
            continue
        title = clean(row[title_i]) if title_i is not None and title_i < len(row) else ""
        loc = clean(row[loc_i]) if loc_i is not None and loc_i < len(row) else ""
        phone = clean(row[phone_i]) if phone_i is not None and phone_i < len(row) else ""
        badge = clean(row[badge_i]) if badge_i is not None and badge_i < len(row) else ""
        if loc:
            last_camp = normalize_camp(loc, file_camp) or last_camp
        camp = normalize_camp(loc, last_camp or file_camp) or last_camp or "MGS Camp"
        role, camp = assign_rbac(title, camp, loc)
        if not phone and badge:
            phone = ""
        users.append(
            {
                "name": name.title() if name.upper() == name else name,
                "phone": phone if phone.startswith("+") or not phone else f"+966{phone}" if phone.isdigit() and len(phone) >= 9 else phone,
                "title": title.title() if title else "Technician",
                "camp": camp,
                "role": role,
                "badge": badge,
            }
        )
    return users


def js_string(s):
    return json.dumps(s, ensure_ascii=False)


def merge_official_staff(excel_users):
    """Excel technicians + official admins/sub-admins; official entries win on name match."""
    merged = []
    for u in excel_users:
        if any(names_match(u["name"], o["name"]) for o in OFFICIAL_STAFF):
            continue
        merged.append(u)
    for o in OFFICIAL_STAFF:
        merged.append({
            "name": o["name"],
            "phone": o["phone"],
            "title": o["title"],
            "camp": o["camp"],
            "role": o["role"],
            "username": o["username"],
        })
    return merged


def write_users_js(users, path):
    used = set()
    lines = [
        "/** Auto-generated from MAINTAINENCE APP Excel + official staff. Do not edit by hand. */",
        "export const USERS = {",
    ]
    for u in users:
        uname = u.get("username") or make_username(u["name"], used)
        if uname not in used:
            used.add(uname)
        lines.append(f"  {js_string(uname)}: {{")
        lines.append(f"    username: {js_string(uname)},")
        lines.append(f"    name: {js_string(u['name'])},")
        lines.append(f"    phone: {js_string(u['phone'])},")
        lines.append(f"    role: {js_string(u['role'])},")
        lines.append(f"    title: {js_string(u['title'])},")
        lines.append(f"    camp: {js_string(u['camp'])},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("export default USERS;")
    lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_rooms_js(rooms, path):
    lines = [
        "/** Auto-generated from MGS BQ CAMP inventory Excel. Do not edit by hand. */",
        "export const INITIAL_ROOM_DATA = {",
    ]
    for key, assets in rooms.items():
        arr = ", ".join(js_string(a) for a in assets)
        lines.append(f"  {js_string(key)}: [{arr}],")
    lines.append("};")
    lines.append("")
    lines.append("export default INITIAL_ROOM_DATA;")
    lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    inv_path = os.path.join(ROOT, "MAINTAINENCE APP", "INVENTORY LIST", "MGS BQ CAMP.xlsx")
    if not os.path.exists(inv_path):
        inv_path = os.path.join(ROOT, "MGS BQ CAMP.xlsx")
    rooms = parse_mgs_inventory(inv_path, "MGS Camp")

    staff_dir = os.path.join(ROOT, "MAINTAINENCE APP", "MAINTAINENCE TEAM")
    all_users = []
    for fname in sorted(os.listdir(staff_dir)):
        if not fname.lower().endswith(".xlsx"):
            continue
        path = os.path.join(staff_dir, fname)
        all_users.extend(parse_staff_file(path))

    # de-dupe by name+camp
    seen = set()
    unique = []
    for u in all_users:
        k = (u["name"].lower(), u["camp"])
        if k in seen:
            continue
        seen.add(k)
        unique.append(u)

    merged = merge_official_staff(unique)

    out_dir = os.path.join(ROOT, "web", "src")
    users_path = os.path.join(out_dir, "campUsersData.js")
    rooms_path = os.path.join(out_dir, "campRoomsData.js")
    write_users_js(merged, users_path)
    write_rooms_js(rooms, rooms_path)
    print(f"Wrote {len(merged)} users to {users_path}")
    print(f"Wrote {len(rooms)} rooms to {rooms_path}")
    camps = sorted({u['camp'] for u in unique})
    print("Camps:", camps)
    print("Room key prefix sample:", list(rooms.keys())[:3])


if __name__ == "__main__":
    main()
