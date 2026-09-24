"""Isolated manual UI verification server: python tests/preview_app.py.

Uses a temporary database and explicit TEST records. Never use for deployment.
"""
import os
import sys
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import quote

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
temporary=tempfile.TemporaryDirectory(prefix='rescue-layout-')
os.environ.update(DATABASE_URL='sqlite:///'+str(Path(temporary.name)/'preview.db').replace('\\','/'),CAMERA_ENABLED='false',SEED_DEMO_DATA='false')
from app.main import app, lifespan
from app.db.database import SessionLocal, engine
from app.db.models import SurvivorModel

@asynccontextmanager
async def preview_lifespan(application):
    async with lifespan(application):
        now=datetime.now(timezone.utc).isoformat()
        with SessionLocal() as db:
            for i in range(24):
                name=f'TEST-{i+1:04}'
                svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#0c2842"/><rect x="240" y="50" width="160" height="240" fill="none" stroke="#22d3ee" stroke-width="3"/><text x="320" y="330" text-anchor="middle" fill="white" font-size="22">{name} — TEST SNAPSHOT</text></svg>'
                db.add(SurvivorModel(survivor_id=name,latitude=10.936423,longitude=76.955785,location_source='SIMULATION',capture_source='UI_TEST',timestamp=now,first_detected=now,last_detected=now,model_confidence=.9,detection_frame_path='data:image/svg+xml,'+quote(svg)))
            db.commit()
        yield
    engine.dispose()
    temporary.cleanup()

app.router.lifespan_context=preview_lifespan
if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8011)
