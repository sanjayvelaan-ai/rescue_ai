import base64
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.api.browser_camera import BrowserSessions, BrowserFrame, CaptureLocation, router
from app.vision.live_pipeline import LiveDetectionPipeline
from app.db.database import Base
from app.db.models import SurvivorModel, AlertModel, RescueTeamModel
from app.api.rescue_teams import align_teams_to_capture

class BrowserCameraTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',poolclass=StaticPool,connect_args={'check_same_thread':False})
        Base.metadata.create_all(self.engine)
        self.db=sessionmaker(bind=self.engine)
        self.temp=tempfile.TemporaryDirectory()
        self.files=patch('app.vision.live_pipeline.DETECTIONS_DIR',Path(self.temp.name));self.files.start()
        self.factory=patch('app.api.browser_camera.LiveDetectionPipeline',side_effect=lambda **kw:LiveDetectionPipeline(self.db,lambda e:None,**kw));self.factory.start()
        self.detector=patch('app.api.browser_camera.detector');self.model=self.detector.start();self.model.model_online=True;self.model.last_error=None
        self.model.infer_frame.return_value=[dict(x1=30,y1=20,x2=100,y2=180,confidence=.85,class_id=0)]
        self.service=BrowserSessions()
        _,jpg=cv2.imencode('.jpg',np.zeros((240,320,3),np.uint8))
        self.jpeg=base64.b64encode(jpg).decode()
    def tearDown(self):
        self.detector.stop();self.factory.stop();self.files.stop();self.engine.dispose();self.temp.cleanup()
    def feed(self,sid,location=None):
        for frame in range(1,4):
            result=self.service.process(sid,BrowserFrame(frame_id=frame,jpeg=self.jpeg,location=location))
        return result
    def test_devices_keep_locations_tracks_and_snapshots_separate(self):
        a=self.service.create();b=self.service.create()
        first=self.feed(a['session_id'],CaptureLocation(latitude=12,longitude=77,accuracy_m=25,observed_at=time.time()))
        second=self.feed(b['session_id'],CaptureLocation(latitude=13,longitude=78,accuracy_m=15,observed_at=time.time()))
        self.assertNotEqual(first['tracks'][0]['id'],second['tracks'][0]['id'])
        with self.db() as db:
            rows=db.query(SurvivorModel).order_by(SurvivorModel.latitude).all()
            self.assertEqual([r.latitude for r in rows],[12,13])
            self.assertEqual(rows[0].capture_source,a['source_id'])
            self.assertEqual(db.query(AlertModel).count(),2)
            for row in rows:self.assertTrue((Path(self.temp.name)/Path(row.detection_frame_path).name).exists())
    def test_absent_or_expired_location_never_inherits_global_fix(self):
        with patch('app.services.device_location.device_location.current',return_value=dict(latitude=70,longitude=50,accuracy_m=5)):
            for location in [None,CaptureLocation(latitude=12,longitude=77,accuracy_m=10,observed_at=time.time()-200)]:
                self.feed(self.service.create()['session_id'],location)
        with self.db() as db:
            self.assertTrue(all(r.location_source=='UNLOCATED' for r in db.query(SurvivorModel)))
    def test_manual_pin_is_labeled_and_has_no_fabricated_accuracy(self):
        self.feed(self.service.create()['session_id'],CaptureLocation(latitude=12,longitude=77,source='USER_PIN',observed_at=time.time()))
        with self.db() as db:
            row=db.query(SurvivorModel).one();self.assertEqual(row.location_source,'USER_PIN');self.assertIsNone(row.location_accuracy_m)
    def test_repeated_frames_and_stopped_sessions_are_rejected(self):
        sid=self.service.create()['session_id'];payload=BrowserFrame(frame_id=1,jpeg=self.jpeg)
        self.service.process(sid,payload)
        with self.assertRaises(HTTPException) as exc:self.service.process(sid,payload)
        self.assertEqual(exc.exception.status_code,409)
        self.service.remove(sid)
        with self.assertRaises(HTTPException) as exc:self.service.process(sid,payload)
        self.assertEqual(exc.exception.status_code,410)
    def test_bad_and_oversize_images_never_reach_yolo(self):
        sid=self.service.create()['session_id']
        _,large=cv2.imencode('.jpg',np.zeros((1500,1500,3),np.uint8))
        for jpeg in ['not base64',base64.b64encode(large).decode()]:
            with self.assertRaises(HTTPException) as exc:self.service.process(sid,BrowserFrame(frame_id=1,jpeg=jpeg))
            self.assertEqual(exc.exception.status_code,422)
        self.model.infer_frame.assert_not_called()
    def test_dual_views_share_frame_tracks_and_resolution(self):
        sid=self.service.create()['session_id']
        result=self.service.process(sid,BrowserFrame(frame_id=1,jpeg=self.jpeg))
        rgb=cv2.imdecode(np.frombuffer(base64.b64decode(result['preview'].split(',')[1]),np.uint8),cv2.IMREAD_COLOR)
        thermal=cv2.imdecode(np.frombuffer(base64.b64decode(result['thermal_preview'].split(',')[1]),np.uint8),cv2.IMREAD_COLOR)
        self.assertEqual(rgb.shape,thermal.shape)
        self.assertEqual(result['frame_id'],1)
        self.assertEqual(result['inference_size'],416)
        self.assertEqual(self.model.infer_frame.call_args.kwargs['imgsz'],416)
        self.assertGreater(np.abs(rgb.astype(float)-thermal.astype(float)).mean(),1)
        first_track=result['tracks'][0]['id']
        self.assertEqual(self.model.infer_frame.call_count,1)
        result=self.service.process(sid,BrowserFrame(frame_id=2,jpeg=self.jpeg,inference_size=640))
        self.assertEqual(result['inference_size'],640)
        self.assertEqual(self.model.infer_frame.call_args.kwargs['imgsz'],640)
        self.assertEqual(len(result['tracks']),1)
        self.assertEqual(result['tracks'][0]['id'],first_track)
        self.assertEqual(self.model.infer_frame.call_count,2)
    def test_busy_server_backpressure_and_body_limit(self):
        sid=self.service.create()['session_id']
        with self.service.capacity:
            with self.assertRaises(HTTPException) as exc:self.service.process(sid,BrowserFrame(frame_id=1,jpeg=self.jpeg))
        self.assertEqual(exc.exception.status_code,429)
        app=FastAPI();app.include_router(router)
        with TestClient(app) as client:
            self.assertEqual(client.post('/camera/sessions/x/frames',content=b'x'*2_000_001).status_code,413)
            self.assertEqual(client.post('/camera/sessions/x/frames',json={'jpeg':'bad'}).status_code,422)
    def test_available_teams_align_but_assigned_teams_do_not_move(self):
        with self.db() as db:
            db.add_all([RescueTeamModel(team_id='A',name='A',vehicle='Test',capabilities='Test',latitude=0,longitude=0,status='AVAILABLE'),RescueTeamModel(team_id='B',name='B',vehicle='Test',capabilities='Test',latitude=1,longitude=1,status='EN_ROUTE')]);db.commit()
            align_teams_to_capture(CaptureLocation(latitude=12,longitude=77,accuracy_m=20,observed_at=time.time()),db)
            a=db.get(RescueTeamModel,'A');b=db.get(RescueTeamModel,'B')
            self.assertLess(abs(a.latitude-12),.01);self.assertLess(abs(a.longitude-77),.01)
            self.assertEqual((b.latitude,b.longitude),(1,1))
            align_teams_to_capture(CaptureLocation(latitude=13,longitude=78,accuracy_m=20,observed_at=time.time()),db)
            self.assertLess(abs(a.latitude-13),.01);self.assertLess(abs(a.longitude-78),.01)
            self.assertEqual((b.latitude,b.longitude),(1,1))
            with self.assertRaises(HTTPException) as exc:
                align_teams_to_capture(CaptureLocation(latitude=14,longitude=79,accuracy_m=20,observed_at=time.time()-200),db)
            self.assertEqual(exc.exception.status_code,422)
            self.assertLess(abs(a.latitude-13),.01)
