const axios = require('axios');
const moment = require('moment-timezone');

async function findBooking({ registration }) {
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_BOOKINGS_TABLE;
  
  const formattedRegistration = registration.replace(/\s+/g, '').toUpperCase();

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?filterByFormula=UPPER(%7BRegistration%7D)%3DUPPER("${encodeURIComponent(formattedRegistration)}")&cellFormat=string&timeZone=Europe/London&userLocale=en-gb`;

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
        const bookingTime = moment(record.fields.Entry_Date_Time, 'DD/MM/YYYY HH:mm');
        if (!bookingTime.isValid()) {
          throw new Error('Invalid date');
        }
        formattedBookingTime = bookingTime.tz('Europe/London').format('MMMM Do [at] h:mm A');
      } catch (error) {
        console.error('Error parsing booking time:', error);
        console.error('Input date format:', record.fields.Entry_Date_Time);
        formattedBookingTime = 'Date format error';
      }
      
      const contactNumber = record.fields.Contact_Number.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');

      return JSON.stringify({
        terminal: record.fields.Terminal,
        bookingTime: formattedBookingTime,
        contactNumber: contactNumber,
        allocatedCarPark: record.fields.Allocated_Car_Park
      });
    } else {
      return JSON.stringify({ error: 'No booking found for this registration number.' });
    }
  } catch (error) {
    console.error('Full error:', error);
    return JSON.stringify({ 
      error: error.message, 
      status: error.response ? error.response.status : 'Unknown',
      data: error.response ? error.response.data : 'No data'
    });
  }
}

module.exports = findBooking;