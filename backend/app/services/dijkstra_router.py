import math
import heapq
from typing import List, Dict, Tuple, Optional

# Operational Map Boundaries (Disaster Response Sector Bravo-4)
LAT_MIN = 10.9300
LAT_MAX = 10.9420
LNG_MIN = 76.9480
LNG_MAX = 76.9630

GRID_ROWS = 35
GRID_COLS = 35

HAZARD_PENALTY_MAP = {
    "FIRE": 120.0,
    "STRUCTURAL": 75.0,
    "GAS": 90.0,
    "FLOOD": 45.0,
    "SMOKE": 30.0,
    "DEBRIS": 35.0
}

def coords_to_grid(lat: float, lng: float, bounds=None) -> Tuple[int, int]:
    """Converts GPS latitude/longitude to grid (row, col)."""
    lat_min, lat_max, lng_min, lng_max = bounds or (LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX)
    r = round((lat - lat_min) / (lat_max - lat_min) * (GRID_ROWS - 1))
    c = round((lng - lng_min) / (lng_max - lng_min) * (GRID_COLS - 1))
    r = max(0, min(GRID_ROWS - 1, r))
    c = max(0, min(GRID_COLS - 1, c))
    return r, c

def grid_to_coords(r: int, c: int, bounds=None) -> Tuple[float, float]:
    """Converts grid (row, col) to GPS latitude/longitude."""
    lat_min, lat_max, lng_min, lng_max = bounds or (LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX)
    lat = lat_min + (r / (GRID_ROWS - 1)) * (lat_max - lat_min)
    lng = (lng_min + (c / (GRID_COLS - 1)) * (lng_max - lng_min) + 180) % 360 - 180
    return round(lat, 6), round(lng, 6)

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculates approximate distance in meters between two GPS coordinates."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    a = max(0.0, min(1.0, a))
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def build_hazard_cost_matrix(hazards: List[Dict], bounds=None) -> List[List[float]]:
    """
    Constructs a 2D cost penalty grid based on active hazard radiuses and severity types.
    """
    grid_costs = [[1.0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

    for h in hazards:
        h_lat = h.get("latitude")
        h_lng = h.get("longitude")
        h_radius = h.get("radius_m", 50.0)
        h_type = h.get("type", "FIRE")
        penalty = HAZARD_PENALTY_MAP.get(h_type.upper(), 50.0)

        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                n_lat, n_lng = grid_to_coords(r, c, bounds)
                dist = haversine_distance(h_lat, h_lng, n_lat, n_lng)
                if dist <= h_radius:
                    # Exponential cost penalty inside hazard danger radius
                    factor = (1.0 - (dist / (h_radius + 1e-5))) ** 2
                    grid_costs[r][c] += penalty * (1.0 + factor * 3.0)

    return grid_costs

def compute_dijkstra_path(
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    hazards: List[Dict]
) -> Dict:
    """
    Computes shortest hazard-avoiding route between start and destination using Dijkstra's Algorithm.
    Returns waypoints [[lat, lng], ...], total distance in meters, path cost, and estimated time.
    """
    for lat, lng in ((start_lat, start_lng), (end_lat, end_lng)):
        if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError('Route coordinates must be valid latitude/longitude.')
    # Per-request bounds support any capture position without shared mutable state.
    # Unwrap longitude along the shorter arc for routes crossing the date line.
    end_unwrapped = start_lng + (end_lng - start_lng + 180) % 360 - 180
    lat_padding = max(.001, abs(end_lat-start_lat)*.25)
    lng_padding = max(.001/max(.01, math.cos(math.radians((start_lat+end_lat)/2))), abs(end_unwrapped-start_lng)*.25)
    bounds = (max(-90,min(start_lat,end_lat)-lat_padding), min(90,max(start_lat,end_lat)+lat_padding),
              min(start_lng,end_unwrapped)-lng_padding, max(start_lng,end_unwrapped)+lng_padding)
    start_r, start_c = coords_to_grid(start_lat, start_lng, bounds)
    end_r, end_c = coords_to_grid(end_lat, end_unwrapped, bounds)
    grid_costs = build_hazard_cost_matrix(hazards, bounds)

    # 8-directional movement offsets (row_delta, col_delta, base_cost_multiplier)
    neighbors_delta = [
        (-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
        (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)
    ]

    distances = [[float('inf') for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
    predecessors = [[None for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

    distances[start_r][start_c] = 0.0

    # Priority Queue storing (current_cost, row, col)
    pq = [(0.0, start_r, start_c)]

    while pq:
        curr_cost, r, c = heapq.heappop(pq)

        if curr_cost > distances[r][c]:
            continue

        if (r, c) == (end_r, end_c):
            break

        for dr, dc, _ in neighbors_delta:
            nr, nc = r + dr, c + dc
            if 0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS:
                distance = haversine_distance(*grid_to_coords(r, c, bounds), *grid_to_coords(nr, nc, bounds))
                edge_weight = distance * (grid_costs[nr][nc] + grid_costs[r][c]) / 2.0
                new_cost = curr_cost + edge_weight

                if new_cost < distances[nr][nc]:
                    distances[nr][nc] = new_cost
                    predecessors[nr][nc] = (r, c)
                    heapq.heappush(pq, (new_cost, nr, nc))

    # Reconstruct Path Waypoints
    path_grid = []
    curr = (end_r, end_c)
    if predecessors[end_r][end_c] is not None or (end_r, end_c) == (start_r, start_c):
        while curr is not None:
            path_grid.append(curr)
            curr = predecessors[curr[0]][curr[1]]
        path_grid.reverse()
    else:
        # Fallback straight line if grid disconnected
        path_grid = [(start_r, start_c), (end_r, end_c)]

    # Convert Grid Nodes to GPS Coordinates
    waypoints = [[start_lat, start_lng]]
    total_dist_meters = 0.0

    for i in range(len(path_grid)):
        r, c = path_grid[i]
        lat, lng = grid_to_coords(r, c, bounds)
        if i == len(path_grid) - 1:
            lat, lng = end_lat, end_lng  # Snap exactly to destination
        
        last_lat, last_lng = waypoints[-1]
        step_dist = haversine_distance(last_lat, last_lng, lat, lng)
        total_dist_meters += step_dist
        waypoints.append([lat, lng])

    # Rescue vehicle average speed: ~12.5 m/s (45 km/h)
    estimated_speed_m_s = 12.5
    eta_seconds = max(15, int(total_dist_meters / estimated_speed_m_s))

    return {
        "start": [start_lat, start_lng],
        "destination": [end_lat, end_lng],
        "waypoints": waypoints,
        "total_distance_m": round(total_dist_meters, 2),
        "path_cost": round(distances[end_r][end_c], 2),
        "eta_seconds": eta_seconds,
        "hazard_penalty_applied": any(grid_costs[r][c] > 1.5 for r,c in path_grid),
        "routing_mode": "SIMULATED_TERRAIN_GRID"
    }

def find_nearest_team_dijkstra(
    survivor_lat: float,
    survivor_lng: float,
    teams: List[Dict],
    hazards: List[Dict]
) -> Dict:
    """
    Evaluates all active rescue teams using Dijkstra hazard routing to identify the optimal nearest team.
    """
    ranked_teams = []

    for team in teams:
        status = team.get("status", "AVAILABLE")
        # Consider AVAILABLE or STANDBY teams
        is_available = status in ["AVAILABLE", "STANDBY"]
        if not is_available:
            continue

        t_lat = team.get("latitude")
        t_lng = team.get("longitude")

        route_info = compute_dijkstra_path(t_lat, t_lng, survivor_lat, survivor_lng, hazards)

        # Base score combining path cost, ETA, and current availability penalty
        availability_penalty = 0.0 if is_available else 500.0
        score = route_info["path_cost"] + (route_info["eta_seconds"] * 2.0) + availability_penalty

        ranked_teams.append({
            "team_id": team.get("team_id"),
            "name": team.get("name"),
            "vehicle": team.get("vehicle"),
            "status": status,
            "capabilities": team.get("capabilities"),
            "current_location": [t_lat, t_lng],
            "distance_m": route_info["total_distance_m"],
            "eta_seconds": route_info["eta_seconds"],
            "dijkstra_score": round(score, 2),
            "hazard_penalty_applied": route_info['hazard_penalty_applied'],
            "routing_mode": route_info['routing_mode'],
            "waypoints": route_info["waypoints"],
            "is_recommended": False
        })

    # Sort teams by Dijkstra score (lowest cost = best option)
    ranked_teams.sort(key=lambda x: x["dijkstra_score"])

    if ranked_teams:
        ranked_teams[0]["is_recommended"] = True

    return {
        "survivor_location": [survivor_lat, survivor_lng],
        "recommended_team": ranked_teams[0] if ranked_teams else None,
        "all_teams_evaluated": ranked_teams
    }
