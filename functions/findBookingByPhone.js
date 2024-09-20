const axios = require('axios');
const moment = require('moment-timezone');

async function findBookingByPhone({ phoneNumber }) {
  console.log(`Finding booking for phone number: ${phoneNumber}`);

  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_BOOKINGS_TABLE;
  
  // Remove any non-digit characters and ensure the number starts with '44' or '0'
  let formattedPhoneNumber = phoneNumber.replace(/\D/g, '');
  if (formattedPhoneNumber.startsWith('44')) {
    formattedPhoneNumber = '0' + formattedPhoneNumber.slice(2);
  } else if (!formattedPhoneNumber.startsWith('0')) {
    formattedPhoneNumber = '0' + formattedPhoneNumber;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?` +
    `filterByFormula=OR(SEARCH("${formattedPhoneNumber}",{Contact_Number}),SEARCH("${formattedPhoneNumber.replace(/^0/, '44')}",{Contact_Number}))&` +
    `cellFormat=string&timeZone=Europe/London&userLocale=en-gb`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`
      }
    });

    if (response.data.records.length > 0) {
      const record = response.data.records[0];
      
      const bookingTime = moment.tz(record.fields.Entry_Date_Time, 'DD/MM/YYYY HH:mm', 'Europe/London');
      const formattedBookingTime = bookingTime.format('MMMM Do [at] h:mm A');
      
      return JSON.stringify({
        found: true,
        customerName: record.fields.Name || 'Not provided',
        terminal: record.fields.Terminal,
        bookingTime: formattedBookingTime,
        contactNumber: record.fields.Contact_Number,
        allocatedCarPark: record.fields.Allocated_Car_Park,
        registration: record.fields.Registration
      });
    } else {
      return JSON.stringify({ found: false, error: 'No booking found for this phone number.' });
    }
  } catch (error) {
    console.error('Error finding booking by phone:', error);
    return JSON.stringify({ 
      found: false,
      error: 'Failed to find booking.',
      details: error.response ? error.response.data : error.message
    });
  }
}

module.exports = findBookingByPhone;