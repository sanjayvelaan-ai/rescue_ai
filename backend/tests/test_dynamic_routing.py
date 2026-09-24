import unittest
from app.services.dijkstra_router import compute_dijkstra_path, find_nearest_team_dijkstra, haversine_distance


class DynamicRoutingTests(unittest.TestCase):
    def test_route_stays_near_actual_position_outside_demo_sector(self):
        start, end = (51.5, -.12), (51.503, -.116)
        route = compute_dijkstra_path(*start, *end, [])
        self.assertEqual(route['waypoints'][0], list(start))
        self.assertEqual(route['waypoints'][-1], list(end))
        self.assertTrue(all(51.49 < lat < 51.51 and -.13 < lng < -.10 for lat,lng in route['waypoints']))
        self.assertLess(route['total_distance_m'], haversine_distance(*start, *end)*1.5)

    def test_date_line_route_uses_short_arc(self):
        route = compute_dijkstra_path(10, 179.999, 10, -179.999, [])
        self.assertLess(route['total_distance_m'], 350)
        self.assertTrue(all(abs(lng)>179.99 for _,lng in route['waypoints']))

    def test_available_team_only_can_be_recommended(self):
        teams = [dict(team_id='busy',latitude=51.501,longitude=-.12,status='EN_ROUTE'),
                 dict(team_id='ready',latitude=51.502,longitude=-.12,status='AVAILABLE')]
        result=find_nearest_team_dijkstra(51.501,-.12,teams,[])
        self.assertEqual(result['recommended_team']['team_id'],'ready')
        self.assertIsNone(find_nearest_team_dijkstra(51.501,-.12,teams[:1],[])['recommended_team'])

    def test_hazard_detour_uses_current_location_grid(self):
        start,end=(51.5,-.12),(51.505,-.12)
        hazard=dict(latitude=51.5025,longitude=-.12,radius_m=100,type='FIRE')
        route=compute_dijkstra_path(*start,*end,[hazard])
        self.assertTrue(all(haversine_distance(lat,lng,hazard['latitude'],hazard['longitude'])>95 for lat,lng in route['waypoints']))
