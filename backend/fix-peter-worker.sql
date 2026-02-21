-- Fix Peter's worker record to enable invitation
UPDATE workers 
SET status = 'pending', user_id = null 
WHERE email = 'peter@gmail.com';

-- Verify the update
SELECT id, full_name, email, status, user_id 
FROM workers 
WHERE email = 'peter@gmail.com';
