const axios = require('axios');
const moment = require('moment-timezone');

async function findBooking({ registration }) {
  console.log(`Finding booking for registration: ${registration}`);

  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_BOOKINGS_TABLE;
  
  const formattedRegistration = registration.replace(/\s+/g, '').toUpperCase();

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?` +
    `filterByFormula=UPPER({Registration})=UPPER("${encodeURIComponent(formattedRegistration)}")&` +
    `cellFormat=string&timeZone=Europe/London&userLocale=en-gb`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`
      }
    });

    if (response.data.records.length > 0) {
      const record = response.data.records[0];
      
      let formattedBookingTime;
      try {
        const bookingTime = moment.tz(record.fields.Entry_Date_Time, 'DD/MM/YYYY HH:mm', 'Europe/London');
        if (!bookingTime.isValid()) {
          throw new Error('Invalid date');
        }
        formattedBookingTime = bookingTime.format('MMMM Do [at] h:mm A');
      } catch (error) {
        console.error('Error parsing booking time:', error);
        console.error('Input date format:', record.fields.Entry_Date_Time);
        formattedBookingTime = 'Date format error';
      }
      
      const contactNumber = record.fields.Contact_Number.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');

      return JSON.stringify({
        customerName: record.fields.Name || 'Not provided',
        terminal: record.fields.Terminal,
        bookingTime: formattedBookingTime,
        contactNumber: contactNumber,
        allocatedCarPark: record.fields.Allocated_Car_Park,
        registration: formattedRegistration
      });
    } else {
      console.warn('No booking found for registration:', formattedRegistration);
      return JSON.stringify({ error: 'No booking found for this registration number.' });
    }
  } catch (error) {
    console.error('Error finding booking:', error.message);
    return JSON.stringify({ 
      error: 'Failed to find booking.',
      details: error.response ? error.response.data : error.message
    });
  }
}

module.exports = findBooking;