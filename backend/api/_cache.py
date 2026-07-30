"""Kısa ömürlü, süreç içi sonuç önbelleği.

Yahoo Finance paylaşımlı bulut IP'lerini hız sınırına alıyor
(YFRateLimitError). Demo sırasında aynı sembole saniyeler içinde birden fazla
kez gidilmesi sınıra takılma olasılığını artırıyor; bu önbellek aynı çağrıyı
TTL boyunca tek bir dış istekle karşılıyor.

Bilinçli olarak basit tutuldu: tek süreçte çalışan tek işçi (Render free planı
WEB_CONCURRENCY=1 veriyor) için yeterli, harici bir bağımlılık gerektirmiyor.
Redis benzeri paylaşımlı bir önbellek gerekirse ayrıca ele alınmalı.
"""
import functools
import logging
import threading
import time

logger = logging.getLogger(__name__)

# Sınırsız büyümeyi engellemek için üst sınır; aşılırsa en eski kayıt düşer.
_MAX_ENTRIES = 256


def ttl_cache(seconds: float):
    """Fonksiyon sonucunu argümanlarına göre `seconds` boyunca saklar.

    Yalnızca başarılı sonuçlar saklanıyor: istisnalar önbelleğe alınmıyor, yani
    geçici bir hata sonraki isteği de zehirlemiyor.
    """

    def decorator(func):
        store: dict[tuple, tuple[float, object]] = {}
        lock = threading.Lock()

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time.monotonic()

            with lock:
                hit = store.get(key)
                if hit is not None and now - hit[0] < seconds:
                    logger.debug("önbellek isabeti: %s%s", func.__name__, args)
                    return hit[1]

            result = func(*args, **kwargs)

            with lock:
                if len(store) >= _MAX_ENTRIES:
                    oldest = min(store, key=lambda k: store[k][0])
                    del store[oldest]
                store[key] = (now, result)

            return result

        wrapper.cache_clear = lambda: store.clear()
        return wrapper

    return decorator
