from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.db.models import SurvivorModel
from app.schemas.types import SurvivorSchema

router = APIRouter()

@router.get("/survivors", response_model=List[SurvivorSchema])
def get_survivors(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(SurvivorModel)
    if status:
        query = query.filter(SurvivorModel.status == status)
    return query.order_by(SurvivorModel.timestamp.desc()).all()

@router.get("/survivors/{survivor_id}", response_model=SurvivorSchema)
def get_survivor_by_id(survivor_id: str, db: Session = Depends(get_db)):
    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    return survivor

@router.post("/survivors/{survivor_id}/status")
def update_survivor_status(survivor_id: str, status: str, db: Session = Depends(get_db)):
    if status.upper() not in {'DETECTED', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'RESCUED', 'RESOLVED', 'LOST_SIGNAL'}:
        raise HTTPException(422, 'Invalid survivor status')
    survivor = db.query(SurvivorModel).filter(SurvivorModel.survivor_id == survivor_id).first()
    if not survivor:
        raise HTTPException(status_code=404, detail=f"Survivor {survivor_id} not found")
    survivor.status = status.upper()
    db.commit()
    return {"message": f"Survivor {survivor_id} status updated to {status.upper()}"}
