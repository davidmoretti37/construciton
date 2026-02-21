-- Check Peter's most recent clock-in record
SELECT 
  id, 
  worker_id,
  project_id,
  clock_in,
  clock_out,
  location_lat,
  location_lng,
  created_at
FROM time_tracking
WHERE worker_id = (SELECT id FROM workers WHERE email = 'peter@gmail.com')
ORDER BY clock_in DESC
LIMIT 1;
