#!/usr/bin/env python3
"""Builds assets/ether-cams.json, the cams in destroy mode's ether.

Searches YouTube for live streams in each category, keeps the ones that look like
real cameras on real places (no music loops, news or games) and that allow
embedding, and groups them by channel. Adds central London's TfL jam cams and a
few Twitch streams. Live streams come and go, so rerun this now and then:

    python3 tools/ether-cams.py
"""
import concurrent.futures as cf
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'ether-cams.json'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
HEADERS = {'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg'}

CATEGORIES = {
    'wild': ['bear cam', 'brown bear live cam', 'wolf cam live', 'moose cam live', 'bison cam live', 'wildlife live cam', 'deer cam live', 'fox den live cam', 'forest live cam animals', 'polar bear cam'],
    'birds': ['eagle nest cam', 'bald eagle live cam', 'osprey cam live', 'owl cam live', 'bird feeder live cam', 'hummingbird cam live', 'falcon cam live', 'stork nest live cam', 'puffin cam live', 'heron nest cam', 'hawk nest cam'],
    'ocean': ['aquarium live cam', 'jellyfish cam live', 'shark cam live', 'coral reef live cam', 'underwater live cam', 'kelp forest cam', 'sea otter cam live', 'penguin cam live', 'sea lion cam live', 'manatee cam live', 'reef cam live'],
    'africa & zoos': ['africa waterhole live cam', 'africam live', 'elephant cam live', 'giraffe cam live', 'zoo live cam', 'panda cam live', 'lion cam live', 'gorilla cam live', 'namibia waterhole live', 'tiger cam live', 'red panda cam'],
    'pets & farms': ['kitten cam live', 'puppy cam live', 'cat rescue live cam', 'farm animals live cam', 'goat cam live', 'chicken coop live cam', 'beehive live cam', 'horse stable live cam', 'dog shelter live cam'],
    'cities': ['times square live cam', 'shibuya live camera', 'tokyo live camera', 'new york live cam', 'london live cam', 'paris live cam', 'venice live cam', 'amsterdam live cam', 'dublin live cam', 'prague live cam', 'rome live cam', 'las vegas live cam', 'hong kong live cam', 'seoul live cam', 'bangkok live cam', 'istanbul live cam', 'new orleans live cam', 'chicago live cam', 'san francisco live cam', 'sydney live cam', 'singapore live cam', 'osaka live camera', 'kyoto live camera', 'edinburgh live cam', 'barcelona live cam', 'jackson hole town square live', 'key west live cam', 'nashville live cam', 'abbey road crossing live', 'street live cam 4k'],
    'land & sea': ['beach live cam', 'hawaii live cam', 'volcano live cam', 'northern lights live cam', 'mountain live cam', 'waterfall live cam', 'niagara falls live cam', 'yellowstone live cam', 'ski resort live cam', 'lake live cam', 'iceland live cam', 'alps live cam', 'surf live cam', 'desert live cam'],
    'machines': ['airport live cam', 'train live cam', 'harbor live cam', 'port live cam ships', 'railway live cam', 'bridge live cam', 'canal live cam', 'panama canal live cam', 'rocket launch pad live cam', 'construction site live cam'],
    'space': ['nasa live', 'observatory live cam', 'meteor cam live', 'starbase live', 'spaceflight live'],
}
# and wider: more animals, more cities (in their own languages too), more of everything
MORE = {
    'wild': ['elk cam live', 'grizzly cam', 'bear den cam', 'beaver cam live', 'badger cam live', 'squirrel cam live', 'wildlife pond cam', 'bat cam live', 'trail cam live', 'raccoon cam live'],
    'birds': ['barn owl cam', 'kestrel cam live', 'nest box camera live', 'bird bath cam live', 'swallow nest cam', 'albatross cam', 'vulture cam live', 'condor cam live', 'woodpecker cam live', 'flamingo cam live', 'loon cam live', 'great horned owl cam'],
    'ocean': ['aquarium webcam', 'fish cam live', 'octopus cam', 'seal cam live', 'walrus cam live', 'dolphin cam live', 'beluga cam live', 'sea turtle cam live', 'tide pool cam live', 'whale cam live', 'pier underwater cam'],
    'africa & zoos': ['zoo webcam live', 'rhino cam live', 'zebra cam live', 'hippo cam live', 'cheetah cam live', 'leopard cam live', 'chimpanzee cam live', 'kangaroo cam live', 'koala cam live', 'sloth cam live', 'capybara cam live', 'monkey cam live', 'african wildlife live cam'],
    'pets & farms': ['cat cam live', 'dog cam live', 'pig cam live', 'cow barn cam live', 'duck cam live', 'bunny cam live', 'hamster cam live', 'animal shelter live cam', 'donkey cam live', 'llama cam live', 'sheep cam live'],
    'cities': ['berlin live cam', 'munich live cam', 'vienna live cam', 'budapest live cam', 'krakow live cam', 'warsaw live cam', 'stockholm live cam', 'oslo live cam', 'copenhagen live cam', 'helsinki live cam', 'reykjavik live cam', 'lisbon live cam', 'madrid live cam', 'seville live cam', 'florence live cam', 'milan live cam', 'naples live cam', 'athens live cam', 'zurich live cam', 'brussels live cam', 'bruges live cam', 'montreal live cam', 'toronto live cam', 'vancouver live cam', 'quebec city live cam', 'boston live cam', 'washington dc live cam', 'philadelphia live cam', 'miami live cam', 'seattle live cam', 'los angeles live cam', 'san diego live cam', 'denver live cam', 'austin live cam', 'mexico city live cam', 'havana live cam', 'buenos aires live cam', 'sao paulo live cam', 'cape town live cam', 'dubai live cam', 'tel aviv live cam', 'mumbai live cam', 'kathmandu live cam', 'taipei live camera', 'manila live cam', 'bali live cam', 'melbourne live cam', 'auckland live cam', 'sapporo live camera', 'fukuoka live camera', 'yokohama live camera', 'akihabara live camera', 'shinjuku live camera', 'dotonbori live camera', 'busan live cam', 'hanoi live cam', 'ライブカメラ 交差点', 'ライブカメラ 駅前', 'webcam live stadt', 'webcam en direct ville', 'webcam in diretta piazza', 'cámara en vivo ciudad', 'câmera ao vivo cidade', 'kamera na żywo rynek', 'canlı kamera şehir', 'livecam stad'],
    'land & sea': ['mountain webcam live', 'glacier cam live', 'fjord live cam', 'lighthouse live cam', 'river live cam', 'snow live cam', 'geyser live cam', 'canyon live cam', 'caribbean live cam', 'maldives live cam', 'greek island live cam', 'swiss alps webcam live', 'dolomites live cam', 'patagonia live cam', 'norway live cam', 'scotland live cam', 'ireland live cam', 'cornwall live cam', 'lake tahoe live cam', 'grand canyon live cam', 'ライブカメラ 海', 'ライブカメラ 富士山'],
    'machines': ['airport webcam live', 'plane spotting live', 'railcam live', 'tram live cam', 'ferry live cam', 'ship cam live', 'lock live cam', 'drawbridge live cam', 'container port live cam', 'wind farm live cam', 'dam live cam', 'highway live cam'],
    'space': ['rocket launch live cam', 'spaceport live cam', 'all sky camera live'],
}
for cat, qs in MORE.items():
    CATEGORIES[cat] = CATEGORIES[cat] + qs
# four cities get a branch of their own: searched for by name (and any cam elsewhere
# that's in one of them). Each cam has to name its place; music over a real camera
# is fine here, but not news, clocks or rendered rooms. Brussels itself has no live
# cams that embed (as of writing), so it's Belgium: the coast, Bruges and so on.
CITY_BAD = re.compile(r'news|clock|bedroom|render|asmr|watch party|radio|podcast|game|leafs|faceoff|church|\bmass\b|world|around the|tour\b|top live', re.I)
CITIES = {
    'montréal': (['montreal live cam', 'montréal webcam', 'caméra en direct montréal', 'old port montreal live cam', 'mont royal live cam', 'downtown montreal live cam', 'faucons udem', 'montreal trudeau airport live', 'aéroport montréal webcam'],
                  r'montr[eé]al|mont[- ]royal|jacques[- ]cartier|udem|trudeau', r'quebec city|québec city|port de québec'),
    'toronto': (['toronto live cam', 'toronto skyline live cam', 'cn tower live cam', 'torontolive4k', 'toronto railcam', 'gardiner expressway live', 'toronto harbourfront live cam', 'toronto island live cam'],
                r'toronto|cn tower|gardiner', r'buffalo'),
    'san francisco': (['san francisco live cam', 'golden gate bridge live cam', 'bay bridge live cam', 'pier 39 live cam', 'fishermans wharf live cam', 'alcatraz live cam', 'san francisco bay live cam'],
                      r'san francisco|golden gate|alcatraz|pier 39|fisherman.?s wharf|\bsfo\b|oakland bay bridge', r'tamsui|village|淡水|30a|mid-bay'),
    'belgium': (['belgium live webcam', 'belgique webcam direct', 'weercamera live', 'brugge live cam', 'oostende live cam', 'gent live cam', 'antwerpen live cam', 'brussels live cam', 'bruxelles webcam', 'knokke live cam'],
                r'belgi|brussel|bruxelles|\bbrugge\b|\bbruges\b|oostende|ostend|\bgent\b|ghent|antwerp|knokke|de panne|koksijde|nieuwpoort|zeebrugge|blankenberge|leuven|li[eè]ge|namur|weercamera', r'^$'),
}
# what a cam is of says where it goes, more than the search that found it (first match wins)
SORT = [
    ('ocean', r'aquarium|reef|underwater|jelly|shark|penguin|otter|\bseals?\b|sea lion|manatee|whale|orca|kelp|coral|crab|\bfish'),
    ('birds', r'eagle|osprey|falcon|peregrine|\bowl|hawk|heron|stork|puffin|\bbird|\bnest\b|feeder|hummingbird|condor'),
    ('space', r'\biss\b|space station|starbase|launch (pad|complex|facility)|observatory|meteor'),
    ('machines', r'\brail|train|station|airport|port of|harbou?r|\bships?\b|cruise|bridge|canal|construction'),
    ('africa & zoos', r'africa|safari|waterhole|elephant|giraffe|\blions?\b|gorilla|orangutan|panda|\bzoo\b|namibia|kenya|tanzania|rhino|zebra'),
    ('pets & farms', r'kitten|puppy|\bcats?\b|\bdogs?\b|farm|goat|chicken|coop|sheep|horse|foal|alpaca|\bpigs?\b|beehive|rescue|sanctuary'),
    ('wild', r'katmai|brooks falls|anan bear|\bbears?\b|\bwol(f|ves)\b|bison|moose|\bdeer\b|\bfox|\belk\b|wildlife'),
    ('land & sea', r'beach|\blake\b|mountain|volcano|kilauea|waterfall|\bfalls\b|\bski\b|surf|aurora|northern lights'),
    ('cities', r'square|street|crossing|\bcity\b|downtown|\btown\b|plaza|avenue|\bpub\b|shibuya|times sq'),
]
# space is mostly loops of old footage and trackers; these are really live
SPACE_OK = re.compile(r'^NASA$|NASASpaceflight|Observatory|LabPadre|Avid Space|Virtual Telescope|Spaceflight Now|SpaceX|Astro\b|Meteor', re.I)
GOOD = re.compile(r'\bcam\b|cams\b|camera|webcam|kamera|c[aâá]mera|cam[eé]ra|canl[ıi]|\bnest\b|explore\.org|earthcam|live ?view|live ?stream|livestream|\b24/7\b|waterhole|aquarium|\bzoo\b|ライブ|カメラ', re.I)
BAD = re.compile(r'news|radio|music|lo-?fi|beats|relax|sleep|asmr|ambien|sounds?\b|fireplace|screensaver|piano|jazz|\bmix\b|game|gaming|minecraft|fortnite|roblox|\bgta\b|church|\bmass\b|prayer|sermon|trading|crypto|bitcoin|stock|podcast|reaction|election|\bwar\b|attack|missile|breaking|football|soccer|\bnba\b|\bnfl\b|\bmatch\b|ai generated|\bloop\b|simulat|4k video|drone footage|meditat|yoga|chat|\bq&a\b|pray|bible|quran|rosary|tv channel|tv live|\bfm\b|scanner|police|fire dept|emergency|traffic stop|shooting', re.I)
CHANNEL_BAD = re.compile(r'news|tv\b|radio|music|lofi|records', re.I)


def get(url, timeout=20):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf8', 'ignore')


def search(query):
    url = 'https://www.youtube.com/results?' + urllib.parse.urlencode({'search_query': query, 'sp': 'EgJAAQ=='})
    try:
        html = get(url)
    except Exception as e:
        print('  search failed:', query, e)
        return []
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', html)
    if not m:
        return []
    found = []

    def walk(o):
        if isinstance(o, dict):
            v = o.get('videoRenderer')
            if v and 'videoId' in v:
                title = ''.join(r.get('text', '') for r in v.get('title', {}).get('runs', []))
                owner = ''.join(r.get('text', '') for r in v.get('ownerText', {}).get('runs', []))
                live = 'LIVE' in json.dumps(v.get('badges', [])) + json.dumps(v.get('thumbnailOverlays', []))
                found.append({'id': v['videoId'], 'title': title, 'owner': owner, 'live': live})
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(json.loads(m.group(1)))
    return found


def embeddable(vid):
    url = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode({'url': f'https://www.youtube.com/watch?v={vid}', 'format': 'json'})
    try:
        get(url, 10)
        return True
    except Exception:
        return False


def clean(title, owner):
    t = re.sub(r'[\U0001F000-\U0001FFFF☀-➿️‍]', '', title)
    t = re.sub(r'【[^】]*】|\[[^\]]*\]|\([^)]*\b(live|4k|hd|24/7)\b[^)]*\)', ' ', t, flags=re.I)
    t = re.split(r'\s[|｜]\s|\s\|\s?|\s-\s(?=powered by|by\s)', t)[0]
    t = re.sub(r'\b(live\s*(stream(ing)?|cam(era)?|webcam|view)?|livestream|webcam|24/7|4k|uhd|hd|now|streaming)\b', ' ', t, flags=re.I)
    t = re.sub(r'\s*[-–:,]\s*$', '', re.sub(r'^\s*[-–:,]\s*', '', re.sub(r'\s+', ' ', t))).strip()
    t = re.sub(r'\s*powered by\s+explore\.org.*$|\s*by\s+(camstreamer|earthcam|explore\.org).*$', '', t, flags=re.I)
    t = re.sub(r'explore\.org', '', t, flags=re.I).strip(' -|!' + chr(0x2013) + chr(0x2014))
    return t or owner


def short(name):
    s = re.split(r'\s[-–:]\s|,\s', name)[0].strip()
    return s if len(s) <= 26 else s[:25].rstrip() + '…'


def main():
    seen, cams = set(), []
    for cat, queries in CATEGORIES.items():
        for q in queries:
            got = search(q)
            kept = 0
            for v in got:
                text = v['title'] + ' ' + v['owner']
                if not v['live'] or v['id'] in seen or BAD.search(text) or CHANNEL_BAD.search(v['owner']) or not GOOD.search(text):
                    continue
                seen.add(v['id'])
                where = next((c for c, rx in SORT if re.search(rx, v['title'], re.I)), cat)
                if where == 'space' and not SPACE_OK.search(v['owner']):
                    continue
                cams.append({**v, 'cat': where})
                kept += 1
            print(f'{cat:13} {q:36} {len(got):3} results, {kept} kept')
            time.sleep(0.4)
    in_city = lambda text, inc, exc: re.search(inc, text, re.I) and not re.search(exc, text, re.I)
    for city, (queries, inc, exc) in CITIES.items():
        for q in queries:
            got = search(q)
            kept = 0
            for v in got:
                text = v['title'] + ' ' + v['owner']
                if not v['live'] or v['id'] in seen or CITY_BAD.search(text) or not in_city(text, inc, exc) or not (GOOD.search(text) or re.search(r'live', text, re.I)):
                    continue
                seen.add(v['id'])
                cams.append({**v, 'cat': 'four cities', 'city': city})
                kept += 1
            print(f'{city:13} {q:36} {len(got):3} results, {kept} kept')
            time.sleep(0.4)
    for c in cams:
        if 'city' not in c:
            c['city'] = next((city for city, (_, inc, exc) in CITIES.items() if in_city(c['title'] + ' ' + c['owner'], inc, exc)), None)
            if c['city']:
                c['cat'] = 'four cities'
    with cf.ThreadPoolExecutor(8) as ex:
        ok = list(ex.map(lambda c: embeddable(c['id']), cams))
    cams = [c for c, e in zip(cams, ok) if e]
    print(len(cams), 'embeddable live cams')

    groups = []
    # the four cities first: a branch each, with San Francisco's Caltrans traffic cams (live video) too
    city_kids = []
    try:
        caltrans = json.loads(get('https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json'))['data']
    except Exception as e:
        print('  caltrans failed:', e)
        caltrans = []
    for city in CITIES:
        leaves = [{'k': 'yt', 'id': c['id'], 'n': short(clean(c['title'], c['owner'])), 't': clean(c['title'], c['owner']), 'by': c['owner']} for c in cams if c.get('city') == city][:40]
        if city == 'san francisco':
            for d in caltrans:
                cc = d['cctv']
                loc, img = cc['location'], cc['imageData']
                if loc.get('county') != 'San Francisco' or cc.get('inService') != 'true' or not img.get('streamingVideoURL'):
                    continue
                name = loc['locationName'].split('--')[-1].strip()
                leaves.append({'k': 'hls', 'id': img['streamingVideoURL'], 'poster': img['static']['currentImageURL'], 'n': short(name), 't': name + ', San Francisco', 'by': 'Caltrans traffic cam'})
        if leaves:
            city_kids.append({'n': city, 'kids': leaves})
    if city_kids:
        groups.append({'n': 'four cities', 'kids': city_kids})
    for cat in CATEGORIES:
        mine = [c for c in cams if c['cat'] == cat]
        by_owner = {}
        for c in mine:
            by_owner.setdefault(c['owner'], []).append(c)
        # channels with a few cams are a branch each; the odd ones out share branches
        kids, loose = [], []
        for owner, cs in sorted(by_owner.items(), key=lambda kv: -len(kv[1])):
            leaves = [{'k': 'yt', 'id': c['id'], 'n': short(clean(c['title'], owner)), 't': clean(c['title'], owner), 'by': owner} for c in cs[:20]]
            if len(leaves) >= 3:
                kids.append({'n': owner, 'kids': leaves})
            else:
                loose += leaves
        for i in range(0, len(loose), 6):
            kids.append({'n': '', 'kids': loose[i:i + 6]})
        if kids:
            groups.append({'n': cat, 'kids': kids})

    # central London's traffic cameras (TfL), and a roulette through all of them
    tfl = json.loads(get('https://api.tfl.gov.uk/Place/Type/JamCam'))
    central = re.compile(r'Piccadilly|Trafalgar|Parliament|Tower Br|Marble Arch|Westminster|Oxford St|Regent St|Strand|Euston|Kings Cross|Camden|Hyde Park|Victoria|Waterloo|London Bridge|Embankment|Aldwych|Holborn|Old St|Elephant|Vauxhall|Knightsbridge|Blackfriars|Southwark|Shoreditch|Notting Hill|Baker St|Park Lane|Hammersmith|Chelsea|Battersea|Greenwich|Brixton|Angel|Islington|Whitechapel|Aldgate|Lambeth|Bank|Mansion House|Cannon St|Ludgate|Fleet St|Charing Cross|Haymarket|Pall Mall|Mall\b|Bayswater|Edgware Rd|Marylebone|Tottenham Ct', re.I)
    london = []
    for c in tfl:
        props = {p['key']: p['value'] for p in c.get('additionalProperties', [])}
        if props.get('available') == 'true' and props.get('videoUrl') and central.search(c['commonName']):
            london.append({'k': 'tfl', 'id': c['id'].replace('JamCams_', ''), 'n': short(c['commonName']), 't': c['commonName'] + ', London', 'by': 'TfL jam cam'})
    # and more of London besides (every camera's a real place), up to a few hundred
    rest = []
    for c in tfl:
        props = {p['key']: p['value'] for p in c.get('additionalProperties', [])}
        if props.get('available') == 'true' and props.get('videoUrl') and not central.search(c['commonName']):
            rest.append({'k': 'tfl', 'id': c['id'].replace('JamCams_', ''), 'n': short(c['commonName']), 't': c['commonName'] + ', London', 'by': 'TfL jam cam'})
    london = sorted(london, key=lambda x: x['t'])[:80] + sorted(rest, key=lambda x: x['t'])[::3][:180]
    lkids = [{'n': 'roulette', 'kids': [{'k': 'surf', 'id': 'all', 'n': 'cam roulette', 't': 'somewhere in London', 'by': 'every TfL jam cam, a clip at a time'}]}]
    lkids += [{'n': '', 'kids': london[i:i + 8]} for i in range(0, len(london), 8)]
    groups.append({'n': 'london streets', 'kids': lkids})
    groups.append({'n': 'streams', 'kids': [{'n': 'twitch', 'kids': [
        {'k': 'tw', 'id': 'lofigirl', 'n': 'lofi girl', 't': 'lofi girl', 'by': 'twitch.tv/lofigirl'},
        {'k': 'tw', 'id': 'lofi_loungee', 'n': 'lofi lounge', 't': 'lofi lounge', 'by': 'twitch.tv/lofi_loungee'},
        {'k': 'tw', 'id': 'emptyveetv', 'n': 'empty tv', 't': 'empty tv', 'by': 'twitch.tv/emptyveetv'},
    ]}]})
    total = sum(len(k['kids']) for g in groups for k in g['kids'])
    data = {'made': time.strftime('%Y-%m-%d'), 'groups': groups}
    # and where in the world each of them is (tools/ether-geo.py)
    import importlib.util
    spec = importlib.util.spec_from_file_location('ether_geo', Path(__file__).with_name('ether-geo.py'))
    geo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(geo)
    placed, unknown = geo.geolocate(data)
    print(f'placed {placed} cams on the map, {unknown} somewhere unknown')
    OUT.write_text(json.dumps(data, ensure_ascii=True, separators=(',', ':')))
    print(f'wrote {OUT} with {total} cams in {len(groups)} groups')


if __name__ == '__main__':
    main()
