const express = require('express');
const router = express.Router();

// M-Pesa reversal callback
router.post('/callback/reversal', async (req, res) => {
  try {
    console.log('📞 M-Pesa reversal callback received:', JSON.stringify(req.body, null, 2));

    const mpesa = require('../config/mpesa');
    const result = await mpesa.handleReversalCallback(req.body);

    if (result.success) {
      console.log('✅ Reversal callback processed successfully');
      res.status(200).json({ message: 'Reversal callback processed successfully' });
    } else {
      console.error('❌ Failed to process reversal callback:', result.message);
      res.status(400).json({ error: result.message });
    }

  } catch (error) {
    console.error('❌ Reversal callback error:', error);
    res.status(500).json({ error: 'Failed to process reversal callback' });
  }
});

// M-Pesa reversal timeout callback
router.post('/timeout/reversal', async (req, res) => {
  try {
    console.log('⏰ M-Pesa reversal timeout received:', JSON.stringify(req.body, null, 2));
    
    // Handle timeout - mark reversal as failed due to timeout
    // You can implement specific timeout handling logic here
    
    res.status(200).json({ message: 'Reversal timeout received' });
  } catch (error) {
    console.error('❌ Reversal timeout error:', error);
    res.status(500).json({ error: 'Failed to process reversal timeout' });
  }
});

module.exports = router;