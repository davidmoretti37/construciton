/**
 * Feature Migration System
 * Automatically updates existing users when new features are added
 */

import { supabase } from '../lib/supabase';

// Migration version - increment this when adding new migrations
export const CURRENT_MIGRATION_VERSION = 1;

/**
 * All feature migrations in order
 * Each migration has:
 * - version: unique version number
 * - name: descriptive name
 * - description: what this migration does
 * - run: async function that performs the migration
 */
const migrations = [
  {
    version: 1,
    name: 'add_phases_template',
    description: 'Add phases_template field to existing owner profiles',
    run: async (userId, userEmail) => {
      try {

        // Get current profile
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (fetchError) {
          console.error('❌ [Migration v1] Error fetching profile:', fetchError);
          return false;
        }

        // Skip if already has phases_template
        if (profile.phases_template) {
          return true;
        }

        // Add default phases template for owner accounts
        if (profile.role === 'owner') {
          const defaultTemplate = {
            phases: [
              {
                name: 'Rough',
                typical_days: 14,
                tasks: [
                  'Demo and prep',
                  'Framing',
                  'Rough electrical',
                  'Rough plumbing',
                  'HVAC rough-in',
                  'Inspections'
                ],
                typical_budget_percentage: 40
              },
              {
                name: 'Finish',
                typical_days: 10,
                tasks: [
                  'Drywall',
                  'Paint',
                  'Tile work',
                  'Finish electrical',
                  'Finish plumbing',
                  'Fixtures and hardware',
                  'Final walkthrough'
                ],
                typical_budget_percentage: 60
              }
            ]
          };

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ phases_template: defaultTemplate })
            .eq('id', userId);

          if (updateError) {
            console.error('❌ [Migration v1] Error updating profile:', updateError);
            return false;
          }

          return true;
        }

        // Non-owner accounts don't need phases_template
        return true;
      } catch (error) {
        console.error('❌ [Migration v1] Unexpected error:', error);
        return false;
      }
    }
  }

  // Add future migrations here:
  // {
  //   version: 2,
  //   name: 'add_new_feature',
  //   description: 'Description of what this does',
  //   run: async (userId, userEmail) => {
  //     // Migration logic here
  //     return true; // return true if successful
  //   }
  // }
];

/**
 * Get the current migration version for a user
 */
async function getUserMigrationVersion(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('migration_version')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching migration version:', error);
      return 0;
    }

    return data?.migration_version || 0;
  } catch (error) {
    console.error('Error getting migration version:', error);
    return 0;
  }
}

/**
 * Update the user's migration version
 */
async function setUserMigrationVersion(userId, version) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ migration_version: version })
      .eq('id', userId);

    if (error) {
      console.error('Error updating migration version:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error setting migration version:', error);
    return false;
  }
}

/**
 * Run all pending migrations for a user
 * This should be called when the app starts
 */
export async function runMigrations(userId, userEmail) {
  try {

    // Get current migration version
    const currentVersion = await getUserMigrationVersion(userId);

    // Find migrations that need to run
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      return true;
    }


    // Run each pending migration in order
    for (const migration of pendingMigrations) {

      const success = await migration.run(userId, userEmail);

      if (!success) {
        console.error(`❌ Migration v${migration.version} failed - stopping migrations`);
        return false;
      }

      // Update migration version after successful migration
      await setUserMigrationVersion(userId, migration.version);
    }

    return true;
  } catch (error) {
    console.error('❌ Error running migrations:', error);
    return false;
  }
}

/**
 * Force run a specific migration (useful for testing)
 */
export async function runSpecificMigration(userId, userEmail, version) {
  const migration = migrations.find(m => m.version === version);

  if (!migration) {
    console.error(`Migration v${version} not found`);
    return false;
  }

  return await migration.run(userId, userEmail);
}

/**
 * Reset user's migration version (useful for testing)
 */
export async function resetMigrationVersion(userId) {
  return await setUserMigrationVersion(userId, 0);
}
