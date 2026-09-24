from fastapi import APIRouter
from app.simulation.engine import simulation_engine

router = APIRouter()

@router.post("/simulation/start")
def start_simulation():
    simulation_engine.start()
    return {"status": "started", "step": simulation_engine.current_step}

@router.post("/simulation/pause")
def pause_simulation():
    simulation_engine.pause()
    return {"status": "paused", "step": simulation_engine.current_step}

@router.post("/simulation/reset")
def reset_simulation():
    simulation_engine.reset()
    return {"status": "reset", "step": 0}

@router.post("/simulation/next-event")
async def next_simulation_event():
    await simulation_engine.next_event()
    return {"status": "advanced", "step": simulation_engine.current_step}

@router.post("/simulation/fast-forward")
def fast_forward_simulation():
    simulation_engine.fast_forward()
    return {"status": "fast_forwarded", "delay": simulation_engine.step_delay}
