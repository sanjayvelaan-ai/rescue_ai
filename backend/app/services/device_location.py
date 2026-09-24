"""Latest browser-provided capture-device location; never inferred from an IP."""
import threading
import time


class DeviceLocation:
    def __init__(self):
        self.lock = threading.Lock()
        self.fix = None

    def update(self, latitude, longitude, accuracy_m, observed_at, source="DEVICE_LOCATION"):
        now = time.time()
        if not now-(600 if source == 'USER_PIN' else 120) <= observed_at <= now+10:
            raise ValueError('Location fix is stale. Request a fresh device location.')
        with self.lock:
            self.fix = dict(latitude=latitude, longitude=longitude, accuracy_m=accuracy_m,
                            observed_at=observed_at, source=source)
        return self.current()

    def current(self):
        with self.lock:
            if self.fix and time.time()-self.fix['observed_at'] <= (600 if self.fix['source'] == 'USER_PIN' else 120):
                return dict(self.fix)
        return None

    def clear(self):
        with self.lock:
            self.fix = None


device_location = DeviceLocation()
