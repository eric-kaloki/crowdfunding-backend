const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// Import MPesa instance for callback handling
let mpesa;
try {
  mpesa = require("../config/mpesa");
  console.log('MPesa module loaded for payment routes');
} catch (error) {
  console.error('Failed to load MPesa module in payment routes:', error);
  mpesa = null;
}

// Initiate payment
router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { projectId, phoneNumber, amount } = req.body;

    // Verify project exists and belongs to user
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('client_id', req.user.id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Initiate MPesa STK Push
    const mpesaResponse = await mpesa.initiateSTKPush(phoneNumber, amount, projectId);

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert([
        {
          project_id: projectId,
          amount,
          status: 'pending',
          payment_provider: 'mpesa',
          mpesa_phone_number: phoneNumber,
          merchant_request_id: mpesaResponse.MerchantRequestID,
          mpesa_checkout_request_id: mpesaResponse.CheckoutRequestID,
          payment_type: 'final',
          user_id: req.user.id,  // Add user ID
          mpesa_transaction_id: mpesaResponse.TransactionID  // Add MPesa transaction ID
        }
      ])
      .select()
      .single();

    if (paymentError) throw paymentError;

    res.json({
      payment,
      mpesaResponse
    });
  } catch (error) {
    res.status(500).json({ error: 'Error initiating payment' });
  }
});

// MPesa callback
router.post('/mpesa-callback', async (req, res) => {
  try {
    const { Body: { stkCallback }, projectId,  } = req.body;

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    console.log(stkCallback);

    // Extract MpesaReceiptNumber from CallbackMetadata
    let mpesaTransactionID = null;
    if (CallbackMetadata && CallbackMetadata.Item) {
      const receiptItem = CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
      if (receiptItem) {
        mpesaTransactionID = receiptItem.Value;  // Get the transaction ID
      }
    }
console.log(mpesaTransactionID);
    // Update payment record
    const { error } = await supabase
      .from('payments')
      .update({
        status: ResultCode === 0 ? 'completed' : 'failed',
        result_code: ResultCode.toString(),
        result_desc: ResultDesc,
        mpesa_transaction_id: mpesaTransactionID,  // Use the extracted transaction ID
        amount: stkCallback.TransAmount,  // Update amount from callback
        payment_provider: 'mpesa',  // Update payment provider from callback
        mpesa_phone_number: stkCallback.TransactorMSISDN,  // Update phone number from callback
        updated_at: new Date().toISOString()
      })
      .match({
        project_id: projectId,  // Use project ID for matching
        user_id: req.user.id     // Use user ID for matching
      });
      console.log(ResultCode, ResultDesc, stkCallback.TransAmount, stkCallback.TransactorMSISDN, MerchantRequestID, CheckoutRequestID, mpesaTransactionID)

    if (error) throw error;

    // If payment successful, update project status
    if (ResultCode === 0) {
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('merchant_request_id', MerchantRequestID)
        .single();
      // Additional logic for successful payment
    }

    res.status(200).json({ message: 'Callback processed successfully' });

  } catch (error) {
    res.status(500).json({ error: 'Error processing callback' });
  }
});

// Test callback route to verify connectivity
router.post('/test-callback', (req, res) => {
  console.log('🧪 TEST CALLBACK RECEIVED:');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=====================================');
  
  res.json({ success: true, message: 'Test callback received', timestamp: new Date().toISOString() });
});

// Add logging middleware specifically for M-Pesa callbacks
router.use('/mpesa/callback/*', (req, res, next) => {
  console.log('🔔 M-PESA CALLBACK MIDDLEWARE TRIGGERED');
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=====================================');
  next();
});

// M-Pesa callback for contributions - simplified route that delegates to mpesa.js
router.post('/mpesa/callback/contributions', async (req, res) => {
  try {
    console.log('🎯 === ACTIVE M-PESA CALLBACK RECEIVED ===');
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('🌐 Request URL:', req.url);
    console.log('📋 Request Method:', req.method);
    console.log('📦 Raw Request Body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 Request Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔢 Content-Length:', req.get('Content-Length'));
    console.log('📝 Content-Type:', req.get('Content-Type'));
    console.log('🆔 User-Agent:', req.get('User-Agent'));
    console.log('==========================================');

    // Handle test data
    if (req.body.test) {
      console.log('📋 Test data received:', req.body.test);
      return res.json({ 
        success: true, 
        message: 'Test callback received successfully',
        data: req.body,
        timestamp: new Date().toISOString()
      });
    }

    // Log specific callback data structure
    const { Body } = req.body;
    if (Body && Body.stkCallback) {
      console.log('✅ STK Callback Structure Found:');
      console.log('📋 Callback Data:', JSON.stringify(Body.stkCallback, null, 2));
      
      const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;
      
      console.log('🔑 Key Fields:');
      console.log('  - MerchantRequestID:', MerchantRequestID);
      console.log('  - CheckoutRequestID:', CheckoutRequestID);
      console.log('  - ResultCode:', ResultCode);
      console.log('  - ResultDesc:', ResultDesc);
      
      if (CallbackMetadata && CallbackMetadata.Item) {
        console.log('💰 Metadata Items:');
        CallbackMetadata.Item.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.Name}: ${item.Value}`);
        });
      }
    } else {
      console.log('❌ No STK Callback found in Body');
      console.log('📋 Available Body keys:', Object.keys(req.body));
    }

    if (!mpesa) {
      console.error('❌ MPesa module not available for callback processing');
      return res.status(500).json({ error: 'Payment service unavailable' });
    }

    // Delegate callback processing to the MPesa class
    console.log('🔄 Delegating to MPesa handler...');
    const result = await mpesa.handleContributionCallback(req.body);
    
    console.log('✅ Callback processed successfully:', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ M-Pesa callback processing error:', error);
    console.error('📚 Error Stack:', error.stack);
    
    // Send a proper error response instead of generic message
    res.status(200).json({ 
      success: false, 
      error: 'Callback processing failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check payment status
router.get('/status/:checkoutRequestId', authenticate, async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    // Get payment details from database
    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        projects (
          id,
          title,
          status
        )
      `)
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // If payment is still pending, check with MPesa
    if (payment.status === 'pending') {
      const mpesaResponse = await mpesa.checkTransactionStatus(checkoutRequestId);
      
      // Update payment status based on MPesa response
      if (mpesaResponse.ResultCode !== undefined) {
        await supabase
          .from('payments')
          .update({
            status: mpesaResponse.ResultCode === 0 ? 'completed' : 'failed',
            result_code: mpesaResponse.ResultCode.toString(),
            result_desc: mpesaResponse.ResultDesc
          })
          .eq('mpesa_checkout_request_id', checkoutRequestId);

        payment.status = mpesaResponse.ResultCode === 0 ? 'completed' : 'failed';
      }
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Error checking payment status' });
  }
});

// Get all payments (admin only)
router.get('/all', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        projects (
          id,
          title,
          client_id,
          users (
            id,
            firstName,
            lastName,
            email
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching payments' });
  }
});

router.get('/:projectId/payments', async (req, res) => {
  const { projectId } = req.params;
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount')
      .eq('project_id', projectId);

    if (error) throw error;

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    res.json(totalPaid);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching total paid' });
  }
});

// M-Pesa reversal result callback - Fix the path
router.post('/mpesa/callback/reversal', async (req, res) => {
  try {
    console.log('🔄 === M-PESA REVERSAL RESULT CALLBACK ===');
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('📦 Raw Request Body:', JSON.stringify(req.body, null, 2));
    console.log('==========================================');

    if (!mpesa) {
      console.error('❌ MPesa module not available for reversal callback');
      return res.status(500).json({ error: 'Payment service unavailable' });
    }

    // Delegate reversal callback processing to the MPesa class
    const result = await mpesa.handleReversalCallback(req.body);
    
    console.log('✅ Reversal callback processed:', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ M-Pesa reversal callback error:', error);
    res.status(200).json({ 
      success: false, 
      error: 'Reversal callback processing failed',
      message: error.message
    });
  }
});

// M-Pesa reversal timeout callback - Fix the path
router.post('/mpesa/timeout/reversal', async (req, res) => {
  try {
    console.log('⏰ === M-PESA REVERSAL TIMEOUT CALLBACK ===');
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('📦 Raw Request Body:', JSON.stringify(req.body, null, 2));
    console.log('==========================================');

    // Log timeout but don't fail
    res.status(200).json({ 
      success: true, 
      message: 'Reversal timeout acknowledged' 
    });

  } catch (error) {
    console.error('❌ M-Pesa reversal timeout callback error:', error);
    res.status(200).json({ 
      success: false, 
      error: 'Timeout callback processing failed' 
    });
  }
});

module.exports = router;
