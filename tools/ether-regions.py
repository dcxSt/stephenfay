#!/usr/bin/env python3
"""Add live, embeddable public cameras from underrepresented regions.

Searches are place-specific and a result must name that place in its title or
publisher. Coordinates are deliberately city/landmark-level, not camera GPS.
Existing feeds are preserved; repeated runs deduplicate by provider and video ID.
Run: python3 tools/ether-regions.py
"""
import concurrent.futures as cf
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ether_cams', Path(__file__).with_name('ether-cams.py'))
cams = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cams)

# region, place, latitude, longitude, title/publisher aliases, search phrase
PLACES = [
    ('asia', 'Taipei, Taiwan', 25.03, 121.56, r'taipei|台北|臺北', 'Taipei 台北 live camera'),
    ('asia', 'Taiwan east coast', 23.98, 121.61, r'hualien|花蓮', '花蓮 即時影像 live camera'),
    ('asia', 'Busan, South Korea', 35.16, 129.06, r'busan|부산|haeundae|해운대', 'Busan 부산 live camera'),
    ('asia', 'Seoul, South Korea', 37.57, 126.98, r'seoul|서울|han river|한강', 'Seoul 서울 live camera'),
    ('asia', 'Da Nang, Vietnam', 16.05, 108.20, r'da nang|danang|đà nẵng', 'Da Nang Vietnam live webcam'),
    ('asia', 'Ho Chi Minh City, Vietnam', 10.78, 106.70, r'ho chi minh|saigon|sài gòn', 'Saigon Vietnam live camera'),
    ('asia', 'Bangkok, Thailand', 13.76, 100.50, r'bangkok|กรุงเทพ', 'Bangkok live webcam'),
    ('asia', 'Chiang Mai, Thailand', 18.79, 98.99, r'chiang mai|เชียงใหม่', 'Chiang Mai live webcam'),
    ('asia', 'Kuala Lumpur, Malaysia', 3.14, 101.69, r'kuala lumpur', 'Kuala Lumpur live webcam'),
    ('asia', 'Singapore', 1.29, 103.85, r'singapore|新加坡', 'Singapore live camera'),
    ('asia', 'Manila, Philippines', 14.60, 120.98, r'manila|makati', 'Manila live webcam'),
    ('asia', 'Bali, Indonesia', -8.65, 115.22, r'bali|canggu|kuta|sanur', 'Bali live webcam'),
    ('asia', 'Kathmandu, Nepal', 27.72, 85.32, r'kathmandu|काठमाण्डौ', 'Kathmandu live webcam'),
    ('asia', 'Mumbai, India', 19.08, 72.88, r'mumbai|bombay', 'Mumbai live camera'),
    ('asia', 'Hong Kong', 22.30, 114.17, r'hong kong|香港|victoria harbour', 'Hong Kong 香港 live camera'),
    ('asia', 'Ulaanbaatar, Mongolia', 47.92, 106.92, r'ulaanbaatar|ulan bator|улаанбаатар', 'Ulaanbaatar live webcam'),
    ('africa', 'Cape Town, South Africa', -33.92, 18.42, r'cape town|table mountain', 'Cape Town live webcam'),
    ('africa', 'Durban, South Africa', -29.86, 31.02, r'durban|umhlanga', 'Durban live webcam'),
    ('africa', 'Etosha, Namibia', -19.18, 15.92, r'etosha|okaukuejo', 'Etosha Okaukuejo waterhole live cam'),
    ('africa', 'Namib Desert, Namibia', -24.07, 15.89, r'namib|gondwana', 'Namibia desert waterhole live camera'),
    ('africa', 'Amboseli, Kenya', -2.65, 37.25, r'amboseli|tortilis', 'Amboseli Tortilis live camera'),
    ('africa', 'Chyulu Hills, Kenya', -2.60, 37.90, r'ol donyo|chyulu', 'ol Donyo Kenya live cam'),
    ('africa', 'Maasai Mara, Kenya', -1.50, 35.00, r'mara|kenya', 'Maasai Mara live cam'),
    ('africa', 'Zanzibar, Tanzania', -6.16, 39.19, r'zanzibar|nungwi|paje', 'Zanzibar live webcam'),
    ('africa', 'Victoria Falls, Zimbabwe', -17.93, 25.86, r'victoria falls', 'Victoria Falls live webcam'),
    ('africa', 'Diani Beach, Kenya', -4.28, 39.59, r'diani', 'Diani Beach Kenya live webcam'),
    ('eastern europe', 'Warsaw, Poland', 52.23, 21.01, r'warsaw|warszaw', 'Warszawa kamera na żywo'),
    ('eastern europe', 'Kraków, Poland', 50.06, 19.94, r'krak[oó]w|cracow', 'Kraków rynek kamera live'),
    ('eastern europe', 'Prague, Czechia', 50.08, 14.44, r'prague|praha', 'Prague live webcam'),
    ('eastern europe', 'Budapest, Hungary', 47.50, 19.04, r'budapest', 'Budapest live webcam'),
    ('eastern europe', 'Bucharest, Romania', 44.43, 26.10, r'bucharest|bucure[sș]ti', 'Bucuresti live webcam'),
    ('eastern europe', 'Brașov, Romania', 45.66, 25.60, r'bra[sș]ov', 'Brasov live webcam'),
    ('eastern europe', 'Sofia, Bulgaria', 42.70, 23.32, r'sofia|софия', 'Sofia Bulgaria live webcam'),
    ('eastern europe', 'Belgrade, Serbia', 44.82, 20.46, r'belgrade|beograd|београд', 'Belgrade live webcam'),
    ('eastern europe', 'Vilnius, Lithuania', 54.69, 25.28, r'vilnius', 'Vilnius live webcam'),
    ('eastern europe', 'Riga, Latvia', 56.95, 24.11, r'riga|rīga', 'Riga live webcam'),
    ('eastern europe', 'Tallinn, Estonia', 59.44, 24.75, r'tallinn', 'Tallinn live webcam'),
    ('steppe', 'Astana, Kazakhstan', 51.17, 71.43, r'astana|астана|nur.sultan', 'Астана веб камера онлайн'),
    ('steppe', 'Almaty, Kazakhstan', 43.24, 76.95, r'almaty|алматы|medeu|медеу|shymbulak|чимбулак', 'Алматы веб камера онлайн'),
    ('steppe', 'Karaganda, Kazakhstan', 49.80, 73.09, r'karaganda|караганда', 'Караганда веб камера онлайн'),
    ('steppe', 'Bishkek, Kyrgyzstan', 42.87, 74.59, r'bishkek|бишкек', 'Бишкек веб камера онлайн'),
    ('steppe', 'Tashkent, Uzbekistan', 41.30, 69.24, r'tashkent|ташкент|toshkent', 'Ташкент веб камера онлайн'),
    ('steppe', 'Orenburg, Russia', 51.77, 55.10, r'orenburg|оренбург', 'Оренбург веб камера онлайн'),
    ('steppe', 'Omsk, Russia', 54.99, 73.37, r'omsk|омск', 'Омск веб камера онлайн'),
    ('steppe', 'Novosibirsk, Russia', 55.03, 82.92, r'novosibirsk|новосибирск', 'Новосибирск веб камера онлайн'),
    ('steppe', 'Ulan-Ude, Russia', 51.83, 107.58, r'ulan.ude|улан.удэ', 'Улан Удэ веб камера онлайн'),
    ('steppe', 'Baikal, Russia', 51.86, 104.87, r'baikal|байкал|listvyanka|листвянка', 'Байкал веб камера онлайн'),
    ('south america', 'Rio de Janeiro, Brazil', -22.91, -43.17, r'rio de janeiro|copacabana|ipanema', 'Copacabana Rio câmera ao vivo'),
    ('south america', 'São Paulo, Brazil', -23.55, -46.63, r's[aã]o paulo|santos|guaruj[aá]', 'São Paulo câmera ao vivo'),
    ('south america', 'Florianópolis, Brazil', -27.60, -48.55, r'florian[oó]polis|floripa|canasvieiras', 'Florianópolis câmera ao vivo'),
    ('south america', 'Fortaleza, Brazil', -3.73, -38.52, r'fortaleza', 'Fortaleza câmera ao vivo'),
    ('south america', 'Salvador, Brazil', -12.97, -38.50, r'salvador|farol da barra', 'Salvador Bahia câmera ao vivo'),
    ('south america', 'Buenos Aires, Argentina', -34.60, -58.38, r'buenos aires|obelisco', 'Buenos Aires cámara en vivo'),
    ('south america', 'Ushuaia, Argentina', -54.80, -68.30, r'ushuaia', 'Ushuaia cámara en vivo'),
    ('south america', 'Bariloche, Argentina', -41.13, -71.31, r'bariloche', 'Bariloche cámara en vivo'),
    ('south america', 'Santiago, Chile', -33.45, -70.67, r'santiago|providencia', 'Santiago Chile cámara en vivo'),
    ('south america', 'Valparaíso, Chile', -33.05, -71.62, r'valparaiso|valparaíso|viña del mar', 'Valparaiso cámara en vivo'),
    ('south america', 'Lima, Peru', -12.05, -77.04, r'lima|miraflores', 'Lima Peru cámara en vivo'),
    ('south america', 'Cusco, Peru', -13.53, -71.97, r'cusco|cuzco', 'Cusco cámara en vivo'),
    ('south america', 'Cartagena, Colombia', 10.39, -75.48, r'cartagena', 'Cartagena Colombia cámara en vivo'),
    ('south america', 'Montevideo, Uruguay', -34.90, -56.16, r'montevideo', 'Montevideo cámara en vivo'),
]


# More specific places override a broad search's city or province match.
OVERRIDES = {
    'v5Y6WsD577M': (-23.99, -46.26, 'Guarujá, Brazil'),
    'gtI4YeUlMNU': (-23.97, -46.39, 'São Vicente, Brazil'),
    '5BxqzvR6TgM': (-23.96, -46.33, 'Santos, Brazil'),
    'rh3AboySTT4': (-38.34, -58.00, 'Mar del Sud, Argentina'),
    'sQfqxlZvVDQ': (-37.11, -56.86, 'Pinamar, Argentina'),
    'SudKYejNOCo': (-38.0, -63.0, 'Argentina (rotating cameras)'),
    'DliL9uMtPrI': (23.22, 121.31, 'Liushishi Mountain, Taiwan'),
    '5GTFLN9gZrc': (23.39, 121.37, 'Chike Mountain, Taiwan'),
}


def correct_places(data):
    for g in data['groups']:
        for k in g['kids']:
            for c in k['kids']:
                if c['k'] == 'yt' and c['id'] in OVERRIDES:
                    lat, lon, label = OVERRIDES[c['id']]
                    c.update(ll=[lat, lon], pl=label)
                    if c['id'] == 'SudKYejNOCo':
                        c['geo'] = 'approximate country; rotating cameras'


def extend(data):
    seen = {(c['k'], c['id']) for g in data['groups'] for k in g['kids'] for c in k['kids']}
    proposals = {}
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for place, found in zip(PLACES, ex.map(lambda p: cams.search(p[-1]), PLACES)):
            region, label, lat, lon, aliases, query = place
            kept = 0
            for v in found:
                text = v['title'] + ' ' + v['owner']
                if not v['live'] or ('yt', v['id']) in seen or v['id'] in proposals or cams.BAD.search(text):
                    continue
                if not re.search(aliases, text, re.I):
                    continue
                if not (cams.GOOD.search(text) or re.search(r'веб.?камер|онлайн|на живо|na żywo|ao vivo|en vivo|即時影像', text, re.I)):
                    continue
                proposals[v['id']] = (v, place)
                kept += 1
                if kept >= 5:
                    break
            print(f'{region}: {label}: {kept} candidates', flush=True)
    counts = {}
    checked = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for (vid, (v, place)), ok in zip(proposals.items(), ex.map(cams.embeddable, proposals)):
            if not ok:
                continue
            region, label, lat, lon, _, _ = place
            category = next((cat for cat, rx in cams.SORT if re.search(rx, v['title'], re.I)), 'cities')
            title = cams.clean(v['title'], v['owner'])
            c = {'k': 'yt', 'id': vid, 'n': cams.short(title), 't': title, 'by': v['owner'],
                 'll': [lat, lon], 'pl': label, 'region': region, 'geo': 'approximate place',
                 'checked': checked, 'sourceTitle': v['title'], 'source': f'https://www.youtube.com/watch?v={vid}'}
            group = next((g for g in data['groups'] if g['n'] == category), None)
            if group is None:
                group = {'n': category, 'kids': []}; data['groups'].append(group)
            kid = next((k for k in group['kids'] if k['n'] == v['owner']), None)
            if kid is None:
                kid = {'n': v['owner'], 'kids': []}; group['kids'].append(kid)
            kid['kids'].append(c)
            counts[region] = counts.get(region, 0) + 1
    correct_places(data)
    print('Added:', json.dumps(counts), flush=True)
    return counts


if __name__ == '__main__':
    path = ROOT / 'assets/ether-cams.json'
    data = json.loads(path.read_text())
    extend(data)
    path.write_text(json.dumps(data, ensure_ascii=True, separators=(',', ':')))
