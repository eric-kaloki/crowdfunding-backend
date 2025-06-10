const axios = require("axios");
const moment = require("moment");
const { supabase } = require("./supabase");

class MPesa {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;

    // OPTIMIZATION 1: Create reusable axios instance with optimized settings
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      // OPTIMIZATION 2: Enable keep-alive for connection reuse
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    // OPTIMIZATION 3: Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      error => {
        console.error('M-Pesa API Error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    // OPTIMIZATION 4: Cache access token with TTL
    this.accessTokenCache = {
      token: null,
      expires: null
    };

    if (!this.consumerKey || !this.consumerSecret) {
      console.warn("MPesa credentials not properly configured");
    }
  }

  // OPTIMIZATION 5: Improved access token generation with caching
  async generateAccessToken(retryCount = 0) {
    const maxRetries = 2; // Reduced retries for faster failure
    
    // Check cache first
    if (this.accessTokenCache.token && this.accessTokenCache.expires > Date.now()) {
      console.log('✅ Using cached access token');
      return this.accessTokenCache.token;
    }

    try {
      if (!this.consumerKey || !this.consumerSecret) {
        throw new Error("MPesa credentials not configured");
      }

      console.log(`🔐 Generating new access token (attempt ${retryCount + 1}/${maxRetries + 1})`);

      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64");

      const response = await this.axiosInstance.get(
        "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${auth}`,
          }
        }
      );

      const { access_token, expires_in } = response.data;

      // OPTIMIZATION 6: Cache token with proper TTL
      this.accessTokenCache = {
        token: access_token,
        expires: Date.now() + (expires_in * 1000) - 60000 // Expire 1 minute early
      };

      console.log("✅ Access token generated and cached");
      return access_token;

    } catch (error) {
      console.error(`❌ Access token generation failed (attempt ${retryCount + 1}):`, error.message);

      // OPTIMIZATION 7: Smart retry logic
      if (retryCount < maxRetries && this.shouldRetry(error)) {
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
        console.log(`🔄 Retrying in ${waitTime}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.generateAccessToken(retryCount + 1);
      }

      throw new Error(`Failed to generate access token: ${error.message}`);
    }
  }

  // OPTIMIZATION 8: Helper method to determine if error should be retried
  shouldRetry(error) {
    const retryableErrors = ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];
    const retryableStatusCodes = [500, 502, 503, 504];
    
    return retryableErrors.includes(error.code) || 
           retryableStatusCodes.includes(error.response?.status);
  }

  // Generate timestamp in format YYYYMMDDHHmmss
  generateTimestamp() {
    return moment().format("YYYYMMDDHHmmss");
  }

  // OPTIMIZATION 9: Streamlined STK Push with better validation
  async initiateSTKPush(phoneNumber, amount, contributionId) {
    try {
      // OPTIMIZATION 10: Input validation first
      if (!phoneNumber || !amount || !contributionId) {
        throw new Error("Missing required parameters for STK push");
      }

      // OPTIMIZATION 11: Validate amount early
      const numericAmount = Math.floor(Number(amount));
      if (numericAmount < 1 || numericAmount > 300000) {
        throw new Error("Invalid amount: must be between 1 and 300,000 KES");
      }

      console.log(`🚀 Initiating STK Push: Contribution ${contributionId}, Amount: ${numericAmount}`);

      // Get access token (cached)
      const accessToken = await this.generateAccessToken();

      // OPTIMIZATION 12: Efficient phone number formatting
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Generate required values
      const timestamp = this.generateTimestamp();
      const shortcode = parseInt(this.shortcode || "174379");
      const password = Buffer.from(`${shortcode}${this.passkey}${timestamp}`).toString("base64");

      const paymentRequest = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: numericAmount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${this.callbackUrl}/mpesa/callback/contributions`,
        AccountReference: `CONTRIBUTION_${contributionId}`,
        TransactionDesc: `Campaign Contribution - ${contributionId}`,
      };

      console.log("📋 STK Push request prepared");

      const response = await this.axiosInstance.post(
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        paymentRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        }
      );

      if (response.data.ResponseCode === "0") {
        console.log(`✅ STK Push successful for contribution: ${contributionId}`);
        return {
          success: true,
          MerchantRequestID: response.data.MerchantRequestID,
          CheckoutRequestID: response.data.CheckoutRequestID,
          ResponseCode: response.data.ResponseCode,
          ResponseDescription: response.data.ResponseDescription,
          CustomerMessage: response.data.CustomerMessage,
        };
      } else {
        throw new Error(`MPesa Error: ${response.data.ResponseDescription || "Unknown error"}`);
      }

    } catch (error) {
      console.error("❌ STK Push failed:", {
        contributionId,
        error: error.message,
        code: error.code
      });

      // OPTIMIZATION 13: Better error messages
      if (error.code === 'ECONNABORTED') {
        throw new Error("M-Pesa service timeout - please try again");
      } else if (error.response?.data?.errorMessage) {
        throw new Error(error.response.data.errorMessage);
      } else {
        throw new Error(`Payment initiation failed: ${error.message}`);
      }
    }
  }

  // OPTIMIZATION 14: Helper method for phone number formatting
  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.toString().replace(/\D/g, "");
    
    if (cleaned.startsWith("254")) {
      return parseInt(cleaned);
    } else if (cleaned.startsWith("0")) {
      return parseInt(`254${cleaned.slice(1)}`);
    } else {
      return parseInt(`254${cleaned}`);
    }
  }

  // OPTIMIZATION 15: Optimized callback handling with batch operations
  async handleContributionCallback(callbackData) {
    try {
      console.log('🔄 Processing M-Pesa callback...');

      if (callbackData.test) {
        return { success: true, message: 'Test callback received', test: true };
      }

      const { Body } = callbackData;
      if (!Body?.stkCallback) {
        return { success: false, message: 'Invalid callback format' };
      }

      const callback = Body.stkCallback;
      const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

      if (!CheckoutRequestID) {
        return { success: false, message: 'Missing CheckoutRequestID' };
      }

      // OPTIMIZATION 16: Parse transaction details efficiently
      const transactionDetails = this.parseCallbackMetadata(CallbackMetadata);

      // OPTIMIZATION 17: Single query to find contribution
      const { data: contribution, error: findError } = await supabase
        .from('contributions')
        .select('id, campaign_id, amount, status')
        .eq('mpesa_checkout_request_id', CheckoutRequestID)
        .single();

      if (findError || !contribution) {
        console.error('❌ Contribution not found:', CheckoutRequestID);
        return { success: false, message: 'Contribution not found' };
      }

      // OPTIMIZATION 18: Prepare update data efficiently
      const updateData = {
        result_code: ResultCode.toString(),
        result_desc: ResultDesc,
        updated_at: new Date().toISOString()
      };

      if (ResultCode === 0) {
        updateData.status = 'completed';
        updateData.processed_at = new Date().toISOString();

        if (transactionDetails.mpesaReceiptNumber) {
          updateData.transaction_id = transactionDetails.mpesaReceiptNumber;
        }
        if (transactionDetails.phoneNumber) {
          updateData.mpesa_phone_number = transactionDetails.phoneNumber.toString();
        }
        if (transactionDetails.transactionDate) {
          updateData.result_desc = `${ResultDesc} | Transaction Date: ${transactionDetails.transactionDate}`;
        }
      } else {
        updateData.status = 'failed';
      }

      // OPTIMIZATION 19: Batch database operations
      const operations = [
        supabase
          .from('contributions')
          .update(updateData)
          .eq('id', contribution.id)
      ];

      // Only update campaign funding if payment successful and not already processed
      if (ResultCode === 0 && contribution.status !== 'completed') {
        operations.push(
          this.updateCampaignFunding(contribution.campaign_id, contribution.amount)
        );
      }

      await Promise.all(operations);

      console.log(`✅ Callback processed for contribution ${contribution.id}`);
      
      return { 
        success: true, 
        message: 'Callback processed successfully',
        transaction_id: transactionDetails.mpesaReceiptNumber
      };

    } catch (error) {
      console.error('❌ Callback processing error:', error);
      return { 
        success: false, 
        message: 'Callback processing failed', 
        error: error.message
      };
    }
  }

  // OPTIMIZATION 20: Efficient metadata parsing
  parseCallbackMetadata(metadata) {
    const details = {
      mpesaReceiptNumber: null,
      amount: null,
      transactionDate: null,
      phoneNumber: null,
      balance: null
    };

    if (!metadata?.Item?.length) return details;

    for (const item of metadata.Item) {
      switch (item.Name) {
        case 'Amount':
          details.amount = parseFloat(item.Value);
          break;
        case 'MpesaReceiptNumber':
          details.mpesaReceiptNumber = item.Value;
          break;
        case 'TransactionDate':
          details.transactionDate = item.Value;
          break;
        case 'PhoneNumber':
          details.phoneNumber = item.Value;
          break;
        case 'Balance':
          details.balance = item.Value;
          break;
      }
    }

    return details;
  }

  // OPTIMIZATION 21: Optimized campaign funding update
  async updateCampaignFunding(campaignId, amount) {
    try {
      // Use RPC function for atomic update if available, otherwise use increment
      const { error } = await supabase.rpc('increment_campaign_funding', {
        campaign_id: campaignId,
        amount_to_add: amount
      }).single();

      if (error) {
        // Fallback to manual update
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("current_funding")
          .eq("id", campaignId)
          .single();

        if (campaign) {
          await supabase
            .from("campaigns")
            .update({
              current_funding: (campaign.current_funding || 0) + amount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaignId);
        }
      }

      console.log(`💰 Campaign ${campaignId} funding updated: +${amount}`);
    } catch (error) {
      console.error("Failed to update campaign funding:", error);
      throw error;
    }
  }

  // NEW: M-Pesa Reversal functionality
  async initiateReversal(transactionId, amount, remarks = 'Admin initiated refund') {
    try {
      console.log(`🔄 Initiating M-Pesa reversal for transaction: ${transactionId}, Amount: ${amount}`);

      // Get access token (cached)
      const accessToken = await this.generateAccessToken();
      
      // Validate amount - ensure it's the exact amount from original transaction
      const numericAmount = Math.floor(Number(amount));
      if (numericAmount < 1 || numericAmount > 300000) {
        throw new Error("Invalid reversal amount: must be between 1 and 300,000 KES");
      }

      const shortcode = parseInt(this.shortcode || "174379");

      // Build reversal request according to M-Pesa documentation
      const reversalRequest = {
        Initiator: process.env.MPESA_INITIATOR || "testapi",
        SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
        CommandID: "TransactionReversal", // Must be exactly "TransactionReversal"
        TransactionID: transactionId, // Original M-Pesa transaction ID
        Amount: numericAmount, // Exact amount from original transaction
        ReceiverParty: shortcode, // Your organization's shortcode
        RecieverIdentifierType: "11", // Note: M-Pesa API has typo "Reciever" not "Receiver"
        ResultURL: `${this.callbackUrl}/mpesa/callback/reversal`,
        QueueTimeOutURL: `${this.callbackUrl}/mpesa/timeout/reversal`,
        Remarks: remarks.substring(0, 100), // Max 100 characters
        Occasion: occasion.substring(0, 100) // Optional but recommended, max 100 characters
      };

      console.log("📋 M-Pesa reversal request prepared (compliant with docs):", JSON.stringify(reversalRequest, null, 2));

      const response = await this.axiosInstance.post(
        "https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request",
        reversalRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Validate response according to documentation
      if (response.data.ResponseCode === "0") {
        console.log(`✅ M-Pesa reversal initiated successfully for transaction: ${transactionId}`);
        console.log(`🔍 Tracking details:`, {
          OriginatorConversationID: response.data.OriginatorConversationID,
          ConversationID: response.data.ConversationID
        });
        
        return {
          success: true,
          OriginatorConversationID: response.data.OriginatorConversationID,
          ConversationID: response.data.ConversationID,
          ResponseCode: response.data.ResponseCode,
          ResponseDescription: response.data.ResponseDescription,
          // Add status tracking info
          status: 'initiated',
          expectedCallback: true,
          callbackUrl: `${this.callbackUrl}/mpesa/callback/reversal`
        };
      } else {
        throw new Error(`M-Pesa Reversal Error: ${response.data.ResponseDescription || "Unknown error"}`);
      }

    } catch (error) {
      console.error("❌ M-Pesa reversal failed:", {
        transactionId,
        error: error.message,
        code: error.code,
        response: error.response?.data
      });

      // Better error messages for reversals
      if (error.code === 'ECONNABORTED') {
        throw new Error("M-Pesa reversal service timeout - please try again");
      } else if (error.response?.data?.errorMessage) {
        throw new Error(error.response.data.errorMessage);
      } else {
        throw new Error(`Reversal initiation failed: ${error.message}`);
      }
    }
  }

  // Enhanced reversal callback handler to match M-Pesa documentation structure
  async handleReversalCallback(callbackData) {
    try {
      console.log('🔄 Processing M-Pesa reversal callback according to documentation...');
      console.log('📦 Complete callback payload:', JSON.stringify(callbackData, null, 2));

      const { Result } = callbackData;
      if (!Result) {
        return { success: false, message: 'Invalid reversal callback format - missing Result object' };
      }

      const { 
        ResultType,
        ResultCode, 
        ResultDesc,
        OriginatorConversationID,
        ConversationID, 
        TransactionID,
        ResultParameters,
        ReferenceData
      } = Result;

      console.log(`📋 Reversal callback details:`, {
        ResultType,
        ResultCode,
        ResultDesc,
        OriginatorConversationID,
        ConversationID,
        TransactionID
      });

      // Parse result parameters according to documentation
      const reversalDetails = this.parseReversalResultParameters(ResultParameters);
      console.log('📊 Parsed reversal details:', reversalDetails);

      // Find the contribution using multiple methods
      let contribution = null;
      
      // Method 1: Find by conversation ID
      const { data: contributionByConv, error: convError } = await supabase
        .from('contributions')
        .select('id, transaction_id, amount, status, campaign_id, refund_initiated_at')
        .eq('reversal_conversation_id', ConversationID)
        .single();

      if (contributionByConv && !convError) {
        contribution = contributionByConv;
        console.log(`✅ Found contribution by ConversationID: ${contribution.id}`);
      }

      // Method 2: Find by originator conversation ID (fallback)
      if (!contribution) {
        const { data: contributionByOrig, error: origError } = await supabase
          .from('contributions')
          .select('id, transaction_id, amount, status, campaign_id, refund_initiated_at')
          .eq('reversal_originator_conversation_id', OriginatorConversationID)
          .single();

        if (contributionByOrig && !origError) {
          contribution = contributionByOrig;
          console.log(`✅ Found contribution by OriginatorConversationID: ${contribution.id}`);
        }
      }

      // Method 3: Find by original transaction ID from result parameters
      if (!contribution && reversalDetails.originalTransactionID) {
        const { data: contributionByOrigTx, error: origTxError } = await supabase
          .from('contributions')
          .select('id, transaction_id, amount, status, campaign_id, refund_initiated_at')
          .eq('transaction_id', reversalDetails.originalTransactionID)
          .single();

        if (contributionByOrigTx && !origTxError) {
          contribution = contributionByOrigTx;
          console.log(`✅ Found contribution by OriginalTransactionID: ${contribution.id}`);
        }
      }

      // Method 4: Find by recent refund_pending status (last resort)
      if (!contribution) {
        const { data: recentContribution, error: recentError } = await supabase
          .from('contributions')
          .select('id, transaction_id, amount, status, campaign_id, refund_initiated_at')
          .eq('status', 'refund_pending')
          .gte('refund_initiated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last 1 hour
          .order('refund_initiated_at', { ascending: false })
          .limit(1)
          .single();

        if (recentContribution && !recentError) {
          contribution = recentContribution;
          console.log(`🔄 Found recent pending refund contribution: ${contribution.id}`);
        }
      }

      if (!contribution) {
        console.error('❌ No contribution found for reversal callback');
        return { success: false, message: 'Contribution not found for reversal' };
      }

      // Prepare update data according to documentation
      const updateData = {
        reversal_result_type: ResultType?.toString(),
        reversal_result_code: ResultCode?.toString(),
        reversal_result_desc: ResultDesc,
        reversal_conversation_id: ConversationID,
        reversal_transaction_id: TransactionID,
        updated_at: new Date().toISOString(),
        reversal_callback_received_at: new Date().toISOString(),
        reversal_details: JSON.stringify({
          ...reversalDetails,
          referenceData: ReferenceData,
          callbackReceivedAt: new Date().toISOString()
        })
      };

      // Handle different result codes according to documentation
      if (ResultCode === "0" || ResultCode === 0) {
        // Successful reversal (ResultCode 0 = success)
        console.log(`✅ Reversal successful for contribution ${contribution.id}`);
        
        updateData.status = 'refunded';
        updateData.refunded_at = new Date().toISOString();

        // Update contribution
        await supabase
          .from('contributions')
          .update(updateData)
          .eq('id', contribution.id);

        // Update campaign funding (subtract the refunded amount)
        if (contribution.campaign_id) {
          await this.updateCampaignFunding(contribution.campaign_id, -contribution.amount);
          console.log(`💰 Campaign ${contribution.campaign_id} funding reduced by: ${contribution.amount}`);
        }

        return { 
          success: true, 
          message: 'Reversal completed successfully',
          resultCode: ResultCode,
          contributionId: contribution.id,
          status: 'refunded',
          reversalAmount: reversalDetails.amount,
          originalTransactionID: reversalDetails.originalTransactionID
        };
      }
      
      // Handle specific error codes
      else if (ResultCode === "21" || ResultCode === 21) {
        // Code 21: Service request processed successfully (according to docs)
        console.log(`✅ Reversal processed successfully with code 21 for contribution ${contribution.id}`);
        
        updateData.status = 'refunded';
        updateData.refunded_at = new Date().toISOString();

        await supabase
          .from('contributions')
          .update(updateData)
          .eq('id', contribution.id);

        // Update campaign funding
        if (contribution.campaign_id) {
          await this.updateCampaignFunding(contribution.campaign_id, -contribution.amount);
          console.log(`💰 Campaign ${contribution.campaign_id} funding reduced by: ${contribution.amount}`);
        }

        return { 
          success: true, 
          message: 'Reversal processed successfully',
          resultCode: ResultCode,
          contributionId: contribution.id,
          status: 'refunded'
        };
      }
      
      // Handle invalid transaction ID error
      else if (ResultCode === "R000002" && ResultDesc?.includes('OriginalTransactionID is invalid')) {
        console.error('❌ Invalid OriginalTransactionID - sandbox limitation detected');
        
        // For development/sandbox environment, we can still process the refund
        if (process.env.NODE_ENV === 'development' || process.env.MPESA_ENVIRONMENT === 'sandbox') {
          console.log('🧪 Sandbox environment - processing refund despite M-Pesa error');
          
          updateData.status = 'refunded';
          updateData.refunded_at = new Date().toISOString();
          updateData.reversal_details = JSON.stringify({
            ...reversalDetails,
            sandbox_processed: true,
            original_error: ResultDesc,
            processed_at: new Date().toISOString(),
            note: 'Processed in sandbox environment despite M-Pesa error'
          });

          await supabase
            .from('contributions')
            .update(updateData)
            .eq('id', contribution.id);

          // Update campaign funding
          if (contribution.campaign_id) {
            await this.updateCampaignFunding(contribution.campaign_id, -contribution.amount);
            console.log(`💰 Sandbox: Campaign ${contribution.campaign_id} funding reduced by: ${contribution.amount}`);
          }

          return { 
            success: true, 
            message: 'Sandbox refund processed successfully',
            resultCode: ResultCode,
            contributionId: contribution.id,
            status: 'refunded',
            sandbox_processed: true
          };
        } else {
          // Production environment - mark as failed
          updateData.status = 'refund_failed';

          await supabase
            .from('contributions')
            .update(updateData)
            .eq('id', contribution.id);

          return { 
            success: false, 
            message: 'Reversal failed - Invalid transaction ID (requires manual processing)',
            resultCode: ResultCode,
            contributionId: contribution.id,
            status: 'refund_failed'
          };
        }
      }
      
      // Other failure cases
      else {
        console.error(`❌ Reversal failed with code ${ResultCode}: ${ResultDesc}`);
        
        updateData.status = 'refund_failed';

        await supabase
          .from('contributions')
          .update(updateData)
          .eq('id', contribution.id);

        return { 
          success: false, 
          message: `Reversal failed: ${ResultDesc}`,
          resultCode: ResultCode,
          contributionId: contribution.id,
          status: 'refund_failed'
        };
      }

    } catch (error) {
      console.error('❌ Reversal callback processing error:', error);
      return { 
        success: false, 
        message: 'Reversal callback processing failed', 
        error: error.message
      };
    }
  }

  // Enhanced result parameter parsing to match M-Pesa documentation
  parseReversalResultParameters(resultParameters) {
    const details = {
      // Core reversal details from documentation
      debitAccountBalance: null,
      amount: null,
      transCompletedTime: null,
      originalTransactionID: null,
      charge: null,
      creditPartyPublicName: null,
      debitPartyPublicName: null,
      // Additional fields that might be present
      reversalAmount: null,
      reversalDate: null
    };

    if (!resultParameters?.ResultParameter) {
      console.log('⚠️ No ResultParameter found in callback');
      return details;
    }

    const parameters = Array.isArray(resultParameters.ResultParameter) 
      ? resultParameters.ResultParameter 
      : [resultParameters.ResultParameter];

    console.log('📊 Processing result parameters:', parameters);

    for (const param of parameters) {
      if (!param || !param.Key) continue;

      switch (param.Key) {
        case 'DebitAccountBalance':
          details.debitAccountBalance = param.Value;
          console.log(`💳 DebitAccountBalance: ${param.Value}`);
          break;
        case 'Amount':
          details.amount = parseFloat(param.Value);
          details.reversalAmount = parseFloat(param.Value); // Alias
          console.log(`💰 Reversal Amount: ${param.Value}`);
          break;
        case 'TransCompletedTime':
          details.transCompletedTime = param.Value;
          details.reversalDate = param.Value; // Alias
          console.log(`⏰ Transaction Completed: ${param.Value}`);
          break;
        case 'OriginalTransactionID':
          details.originalTransactionID = param.Value;
          console.log(`🔗 Original Transaction ID: ${param.Value}`);
          break;
        case 'Charge':
          details.charge = parseFloat(param.Value) || 0;
          console.log(`💸 Charge: ${param.Value}`);
          break;
        case 'CreditPartyPublicName':
          details.creditPartyPublicName = param.Value;
          console.log(`👤 Credit Party: ${param.Value}`);
          break;
        case 'DebitPartyPublicName':
          details.debitPartyPublicName = param.Value;
          console.log(`🏢 Debit Party: ${param.Value}`);
          break;
        default:
          console.log(`ℹ️ Unknown parameter: ${param.Key} = ${param.Value}`);
          break;
      }
    }

    return details;
  }

  async checkTransactionStatus(checkoutRequestId) {
    try {
      if (!checkoutRequestId) {
        throw new Error("Checkout Request ID is required");
      }

      const accessToken = await this.generateAccessToken();
      const timestamp = this.generateTimestamp();
      const shortcode = parseInt(this.shortcode || "174379");
      const passkey =
        this.passkey ||
        "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

      const payload = {
        BusinessShortCode: shortcode,
        Password: Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
          "base64"
        ),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      };

      const queryUrl = "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

      const response = await axios.post(
        queryUrl,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Error checking transaction status:", error);
      throw error;
    }
  }

  // OPTIMIZATION 22: M-Pesa Transaction Reversal
  async reverseTransaction(transactionId, amount, remarks = 'Admin initiated refund', occasion = 'Refund') {
    try {
      console.log(`🔄 Initiating M-Pesa reversal for transaction: ${transactionId}, Amount: ${amount}`);

      // Get access token
      const accessToken = await this.generateAccessToken();

      // Generate timestamp and security credential
      const timestamp = this.generateTimestamp();
      const shortcode = parseInt(this.shortcode || "174379");
      
      // For sandbox, use test credentials
      const initiator = process.env.MPESA_INITIATOR || "testapi";
      const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL || 
        "Fcu2bswBFZk3uDkvfQ7eB64MEE6/HgHs8wVu55XcuEOmtnkxn7otge0Xe3E4cofi+cMF547f+sojAwECD6ayKKx1rfbedHA4q6NhKAll67O/CYzGgJfkKZHNIZmjD8yWXcCpzqBU3cu8EgFbSVKM8A9I4D6KOeYHKCgoUmkvDV+6A3H9Ax0ewzSG05HVrkzYmDk1Se1Gf1Hx5UA6nFhKCeFJ4fW9ia2KiV93lFEuIeqtIPqFgzM5HbWd7EvCZqLRY6Rn0FZvyEOQNVE8wda9uYbnM+P++DgTpDSrHD4U9nq6CPm7cfccFDFPE9RMEJwrmj/w738R+4graAFktgRR9w==";

      const reversalRequest = {
        Initiator: initiator,
        SecurityCredential: securityCredential,
        CommandID: "TransactionReversal",
        TransactionID: transactionId,
        Amount: Math.floor(Number(amount)),
        ReceiverParty: shortcode,
        RecieverIdentifierType: "11", // Note: M-Pesa API uses "Reciever" (typo in their API)
        ResultURL: `${this.callbackUrl}/mpesa/reversal/result`,
        QueueTimeOutURL: `${this.callbackUrl}/mpesa/reversal/timeout`,
        Remarks: remarks.substring(0, 100), // Max 100 characters
        Occasion: occasion.substring(0, 100) // Max 100 characters
      };

      console.log("📋 M-Pesa reversal request prepared");

      const response = await this.axiosInstance.post(
        "https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request",
        reversalRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        }
      );

      if (response.data.ResponseCode === "0") {
        console.log(`✅ M-Pesa reversal initiated successfully for transaction: ${transactionId}`);
        return {
          success: true,
          OriginatorConversationID: response.data.OriginatorConversationID,
          ConversationID: response.data.ConversationID,
          ResponseCode: response.data.ResponseCode,
          ResponseDescription: response.data.ResponseDescription,
        };
      } else {
        throw new Error(`M-Pesa Reversal Error: ${response.data.ResponseDescription || "Unknown error"}`);
      }

    } catch (error) {
      console.error("❌ M-Pesa reversal failed:", {
        transactionId,
        amount,
        error: error.message,
        code: error.code
      });

      if (error.code === 'ECONNABORTED') {
        throw new Error("M-Pesa reversal service timeout - please try again");
      } else if (error.response?.data?.errorMessage) {
        throw new Error(error.response.data.errorMessage);
      } else {
        throw new Error(`Reversal initiation failed: ${error.message}`);
      }
    }
  }

  // OPTIMIZATION 23: Handle reversal callback
  async handleReversalCallback(callbackData) {
    try {
      console.log('🔄 Processing M-Pesa reversal callback...');

      const { Result } = callbackData;
      if (!Result) {
        return { success: false, message: 'Invalid reversal callback format' };
      }

      const { 
        ResultCode, 
        ResultDesc, 
        OriginatorConversationID, 
        ConversationID, 
        TransactionID,
        ResultParameters 
      } = Result;

      console.log('📋 Reversal callback details:', {
        ResultCode,
        ResultDesc,
        OriginatorConversationID,
        ConversationID,
        TransactionID
      });

      // Parse result parameters for additional details
      const resultParams = this.parseReversalResultParameters(ResultParameters);

      // Find the original contribution by transaction ID or conversation ID
      const { data: contribution, error: findError } = await supabase
        .from('contributions')
        .select('id, campaign_id, amount, status, transaction_id')
        .eq('transaction_id', resultParams.originalTransactionID || TransactionID)
        .single();

      if (findError || !contribution) {
        console.error('❌ Original contribution not found for reversal:', {
          originalTransactionID: resultParams.originalTransactionID,
          TransactionID
        });
        return { success: false, message: 'Original contribution not found' };
      }

      // Update contribution status based on reversal result
      const updateData = {
        updated_at: new Date().toISOString(),
        reversal_conversation_id: ConversationID,
        reversal_result_code: ResultCode.toString(),
        reversal_result_desc: ResultDesc
      };

      if (ResultCode === 0) {
        // Successful reversal
        updateData.status = 'refunded';
        updateData.refunded_at = new Date().toISOString();
      } else {
        // Failed reversal - keep original status
        console.error('❌ M-Pesa reversal failed:', ResultDesc);
      }

      // Update the contribution
      const { error: updateError } = await supabase
        .from('contributions')
        .update(updateData)
        .eq('id', contribution.id);

      if (updateError) {
        throw updateError;
      }

      // If reversal was successful, update campaign funding
      if (ResultCode === 0) {
        await this.updateCampaignFunding(contribution.campaign_id, -contribution.amount);
        console.log(`💰 Campaign ${contribution.campaign_id} funding reduced by: ${contribution.amount}`);
      }

      console.log(`✅ Reversal callback processed for contribution ${contribution.id}`);
      
      return { 
        success: true, 
        message: 'Reversal callback processed successfully',
        reversal_successful: ResultCode === 0,
        transaction_id: TransactionID
      };

    } catch (error) {
      console.error('❌ Reversal callback processing error:', error);
      return { 
        success: false, 
        message: 'Reversal callback processing failed', 
        error: error.message
      };
    }
  }

  // OPTIMIZATION 24: Parse reversal result parameters
  parseReversalResultParameters(resultParameters) {
    const details = {
      originalTransactionID: null,
      amount: null,
      debitAccountBalance: null,
      transCompletedTime: null,
      charge: null,
      creditPartyPublicName: null,
      debitPartyPublicName: null
    };

    if (!resultParameters?.ResultParameter?.length) return details;

    for (const param of resultParameters.ResultParameter) {
      switch (param.Key) {
        case 'OriginalTransactionID':
          details.originalTransactionID = param.Value;
          break;
        case 'Amount':
          details.amount = parseFloat(param.Value);
          break;
        case 'DebitAccountBalance':
          details.debitAccountBalance = param.Value;
          break;
        case 'TransCompletedTime':
          details.transCompletedTime = param.Value;
          break;
        case 'Charge':
          details.charge = parseFloat(param.Value);
          break;
        case 'CreditPartyPublicName':
          details.creditPartyPublicName = param.Value;
          break;
        case 'DebitPartyPublicName':
          details.debitPartyPublicName = param.Value;
          break;
      }
    }

    return details;
  }

  // Add method to check reversal status manually
  async checkReversalStatus(conversationId) {
    try {
      console.log(`🔍 Checking reversal status for conversation: ${conversationId}`);
      
      const { data: contribution, error } = await supabase
        .from('contributions')
        .select(`
          id, 
          status, 
          reversal_result_code, 
          reversal_result_desc,
          reversal_callback_received_at,
          refund_initiated_at,
          refunded_at
        `)
        .eq('reversal_conversation_id', conversationId)
        .single();

      if (error || !contribution) {
        return { success: false, message: 'Reversal not found' };
      }

      // Calculate time since initiation
      const timeSinceInitiation = contribution.refund_initiated_at 
        ? Date.now() - new Date(contribution.refund_initiated_at).getTime()
        : null;

      return {
        success: true,
        status: contribution.status,
        resultCode: contribution.reversal_result_code,
        resultDesc: contribution.reversal_result_desc,
        callbackReceived: !!contribution.reversal_callback_received_at,
        timeSinceInitiation: timeSinceInitiation ? Math.floor(timeSinceInitiation / 1000) : null, // in seconds
        isComplete: ['refunded', 'refund_failed'].includes(contribution.status),
        refundedAt: contribution.refunded_at
      };
    } catch (error) {
      console.error('Error checking reversal status:', error);
      return { success: false, message: 'Error checking status', error: error.message };
    }
  }
}

// Create and export a single instance
const mpesaInstance = new MPesa();

module.exports = mpesaInstance;
