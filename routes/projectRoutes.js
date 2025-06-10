const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Get all public projects/campaigns
router.get('/', async (req, res) => {
  try {
    const { data: projects, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(projects || []);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Get project by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: project, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        profiles!campaigns_creator_id_fkey (
          id,
          name,
          role
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Error fetching project details' });
  }
});

module.exports = router;
