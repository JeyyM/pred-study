"""
Scan ljnlonoljpiljm/idoc-mugshots labels, keep child-predation charges as targets,
download a sample of front mugshots. Does not pull the full 14GB parquet dump.

  python scripts/import-hf-idoc.py
  python scripts/import-hf-idoc.py --targets 80 --foils 160 --seed 1
"""

from __future__ import annotations

import argparse
import json
import random
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "scripts" / "lib"
CACHE = ROOT / "data" / "hf-idoc"
IMAGE_DIR = ROOT / "public" / "images"
INDEX_PATH = CACHE / "male-front-index.json"
PICKED_PATH = CACHE / "picked.json"
ROWS_URL = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=ljnlonoljpiljm/idoc-mugshots&config=default&split=train"
    "&offset={offset}&length={length}"
)
PAGE = 100
TOTAL_HINT = 139654
UA = "pred-test-study/1.0 (research; child-predation charge filter; no bulk parquet download)"

ssl_ctx = ssl.create_default_context()


def load_codebook():
    names = json.loads((LIB / "idoc-hf-offenses.json").read_text(encoding="utf-8"))["names"]
    include = {
        str(x).strip().upper()
        for x in json.loads((LIB / "idoc-child-charges.json").read_text(encoding="utf-8"))["include"]
    }
    return names, include


def fetch_json(url, retries=8):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=45) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            last = err
            wait = 60 if err.code == 429 else min(30, 1.6 ** attempt)
            print(f"HTTP {err.code}; waiting {int(wait)}s", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last = err
            time.sleep(min(30, 1.5 ** attempt))
    raise RuntimeError(f"Failed {url}: {last}")


def decode_charges(ids, names):
    out = []
    for raw in ids or []:
        try:
            idx = int(raw)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(names):
            out.append(names[idx])
    return out


def is_child_target(charges, include):
    return any(c.strip().upper() in include for c in charges)


def parse_page(payload, names, include, fallback_offset):
    people = {}
    rows = payload.get("rows") or []
    for i, item in enumerate(rows):
        row_idx = item.get("row_idx")
        if row_idx is None:
            row_idx = fallback_offset + i
        row_idx = int(row_idx)
        row = item.get("row") or {}
        if int(row.get("position") or 0) != 0:
            continue
        if int(row.get("gender") or 0) != 0:
            continue
        person_id = str(row.get("person_id") or "").strip()
        if not person_id:
            continue
        charges = decode_charges(row.get("offenses"), names)
        people[person_id] = {
            "id": person_id,
            "offset": row_idx,
            "ethnicity": int(row.get("ethnicity") or 0),
            "sex_offender": bool(row.get("sex_offender")),
            "charges": charges,
            "childTarget": is_child_target(charges, include),
        }
    return people, len(rows)


def scan_index(names, include, start_offset=0, people=None):
    people = people or {}
    offset = start_offset
    total = TOTAL_HINT
    while offset < total:
        payload = fetch_json(ROWS_URL.format(offset=offset, length=PAGE))
        total = int(payload.get("num_rows_total") or total)
        chunk, n = parse_page(payload, names, include, offset)
        if n == 0:
            break
        people.update(chunk)
        offset += n
        if offset % 2000 == 0 or offset >= total:
            print(f"Scanned {offset}/{total} rows; unique male fronts {len(people)}", flush=True)
            CACHE.mkdir(parents=True, exist_ok=True)
            INDEX_PATH.write_text(
                json.dumps({"partial": offset < total, "offset": offset, "rowCount": total, "people": list(people.values())}),
                encoding="utf-8",
            )
        time.sleep(0.25)
    return people, total


ETHNICITY = ["White", "Black", "Hispanic", "Asian", "Amer Indian", "Bi-Racial", "Not Available"]


def download_image(url, dest: Path, retries=5):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=90) as resp:
                data = resp.read()
            if len(data) < 800:
                raise RuntimeError("tiny image")
            dest.write_bytes(data)
            return
        except (urllib.error.URLError, TimeoutError, RuntimeError) as err:
            last = err
            time.sleep(min(20, 1.4 ** attempt))
    raise RuntimeError(f"image failed {url}: {last}")


def row_image_url(offset):
    payload = fetch_json(ROWS_URL.format(offset=offset, length=1))
    rows = payload.get("rows") or []
    if not rows:
        raise RuntimeError(f"no row at {offset}")
    image = (rows[0].get("row") or {}).get("image") or {}
    src = image.get("src")
    if not src:
        raise RuntimeError(f"no image src at {offset}")
    return src


def clear_mug_images():
    if not IMAGE_DIR.exists():
        return
    for path in IMAGE_DIR.iterdir():
        if path.is_file() and path.name.lower().startswith(("mug-", "face-")):
            path.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", type=int, default=80)
    parser.add_argument("--foils", type=int, default=160)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--rescan", action="store_true")
    args = parser.parse_args()

    names, include = load_codebook()
    CACHE.mkdir(parents=True, exist_ok=True)

    if INDEX_PATH.exists() and not args.rescan:
        cached = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        people = cached.get("people") or []
        if cached.get("partial"):
            print(f"Resuming scan from row {cached.get('offset')}; {len(people)} male fronts so far")
            people_map = {p["id"]: p for p in people}
            people_map, total = scan_index(names, include, start_offset=int(cached.get("offset") or 0), people=people_map)
            people = list(people_map.values())
            INDEX_PATH.write_text(
                json.dumps({"scannedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "rowCount": total, "people": people}, indent=2),
                encoding="utf-8",
            )
        else:
            print(f"Loaded cached index: {len(people)} male fronts")
    else:
        people_map, total = scan_index(names, include)
        people = list(people_map.values())
        INDEX_PATH.write_text(
            json.dumps({"scannedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "rowCount": total, "people": people}, indent=2),
            encoding="utf-8",
        )
        print(f"Wrote {INDEX_PATH}")

    targets = [p for p in people if p.get("childTarget")]
    foils = [p for p in people if not p.get("childTarget")]
    print(f"Male fronts: {len(people)}; child-predation targets: {len(targets)}; foils: {len(foils)}")

    rng = random.Random(args.seed)
    rng.shuffle(targets)
    rng.shuffle(foils)
    picked = targets[: args.targets] + foils[: args.foils]
    if len([p for p in picked if p.get("childTarget")]) < 18:
        print("Fewer than 18 child-predation targets with front photos.", file=sys.stderr)

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    clear_mug_images()

    records = []
    for i, person in enumerate(picked, start=1):
        filename = f"mug-{i:04d}.jpg"
        dest = IMAGE_DIR / filename
        print(f"[{i}/{len(picked)}] {person['id']} {'TARGET' if person.get('childTarget') else 'foil'}", flush=True)
        src = row_image_url(int(person["offset"]))
        download_image(src, dest)
        eth = ETHNICITY[person.get("ethnicity", 0)] if 0 <= int(person.get("ethnicity") or 0) < len(ETHNICITY) else None
        records.append(
            {
                "sourceId": "il-idoc-hf",
                "sourceState": "IL",
                "sourceType": "state-prison",
                "sourceBookingId": person["id"],
                "offense": ", ".join(person.get("charges") or []) or "IDOC holding offense",
                "gender": "male",
                "race": eth,
                "age": None,
                "year": 2019,
                "poolRole": "target" if person.get("childTarget") else "foil",
                "image": filename,
                "childCharges": [c for c in person.get("charges") or [] if c.strip().upper() in include],
            }
        )

    PICKED_PATH.write_text(json.dumps({"pickedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "records": records}, indent=2), encoding="utf-8")
    print(f"Downloaded {len(records)} photos. Staging: {PICKED_PATH}")


if __name__ == "__main__":
    main()
