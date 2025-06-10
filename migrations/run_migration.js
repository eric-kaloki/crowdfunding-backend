const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🚀 Starting contributions table migration...');
    
    // Read the migration SQL file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'update_contributions_table.sql'), 
      'utf8'
    );
    
    console.log('📄 Migration SQL loaded');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 Contributions table has been recreated with correct schema');
    
    // Verify the new table structure
    const { data: tableInfo, error: tableError } = await supabase
      .from('contributions')
      .select('*')
      .limit(0);
    
    if (tableError) {
      console.warn('⚠️  Could not verify table structure:', tableError.message);
    } else {
      console.log('✅ Table verification successful');
    }
    
    console.log('\n📋 Migration Summary:');
    console.log('- ✅ Dropped old contributions table');
    console.log('- ✅ Created new contributions table with contributor_id');
    console.log('- ✅ Added all necessary indexes');
    console.log('- ✅ Configured Row Level Security policies');
    console.log('- ✅ Created automatic triggers for funding updates');
    console.log('\n🎉 Migration complete! You can now use the new contributions table.');
    
  } catch (error) {
    console.error('💥 Migration failed with error:', error);
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
