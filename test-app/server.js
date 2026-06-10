'use strict';

const express = require('express');
const {
  nodepulse,
  trackFunction,
  appendStep,
} = require('nodepulse');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Install NodePulse middleware
app.use(
  nodepulse({
    printReport: true,
    saveToFile: true,
  })
);

// --- Simulated helper functions ---

const fetchWalletBalance = trackFunction('fetchWalletBalance', async (userId) => {
  // Simulate a database call
  await sleep(50 + Math.random() * 100);
  return { userId, balance: 1250.75, currency: 'USD' };
});

const validatePayment = trackFunction('validatePayment', async (amount, balance) => {
  await sleep(10 + Math.random() * 20);
  if (amount > balance) {
    throw new Error('Insufficient funds');
  }
  return { valid: true, remainingBalance: balance - amount };
});

const callPaymentGateway = trackFunction('callPaymentGateway', async (paymentData) => {
  // Simulate an external API call with variable latency
  await sleep(200 + Math.random() * 300);
  return {
    transactionId: 'TXN_' + Math.random().toString(36).slice(2, 10).toUpperCase(),
    status: 'approved',
    gatewayRef: 'GW-' + Date.now(),
  };
});

const updateLedger = trackFunction('updateLedger', async (transactionId, amount) => {
  // Simulate a database write
  await sleep(30 + Math.random() * 50);
  return { ledgerEntryId: 'LED_' + Date.now(), recorded: true };
});

const sendNotification = trackFunction('sendNotification', async (userId, message) => {
  // Simulate notification service call
  await sleep(80 + Math.random() * 120);
  return { notificationId: 'NOTIF_' + Date.now(), sent: true };
});

// --- Routes ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: process.env.NODEPULSE_MODE || 'RECORD' });
});

app.post('/payment', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    // Step 1: Fetch wallet balance
    const wallet = await fetchWalletBalance(userId);

    // Step 2: Validate payment
    const validation = await validatePayment(amount, wallet.balance);

    // Step 3: Call payment gateway
    const gateway = await callPaymentGateway({
      userId,
      amount,
      description: description || 'Payment',
    });

    // Step 4: Update ledger
    const ledger = await updateLedger(gateway.transactionId, amount);

    // Step 5: Send notification
    const notification = await sendNotification(
      userId,
      `Payment of $${amount} processed successfully`
    );

    res.json({
      success: true,
      transactionId: gateway.transactionId,
      remainingBalance: validation.remainingBalance,
      ledgerEntryId: ledger.ledgerEntryId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const wallet = await fetchWalletBalance(req.params.id);
    res.json({ user: { id: req.params.id, ...wallet } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---

const PORT = process.env.PORT || 3456;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  🚀 Test app running on http://localhost:${PORT}`);
    console.log(`  Mode: ${process.env.NODEPULSE_MODE || 'RECORD'}\n`);
  });
}

// Export for CLI replay
module.exports = app;

// --- Utilities ---

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
