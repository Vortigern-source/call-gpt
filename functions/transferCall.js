require('dotenv').config();

module.exports = async function transferCall({ callSid }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require('twilio')(accountSid, authToken);

  console.log(`Transferring call ${callSid}`);

  return await client.calls(callSid)
    .update({ twiml: `<Response><Dial>${process.env.TRANSFER_NUMBER}</Dial></Response>` })
    .then(() => {
      return 'The call was transferred successfully, say goodbye to the customer.';
    })
    .catch((error) => {
      console.error('Error transferring call:', error);
      throw error;
    });
};