const axios = require('axios');

async function whatsappMessage({ registration }) {
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_BOOKINGS_TABLE;
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  const managerWhatsAppGroup = process.env.MANAGER_WHATSAPP_GROUP;

  // Format registration number: remove spaces and convert to uppercase
  const formattedRegistration = registration.replace(/\s+/g, '').toUpperCase();

  const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableName}?` + 
  `filterByFormula=UPPER({Registration})=UPPER("${formattedRegistration}")&` +
  `cellFormat=string&timeZone=Europe/London&userLocale=en-gb`;

  try {
    const airtableResponse = await axios.get(airtableUrl, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`
      }
    });

    if (airtableResponse.data.records.length > 0) {
      const record = airtableResponse.data.records[0].fields;

      // Extract details from the record
      const vehicleMake = record.Vehicle_Make || 'N/A';
      const name = record.Name || 'N/A';
      const contactNumber = record.Contact_Number || 'N/A';
      const entryDateTime = record.Entry_Date_Time || 'N/A';
      const terminal = record.Terminal || 'N/A';
      const estimatedETA = record.Current_ETA || 'N/A';

      const message = `
New Booking Requires Driver Assignment:
- Vehicle: ${vehicleMake}
- Registration: ${registration}
- Customer Name: ${name}
- Contact Number: ${contactNumber}
- Entry Date/Time: ${entryDateTime}
- Estimated ETA: ${estimatedETA}
- Terminal: ${terminal}

Please assign a driver for this booking.`;

      console.log('WhatsApp message content:', message);  // Log the message content for debugging

      // Send WhatsApp message via Twilio
      const twilioResponse = await axios({
        method: 'post',
        url: `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
        auth: {
          username: twilioAccountSid,
          password: twilioAuthToken
        },
        data: new URLSearchParams({
          From: `whatsapp:${twilioWhatsAppNumber}`,
          To: `whatsapp:${managerWhatsAppGroup}`,
          Body: message,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log('WhatsApp message sent successfully:', twilioResponse.data.sid);

      return {
        success: 'Manager notified successfully.',
        messageId: twilioResponse.data.sid
      };
    } else {
      console.warn('No booking found for registration:', formattedRegistration);
      return { error: 'No booking found for this registration number.' };
    }
  } catch (error) {
    console.error('Error in whatsappMessage function:', error);
    return {
      error: 'Failed to process the request.',
      details: error.response ? error.response.data : error.message
    };
  }
}

module.exports = whatsappMessage;