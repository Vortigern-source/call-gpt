require('dotenv').config();
const setTimeout = require('timers/promises').setTimeout;
const transferCall = require('../functions/transferCall');

test('Expect transferCall to successfully redirect call', async () => {
  async function makeOutboundCall() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = require('twilio')(accountSid, authToken);
    
    try {
      const call = await client.calls.create({
        url: `https://${process.env.SERVER}/incoming`,
        to: process.env.YOUR_NUMBER,
        from: process.env.FROM_NUMBER
      });
      return call.sid;
    } catch (error) {
      console.error('Error making outbound call:', error);
      throw error;
    }
  }

  const callSid = await makeOutboundCall();
  console.log('Call SID:', callSid);
  
  await setTimeout(10000);

  try {
    const transferResult = await transferCall({ callSid }); // Ensure correct parameter object
    expect(transferResult).toBe('The call was transferred successfully, say goodbye to the customer.');
  } catch (error) {
    console.error('Error during call transfer:', error);
    throw error;
  }
}, 30000);  // Increase the test timeout to 30 seconds to allow for network delays