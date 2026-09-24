import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db.database import Base
from app.db.models import SurvivorModel, AlertModel
from app.vision.live_pipeline import LiveDetectionPipeline


class LivePipelineTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.temp = tempfile.TemporaryDirectory()
        self.files = patch('app.vision.live_pipeline.DETECTIONS_DIR', Path(self.temp.name))
        self.files.start()
        self.events = []
        def published(event):
            with self.sessions() as db:
                self.assertIsNotNone(db.get(AlertModel, event['alert']['alert_id']))
            self.events.append(event)
        self.pipeline = LiveDetectionPipeline(self.sessions, published)
        self.frame = np.zeros((240, 320, 3), dtype=np.uint8)
        self.person = dict(x1=30, y1=20, x2=100, y2=200, confidence=.9, class_id=0, source='RGB')

    def tearDown(self):
        self.files.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def feed(self, first=1, count=3, detections=None):
        for frame_id in range(first, first+count):
            result = self.pipeline.process(self.frame, detections if detections is not None else [self.person], frame_id)
        return result

    def test_empty_frames_create_no_records(self):
        self.feed(detections=[])
        with self.sessions() as db:
            self.assertEqual(db.query(SurvivorModel).count(), 0)

    def test_distinct_frames_required_and_no_duplicate_alerts(self):
        for _ in range(6):
            self.feed(count=1)
        self.assertEqual(len(self.events), 0)
        self.feed(first=2, count=8)
        self.assertEqual(len(self.events), 1)
        event = self.events[0]
        self.assertFalse(event['survivor']['thermal_confirmed'])
        self.assertTrue((Path(self.temp.name)/Path(event['alert']['thermal_snapshot_path']).name).is_file())
        self.assertTrue((Path(self.temp.name)/Path(event['alert']['frame_snapshot_path']).name).is_file())

    def test_two_people_are_independent_tracks(self):
        second = dict(self.person, x1=200, x2=280)
        tracks = self.feed(detections=[self.person, second])
        self.assertEqual(len({t['id'] for t in tracks}), 2)
        self.assertEqual(len(self.events), 2)

    def test_missing_frame_resets_confirmation_streak(self):
        self.feed(count=2)
        self.feed(first=3, count=1, detections=[])
        self.feed(first=4, count=2)
        self.assertEqual(len(self.events), 0)
        self.feed(first=6, count=1)
        self.assertEqual(len(self.events), 1)

    def test_restart_never_reuses_an_existing_survivor_id(self):
        first = self.feed()[0]['id']
        self.pipeline.reset_history()
        second = self.feed()[0]['id']
        self.assertNotEqual(first, second)
        with self.sessions() as db:
            self.assertEqual(db.query(SurvivorModel).count(), 2)

    def test_rescue_status_is_not_reversed(self):
        sid = self.feed()[0]['id']
        with self.sessions() as db:
            db.get(SurvivorModel, sid).status = 'RESCUED'
            db.commit()
        self.pipeline.tracks[1]['last_update'] = 0
        self.feed(first=4, count=1)
        with self.sessions() as db:
            self.assertEqual(db.get(SurvivorModel, sid).status, 'RESCUED')
        self.assertEqual(len(self.events), 1)

    def test_failed_snapshot_never_publishes_alert(self):
        self.feed(count=2)
        with patch('app.vision.live_pipeline.cv2.imwrite', return_value=False):
            with self.assertRaises(OSError):
                self.feed(first=3, count=1)
        with self.sessions() as db:
            self.assertEqual(db.query(AlertModel).count(), 0)
        self.assertEqual(self.events, [])

    def test_fast_motion_without_box_overlap_keeps_id(self):
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10):
            first = self.feed(count=1)[0]['id']
        moved = dict(self.person, x1=110, x2=180)
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10.2):
            second = self.feed(first=2, count=1, detections=[moved])[0]['id']
        self.assertEqual(first, second)

    def test_confirmed_track_survives_short_occlusion_without_new_alert(self):
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10):
            first = self.feed()[0]['id']
        with patch('app.vision.live_pipeline.time.monotonic', return_value=11):
            self.feed(first=4, count=1, detections=[])
        with patch('app.vision.live_pipeline.time.monotonic', return_value=12):
            returned = self.feed(first=5, count=1)[0]
        self.assertEqual(returned['id'], first)
        self.assertEqual(returned['state'], 'LIKELY_SURVIVOR')
        self.assertEqual(len(self.events), 1)

    def test_expired_track_does_not_claim_the_next_person(self):
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10):
            first = self.feed()[0]['id']
        with patch('app.vision.live_pipeline.time.monotonic', return_value=20):
            returned = self.feed(first=4)[0]
        self.assertNotEqual(first, returned['id'])
        self.assertEqual(len(self.events), 2)

    def test_two_colored_targets_keep_ids_when_order_reverses(self):
        red = dict(self.person, x1=25, x2=85)
        blue = dict(self.person, x1=180, x2=240)
        self.frame[20:200,25:85] = (0,0,255)
        self.frame[20:200,180:240] = (255,0,0)
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10):
            initial = self.feed(detections=[red,blue])
        self.frame[:] = 0
        red2 = dict(red, x1=105, x2=165)
        blue2 = dict(blue, x1=40, x2=100)
        self.frame[20:200,105:165] = (0,0,255)
        self.frame[20:200,40:100] = (255,0,0)
        with patch('app.vision.live_pipeline.time.monotonic', return_value=10.4):
            result = self.feed(first=4, count=1, detections=[blue2,red2])
        self.assertEqual(result[0]['id'], initial[1]['id'])
        self.assertEqual(result[1]['id'], initial[0]['id'])
        self.assertEqual(len(self.events), 2)

    def test_preview_failure_does_not_publish_a_partial_alert(self):
        self.feed(count=2)
        from app.vision.live_pipeline import save_snapshot
        def failing_preview(frame, name):
            if name.endswith('_preview'):
                raise OSError('preview write failed')
            return save_snapshot(frame, name)
        with patch('app.vision.live_pipeline.save_snapshot', side_effect=failing_preview):
            with self.assertRaises(OSError):
                self.feed(first=3,count=1)
        self.assertEqual(self.events, [])
        with self.sessions() as db:
            self.assertEqual(db.query(AlertModel).count(), 0)

    def test_repair_old_preview_is_idempotent_and_not_thermal_evidence(self):
        from app.vision.preview_repair import repair_missing_previews
        sid = self.feed()[0]['id']
        with self.sessions() as db:
            db.get(SurvivorModel, sid).thermal_frame_path = None
            db.query(AlertModel).first().thermal_snapshot_path = None
            db.commit()
        with patch('app.vision.preview_repair.DETECTIONS_DIR', Path(self.temp.name)):
            self.assertEqual(repair_missing_previews(self.sessions), 1)
            self.assertEqual(repair_missing_previews(self.sessions), 0)
        with self.sessions() as db:
            survivor = db.get(SurvivorModel, sid)
            alert = db.query(AlertModel).first()
            self.assertFalse(survivor.thermal_confirmed)
            self.assertEqual(survivor.thermal_frame_path, alert.thermal_snapshot_path)
            self.assertTrue((Path(self.temp.name)/Path(alert.thermal_snapshot_path).name).is_file())


    def test_device_capture_position_is_saved_in_survivor_and_alert(self):
        fix=dict(latitude=12.9,longitude=77.6,accuracy_m=35)
        with patch('app.vision.live_pipeline.device_location.current',return_value=fix):
            sid=self.feed()[0]['id']
        with self.sessions() as db:
            record=db.get(SurvivorModel,sid)
            self.assertEqual(record.location_source,'DEVICE_LOCATION')
            self.assertEqual(record.latitude,12.9)
            self.assertEqual(record.location_accuracy_m,35)
            self.assertIn('Device capture location',db.query(AlertModel).first().lat_lng_tag)

    def test_visible_track_upgrades_once_and_history_does_not_follow_device(self):
        with patch('app.vision.live_pipeline.device_location.current',return_value=None):
            sid=self.feed()[0]['id']
        self.pipeline.tracks[1]['last_update']=0
        with patch('app.vision.live_pipeline.device_location.current',return_value=dict(latitude=12,longitude=77,accuracy_m=20)):
            self.feed(first=4,count=1)
        self.pipeline.tracks[1]['last_update']=0
        with patch('app.vision.live_pipeline.device_location.current',return_value=dict(latitude=13,longitude=78,accuracy_m=30)):
            self.feed(first=5,count=1)
        with self.sessions() as db:
            record=db.get(SurvivorModel,sid)
            self.assertEqual(record.latitude,12)
            self.assertEqual(record.longitude,77)
            self.assertEqual(record.location_accuracy_m,20)
            self.assertEqual(db.query(AlertModel).count(),1)

    def test_no_device_fix_is_explicitly_simulation(self):
        with patch('app.vision.live_pipeline.device_location.current',return_value=None):
            sid=self.feed()[0]['id']
        with self.sessions() as db:
            record=db.get(SurvivorModel,sid)
            self.assertEqual(record.location_source,'SIMULATION')
            self.assertIsNone(record.location_accuracy_m)


if __name__ == '__main__':
    unittest.main()
