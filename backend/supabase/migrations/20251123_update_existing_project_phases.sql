-- ============================================================
-- UPDATE EXISTING PROJECT PHASES WITH CORRECT DATA
-- ============================================================
-- This migration updates existing projects that have the old
-- generic "Rough" and "Finish" phases with the correct
-- service-specific phases based on their service type
-- ============================================================

DO $$
DECLARE
  project_record RECORD;
  phase_record RECORD;
  service_id UUID;
  phase_templates RECORD;
  new_phase_order INT;
BEGIN
  -- Loop through all projects that have generic phases
  FOR project_record IN
    SELECT DISTINCT p.id, p.name, p.user_id
    FROM projects p
    INNER JOIN project_phases pp ON p.id = pp.project_id
    WHERE pp.name IN ('Rough', 'Finish', 'Preparation', 'First Coat', 'Second Coat')
  LOOP
    RAISE NOTICE 'Processing project: % (ID: %)', project_record.name, project_record.id;

    -- Try to find the service category for this project
    -- We'll look at user_services for the project owner
    SELECT us.category_id INTO service_id
    FROM user_services us
    WHERE us.user_id = project_record.user_id
    AND us.is_active = true
    LIMIT 1;

    IF service_id IS NULL THEN
      RAISE NOTICE 'No active service found for user, skipping project %', project_record.id;
      CONTINUE;
    END IF;

    RAISE NOTICE 'Found service_id: % for project %', service_id, project_record.id;

    -- Delete old generic phases for this project
    DELETE FROM project_phases
    WHERE project_id = project_record.id;

    RAISE NOTICE 'Deleted old phases for project %', project_record.id;

    -- Insert new phases from templates
    new_phase_order := 0;
    FOR phase_templates IN
      SELECT * FROM service_phase_templates
      WHERE category_id = service_id
      ORDER BY order_index ASC
    LOOP
      INSERT INTO project_phases (
        project_id,
        name,
        description,
        start_date,
        end_date,
        budget,
        status,
        tasks,
        completion_percentage,
        order_index
      ) VALUES (
        project_record.id,
        phase_templates.phase_name,
        phase_templates.description,
        NULL, -- Will be set when project starts
        NULL,
        0, -- Budget can be updated later
        'pending',
        phase_templates.tasks,
        0,
        new_phase_order
      );

      new_phase_order := new_phase_order + 1;
      RAISE NOTICE 'Inserted phase: % for project %', phase_templates.phase_name, project_record.id;
    END LOOP;

    RAISE NOTICE 'Completed updating project: %', project_record.name;
  END LOOP;

  RAISE NOTICE 'Migration complete!';
END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
