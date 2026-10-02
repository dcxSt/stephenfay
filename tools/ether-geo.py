#!/usr/bin/env python3
"""Puts the ether's cams on the map: adds a rough [lat, lon] (and the place's name)
to every cam in assets/ether-cams.json, and a land mask for the dot map.

London's cams come with coordinates (TfL), so do San Francisco's (Caltrans). The
YouTube ones are placed from their titles and channel names: a few famous spots
by hand, then towns and cities (GeoNames, bigger ones winning, and a nudge for one
whose state or country is named too), then states and provinces, then countries.
Whatever can't be placed goes to Point Nemo, as far from anywhere as the sea gets.
ether-cams.py runs this at the end; on its own it re-places the existing list:

    python3 tools/ether-geo.py
"""
import base64
import io
import json
import math
import re
import urllib.request
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'ether-cams.json'
CACHE = Path('/tmp/ether-geo-cache')
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'}
NEMO = (-48.88, -123.39)

# famous spots the gazetteer wouldn't find (or would find wrong)
LANDMARKS = [
    ('Brooks Falls', 58.554, -155.778, 'Katmai, Alaska'), ('Katmai', 58.55, -155.78, 'Katmai, Alaska'), ('Anan', 56.18, -131.88, 'Anan, Alaska'),
    ('Decorah', 43.30, -91.79, 'Decorah, Iowa'), ('Big Bear', 34.24, -116.91, 'Big Bear, California'), ('Monterey Bay', 36.62, -121.90, 'Monterey Bay'),
    ('Aquarium of the Pacific', 33.76, -118.20, 'Long Beach'), ('Georgia Aquarium', 33.763, -84.395, 'Atlanta'), ('SeaLife Center', 60.10, -149.44, 'Seward, Alaska'),
    ('Moody Gardens', 29.27, -94.86, 'Galveston'), ('California Academy of Sciences', 37.77, -122.47, 'San Francisco'), ('Utopia Village', 16.09, -86.94, 'Utila, Honduras'),
    ('Farm Sanctuary', 42.38, -76.87, 'Watkins Glen'), ('OrcaLab', 50.59, -126.68, 'Hanson Island, BC'), ('Cornell Lab', 42.48, -76.45, 'Ithaca'),
    ('Times Square', 40.758, -73.985, 'Times Square'), ('Shibuya', 35.659, 139.700, 'Shibuya, Tokyo'), ('渋谷', 35.659, 139.700, 'Shibuya, Tokyo'),
    ('Jackson Hole', 43.48, -110.76, 'Jackson Hole'), ('Niagara', 43.08, -79.07, 'Niagara Falls'), ('Yellowstone', 44.6, -110.5, 'Yellowstone'),
    ('Kilauea', 19.41, -155.28, 'Kilauea, Hawaii'), ('Waikiki', 21.28, -157.83, 'Waikiki'), ('Abbey Road', 51.532, -0.178, 'Abbey Road, London'),
    ('Etosha', -18.9, 16.0, 'Etosha, Namibia'), ('Okaukuejo', -19.18, 15.92, 'Etosha, Namibia'), ('Kalahari', -24.0, 21.0, 'the Kalahari'),
    ('Rosie\'s Pan', -24.8, 31.5, 'Sabi Sand, South Africa'), ('Tembe', -27.0, 32.4, 'Tembe, South Africa'), ('Olifants', -24.0, 31.7, 'Kruger, South Africa'),
    ('Mara River', -1.5, 35.0, 'the Masai Mara'), ('Tortilis', -2.65, 37.25, 'Amboseli, Kenya'), ('ol Donyo', -2.6, 37.9, 'Chyulu Hills, Kenya'),
    ('Africam', -24.0, 31.5, 'Kruger, South Africa'), ('Naledi', -24.4, 31.2, 'Balule, South Africa'), ('GRACE', -0.95, 28.75, 'Grauer gorillas, DR Congo'),
    ('Starbase', 25.997, -97.157, 'Starbase, Texas'), ('Boca Chica', 25.997, -97.157, 'Starbase, Texas'), ('Space Coast', 28.5, -80.6, 'the Space Coast'),
    ('Cape Canaveral', 28.39, -80.6, 'Cape Canaveral'), ('Kennedy Space', 28.57, -80.65, 'Cape Canaveral'), ('Mount Washington', 44.27, -71.30, 'Mount Washington'),
    ('Rotterdam', 51.95, 4.14, 'Rotterdam'), ('Panama Canal', 9.08, -79.68, 'the Panama Canal'), ('Maho Beach', 18.04, -63.12, 'Sint Maarten'),
    ('Key West', 24.555, -81.78, 'Key West'), ('Duval', 24.555, -81.80, 'Key West'), ('Soo Locks', 46.50, -84.35, 'Sault Ste. Marie'),
    ('Mackinac', 45.82, -84.73, 'Mackinac'), ('Golden Gate', 37.82, -122.48, 'San Francisco'), ('Alcatraz', 37.827, -122.423, 'San Francisco'),
    ('Pier 39', 37.808, -122.41, 'San Francisco'), ('Grand Canyon', 36.1, -112.1, 'the Grand Canyon'), ('Lake Tahoe', 39.1, -120.04, 'Lake Tahoe'),
    ('Pine Mountain Observatory', 43.79, -120.94, 'Oregon'), ('Northumberland', 55.2, -2.0, 'Northumberland'), ('Isle of Wight', 50.69, -1.3, 'Isle of Wight'),
    ('Isle Of Wight', 50.69, -1.3, 'Isle of Wight'), ('Solent', 50.77, -1.3, 'the Solent'), ('Chesapeake', 38.9, -76.4, 'Chesapeake Bay'),
    ('Big Sur', 36.27, -121.81, 'Big Sur'), ('San Simeon', 35.64, -121.19, 'San Simeon'), ('CN Tower', 43.643, -79.387, 'Toronto'),
    ('Gardiner', 43.64, -79.40, 'Toronto'), ('UdeM', 45.50, -73.615, 'Montréal'), ('Trudeau', 45.47, -73.74, 'Montréal'),
    ('Wakefield', 53.68, -1.50, 'Wakefield'), ('Laguardia', 40.777, -73.872, 'New York'), ('LaGuardia', 40.777, -73.872, 'New York'),
    ('Midway Airport', 41.786, -87.752, 'Chicago'), ('Reno-Tahoe', 39.50, -119.77, 'Reno'), ('Las Vegas', 36.17, -115.14, 'Las Vegas'),
    ('Venice Beach', 33.985, -118.47, 'Venice Beach, Los Angeles'), ('Lanzarote', 29.0, -13.6, 'Lanzarote'), ('Canary', 28.3, -16.5, 'the Canary Islands'),
    ('Kruger', -24.0, 31.5, 'Kruger, South Africa'), ('Serengeti', -2.3, 34.8, 'the Serengeti'), ('Okavango', -19.3, 22.9, 'the Okavango'),
    ('Svalbard', 78.2, 15.6, 'Svalbard'), ('Hong Kong', 22.30, 114.17, 'Hong Kong'), ('香港', 22.30, 114.17, 'Hong Kong'),
    ('Victoria Harbour', 22.29, 114.17, 'Hong Kong'), ('維港', 22.29, 114.17, 'Hong Kong'), ('Cape Town', -33.92, 18.42, 'Cape Town'),
    ('Table Mountain', -33.96, 18.40, 'Cape Town'), ('Dotonbori', 34.669, 135.501, 'Osaka'), ('道頓堀', 34.669, 135.501, 'Osaka'),
    ('Fuji', 35.36, 138.73, 'Mount Fuji'), ('富士', 35.36, 138.73, 'Mount Fuji'), ('Akihabara', 35.70, 139.77, 'Akihabara, Tokyo'),
    ('Shinjuku', 35.69, 139.70, 'Shinjuku, Tokyo'), ('新宿', 35.69, 139.70, 'Shinjuku, Tokyo'), ('Okinawa', 26.5, 127.9, 'Okinawa'),
    ('沖縄', 26.5, 127.9, 'Okinawa'), ('Hawaii', 20.8, -156.3, 'Hawaii'), ('Maui', 20.8, -156.3, 'Maui'), ('Oahu', 21.47, -157.98, 'Oahu'),
    ('Kauai', 22.05, -159.5, 'Kauai'), ('Galapagos', -0.7, -90.5, 'the Galapagos'), ('Antarctica', -77.85, 166.67, 'Antarctica'),
    ('Samui', 9.51, 100.01, 'Koh Samui, Thailand'), ('LAX', 33.94, -118.40, 'Los Angeles'), ('USVI', 18.34, -64.80, 'the US Virgin Islands'),
    ('Rhine Falls', 47.678, 8.615, 'Rhine Falls'), ('Wailea', 20.69, -156.44, 'Maui'), ('Boulder County', 40.09, -105.36, 'Boulder, Colorado'),
    ('Packery', 27.62, -97.20, 'Corpus Christi'), ('Caribbean', 16.5, -72.0, 'the Caribbean'), ('Koksijde', 51.12, 2.64, 'Koksijde, Belgium'),
    ('Oostduinkerke', 51.11, 2.68, 'Koksijde, Belgium'), ('Nieuwpoort', 51.13, 2.75, 'Nieuwpoort, Belgium'), ('Weercamera', 51.2, 2.9, 'the Belgian coast'),
    ('Seaton', 50.70, -3.07, 'Seaton, Devon'), ('Havenstreet', 50.71, -1.20, 'Isle of Wight'), ('Explore Bears', 58.55, -155.78, 'Katmai, Alaska'),
]
# one-word towns that are mostly just words in a title
STOP = set('''Live Bear Eagle Beach Mission Paradise Hope Orange Reading Bath Mobile Split Normal Victoria Wildlife Zoo Cam View Lake Falls River
Harbor Harbour Port Bay Park Garden Station Center Central North South East West Kingston Springfield Columbia Lafayette Dover Ocean Sandy Golden
Aurora Cape Coral Marina Florence Salem Jackson Lincoln Franklin Clinton Madison Washington Troy Athens Rome Paris Berlin Manchester Hampton Boulder
Deal Hollywood Sunrise Sunset Oasis Safari Delta Phoenix Eden Mercedes Mosquito Nest Canyon Summit Valley Ridge Grove Hill Hills Island Point Pond
Lodge Camp Farm Ranch Sanctuary Rescue Bird Birds Owl Hawk Falcon Osprey Heron Crane Swan Fox Wolf Elk Moose Bison Deer Otter Seal Whale Shark
Tiger Lion Panda Gorilla Kitten Puppy Cat Dog Goat Sheep Horse Pig Duck Bee Turtle Crab Coral Jelly Penguin Puffin Condor Hummingbird Feeder Cams
Webcam Camera Stream Streaming Watch Main Grand Little Great Old New Saint Santa San Fort Mount Lagos Cairo Lima Male Bar Beaver Badger Buffalo
Alexandria Cambridge Oxford Plymouth Portland Richmond Arlington Bristol Kent Essex Durham Newport Concord Auburn Albany Wilmington Greenville
Warren Marion Monroe Jefferson Hamilton Burlington Chester Clayton Dayton Fairfield Georgetown Highland Lexington Milton Oakland Riverside
Shelby Sterling Union Waterloo Winchester York Ontario Bridge Canal Lock Locks Pier Dock Ship Ships Train Trains Rail Railway Airport Runway
Tower Street Square Avenue Road Plaza Town City Downtown Village Nature Forest Wild Mountain Desert Glacier Snow Ice Sky Night Moon Sun Star
Space Earth World Planet Orbit Galaxy Cosmos Ghost Storm Rain Wind Fire Gold Silver Iron Stone Rock Crystal Diamond Pearl Ruby Amber Jade
Monterey Ithaca'''.split())


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def cached(name, url):
    CACHE.mkdir(exist_ok=True)
    p = CACHE / name
    if not p.exists():
        p.write_bytes(get(url, 120))
    return p.read_bytes()


def gazetteer():
    z = zipfile.ZipFile(io.BytesIO(cached('cities5000.zip', 'https://download.geonames.org/export/dump/cities5000.zip')))
    rows = [l.split('\t') for l in z.read('cities5000.txt').decode('utf8').splitlines()]
    admin = {}
    for l in cached('admin1.txt', 'https://download.geonames.org/export/dump/admin1CodesASCII.txt').decode('utf8').splitlines():
        code, name, ascii_, _ = l.split('\t')
        admin[code] = name
    countries = {}
    for l in cached('countries.txt', 'https://download.geonames.org/export/dump/countryInfo.txt').decode('utf8').splitlines():
        if l.startswith('#') or not l.strip():
            continue
        f = l.split('\t')
        countries[f[0]] = f[4]
    names, cjk, sums = {}, {}, {}
    for f in rows:
        name, ascii_, alts, lat, lon, cc, a1, pop = f[1], f[2], f[3], float(f[4]), float(f[5]), f[8], f[10], int(f[14] or 0)
        place = (pop, lat, lon, cc, a1, name)
        for n in {name, ascii_}:
            names.setdefault(n, []).append(place)
        if pop >= 40000:
            for alt in alts.split(','):
                if pop >= 250000 and len(alt) >= 2 and any(0x3040 <= ord(ch) <= 0x30ff or 0x4e00 <= ord(ch) <= 0x9fff or 0xac00 <= ord(ch) <= 0xd7af for ch in alt):
                    cjk.setdefault(alt, []).append(place)
                elif len(alt) >= 4 and alt[0].isupper() and all(ch.isalpha() or ch in " '.-" for ch in alt):
                    names.setdefault(alt, []).append(place)
        for key in (cc, cc + '.' + a1):
            s = sums.setdefault(key, [0, 0, 0])
            w = math.sqrt(pop + 1)
            s[0] += lat * w
            s[1] += lon * w
            s[2] += w
    centre = {k: (v[0] / v[2], v[1] / v[2]) for k, v in sums.items() if v[2]}
    regions, weight = {}, {}
    for code, name in list(admin.items()) + list(countries.items()):
        if code in centre and sums[code][2] > weight.get(name, 0):
            weight[name] = sums[code][2]
            regions[name] = (centre[code], name, code)
    us_codes = {code.split('.')[1]: code for code in admin if code.startswith('US.')}
    return names, cjk, regions, centre, admin, countries, us_codes


def place_of(text, gz):
    names, cjk, regions, centre, admin, countries, us_codes = gz
    for key, lat, lon, label in LANDMARKS:
        if re.search(r'(?<![A-Za-z])' + re.escape(key) + r'(?![A-Za-z])', text):
            return (lat, lon), label
    # which states and countries the text names, to back up a town of the same name
    hinted = set()
    for rname, (_, label, code) in regions.items():
        if len(rname) >= 4 and re.search(r'\b' + re.escape(rname) + r'\b', text):
            hinted.add(code)
    for m in re.finditer(r'(?:,\s*|\s)([A-Z]{2})\b', text):
        if m.group(1) in us_codes:
            hinted.add(us_codes[m.group(1)])
            hinted.add('US')
    letters = 'A-Za-z' + chr(0xc0) + '-' + chr(0x24f) + chr(0x1e00) + '-' + chr(0x1eff)
    cands = []
    # words with their hyphens and without ('Koksijde-Bad' is Koksijde)
    for words in (re.findall('[' + letters + "][" + letters + "'.\\-]*", text), re.findall('[' + letters + "][" + letters + "'.]*", text)):
        for size in (4, 3, 2, 1):
            for i in range(len(words) - size + 1):
                cands.append((size, ' '.join(words[i:i + size])))
    best = None
    for size, cand in cands:
        if cand not in names or not cand[0].isupper():
            continue
        if size == 1 and (cand in STOP or len(cand) < 4):
            continue
        region = cand in regions   # 'Montana', 'Oregon': the state, not the town of that name
        for pop, lat, lon, cc, a1, name in names[cand]:
            if region and pop < 1000000:
                continue
            backed = cc in hinted or f'{cc}.{a1}' in hinted
            if size == 1 and pop < 10000 and not backed:
                continue
            score = math.log10(pop + 10) + size * 0.8 + (3 if backed else 0)
            if not best or score > best[0]:
                label = name + (', ' + admin[f'{cc}.{a1}'] if cc == 'US' and f'{cc}.{a1}' in admin else ', ' + countries.get(cc, cc))
                best = (score, (lat, lon), label)
    for cand, places in cjk.items():
        if cand in text:
            for pop, lat, lon, cc, a1, name in places:
                score = math.log10(pop + 10) + 1.5
                if not best or score > best[0]:
                    best = (score, (lat, lon), name)
    if best:
        return best[1], best[2]
    for code in hinted:
        if code in centre:
            return centre[code], admin.get(code) or countries.get(code, code)
    return None, None


def land_mask(step=1.5, top=84):
    geo = json.loads(cached('land.geojson', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'))
    rings = []
    for f in geo['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            rings.extend(poly)
    w, h = int(360 / step), int(2 * top / step) + 1
    bits = bytearray((w * h + 7) // 8)
    for r in range(h):
        lat = top - r * step
        xs = []
        for ring in rings:
            for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
                if (y0 > lat) != (y1 > lat):
                    xs.append(x0 + (lat - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for c in range(w):
            lon = -180 + (c + 0.5) * step
            inside = sum(1 for x in xs if x < lon) % 2 == 1
            if inside:
                k = r * w + c
                bits[k >> 3] |= 1 << (k & 7)
    return {'step': step, 'top': top, 'w': w, 'h': h, 'land': base64.b64encode(bytes(bits)).decode()}


def geolocate(data):
    gz = gazetteer()
    tfl = {c['id'].replace('JamCams_', ''): (c['lat'], c['lon']) for c in json.loads(get('https://api.tfl.gov.uk/Place/Type/JamCam'))}
    caltrans = {}
    try:
        for d in json.loads(get('https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json'))['data']:
            loc, img = d['cctv']['location'], d['cctv']['imageData']
            caltrans[img.get('streamingVideoURL')] = (float(loc['latitude']), float(loc['longitude']))
    except Exception as e:
        print('  caltrans failed:', e)
    placed = unknown = 0
    for g in data['groups']:
        for k in g['kids']:
            for c in k['kids']:
                ll, label = None, None
                if c['k'] == 'tfl' and c['id'] in tfl:
                    ll, label = tfl[c['id']], 'London'
                elif c['k'] == 'surf':
                    ll, label = (51.507, -0.128), 'London'
                elif c['k'] == 'hls' and c['id'] in caltrans:
                    ll, label = caltrans[c['id']], 'San Francisco'
                elif c['k'] == 'tw' and c['id'] == 'lofigirl':
                    ll, label = (48.857, 2.352), 'Paris'
                else:
                    ll, label = place_of(c['t'], gz)
                    if not ll:
                        ll, label = place_of(c['t'] + ' ' + c.get('by', ''), gz)
                if ll:
                    placed += 1
                    c['ll'] = [round(ll[0], 3), round(ll[1], 3)]
                    c['pl'] = label
                else:
                    unknown += 1
                    c.pop('ll', None)
                    c['pl'] = 'somewhere'
    by = {}
    for g in data['groups']:
        for k in g['kids']:
            for c in k['kids']:
                if c.get('ll') and c['k'] == 'yt':
                    by.setdefault(c.get('by'), []).append((c['ll'], c['pl']))
    for g in data['groups']:
        for k in g['kids']:
            for c in k['kids']:
                spots = by.get(c.get('by')) if not c.get('ll') else None
                if spots and max(abs(x[0][0] - spots[0][0][0]) + abs(x[0][1] - spots[0][0][1]) for x in spots) < 4:
                    c['ll'], c['pl'] = spots[0]
                    placed += 1
                    unknown -= 1
    data['world'] = land_mask()
    return placed, unknown


if __name__ == '__main__':
    data = json.loads(OUT.read_text())
    placed, unknown = geolocate(data)
    OUT.write_text(json.dumps(data, ensure_ascii=True, separators=(',', ':')))
    print(f'placed {placed} cams, {unknown} somewhere unknown; wrote {OUT}')
