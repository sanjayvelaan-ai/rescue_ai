import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, inspect
from app.services.device_location import DeviceLocation
from app.api.system import router

class DeviceLocationTests(unittest.TestCase):
    def test_fix_expires_and_cannot_be_changed_by_its_consumer(self):
        store = DeviceLocation()
        with patch('app.services.device_location.time.time', return_value=1000):
            returned = store.update(12, 77, 30, 1000)
            returned['latitude'] = 0
            self.assertEqual(store.current()['latitude'], 12)
        with patch('app.services.device_location.time.time', return_value=1121):
            self.assertIsNone(store.current())

    def test_stale_future_and_cleared_fixes(self):
        store = DeviceLocation()
        with patch('app.services.device_location.time.time', return_value=1000):
            for timestamp in (879, 1011):
                with self.assertRaises(ValueError): store.update(12,77,10,timestamp)
            store.update(12,77,10,1000)
            store.clear()
            self.assertIsNone(store.current())

    def test_api_validates_coordinates_and_location_age(self):
        app=FastAPI()
        app.include_router(router)
        client=TestClient(app)
        store=DeviceLocation()
        payload=dict(latitude=12,longitude=77,accuracy_m=50,observed_at=1000)
        with patch('app.api.system.device_location',store), patch('app.services.device_location.time.time',return_value=1000):
            self.assertEqual(client.post('/system/device-location',json=payload).status_code,200)
            for field,value in [('latitude',91),('longitude',181),('accuracy_m',-1),('observed_at',100)]:
                self.assertEqual(client.post('/system/device-location',json={**payload,field:value}).status_code,422)
            self.assertEqual(client.delete('/system/device-location').status_code,200)
            self.assertIsNone(store.current())

    def test_existing_database_migration_preserves_rows_and_is_repeatable(self):
        from app.db.init_db import migrate_db_schema
        engine=create_engine('sqlite://')
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE survivors (survivor_id VARCHAR PRIMARY KEY)'))
            conn.execute(text("INSERT INTO survivors VALUES ('existing')"))
            conn.execute(text('CREATE TABLE alerts (alert_id VARCHAR PRIMARY KEY)'))
        with patch('app.db.init_db.engine',engine):
            migrate_db_schema()
            migrate_db_schema()
        with engine.connect() as conn:
            row=conn.execute(text('SELECT * FROM survivors')).mappings().one()
            self.assertEqual(row['survivor_id'],'existing')
            self.assertEqual(row['location_source'],'SIMULATION')
            self.assertIsNone(row['location_accuracy_m'])
        engine.dispose()
