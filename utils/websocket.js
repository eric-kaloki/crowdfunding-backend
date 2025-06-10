const WebSocket = require('ws');

let wss = null;
const campaignSubscriptions = new Map(); // Map of campaignId -> Set of WebSocket connections

const initializeWebSocket = (server) => {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'subscribe_campaign') {
          subscribeToCampaign(ws, data.campaignId);
        } else if (data.type === 'unsubscribe_campaign') {
          unsubscribeFromCampaign(ws, data.campaignId);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      // Clean up subscriptions
      campaignSubscriptions.forEach((subscribers, campaignId) => {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          campaignSubscriptions.delete(campaignId);
        }
      });
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
};

const subscribeToCampaign = (ws, campaignId) => {
  if (!campaignSubscriptions.has(campaignId)) {
    campaignSubscriptions.set(campaignId, new Set());
  }
  
  campaignSubscriptions.get(campaignId).add(ws);
  console.log(`Client subscribed to campaign ${campaignId}`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'subscription_confirmed',
    campaignId: campaignId
  }));
};

const unsubscribeFromCampaign = (ws, campaignId) => {
  if (campaignSubscriptions.has(campaignId)) {
    campaignSubscriptions.get(campaignId).delete(ws);
    
    if (campaignSubscriptions.get(campaignId).size === 0) {
      campaignSubscriptions.delete(campaignId);
    }
  }
  
  console.log(`Client unsubscribed from campaign ${campaignId}`);
};

const broadcastCampaignUpdate = (campaignId, updateData) => {
  if (!campaignSubscriptions.has(campaignId)) {
    return; // No subscribers for this campaign
  }

  const subscribers = campaignSubscriptions.get(campaignId);
  const message = JSON.stringify({
    type: 'campaign_update',
    campaignId: campaignId,
    ...updateData
  });

  subscribers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        subscribers.delete(ws);
      }
    } else {
      subscribers.delete(ws);
    }
  });

  // Clean up empty subscription
  if (subscribers.size === 0) {
    campaignSubscriptions.delete(campaignId);
  }

  console.log(`Broadcasted update to ${subscribers.size} subscribers for campaign ${campaignId}`);
};

module.exports = {
  initializeWebSocket,
  broadcastCampaignUpdate
};
