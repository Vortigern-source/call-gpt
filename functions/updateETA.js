const axios = require('axios');
const moment = require('moment-timezone');

async function updateETA({ registration, customerETA }) {
  const timezone = 'Europe/London';
  const currentTime = moment().tz(timezone);
  console.log(`Updating ETA for registration: ${registration}, customerETA: ${customerETA}, currentTime: ${currentTime.format('YYYY-MM-DD HH:mm:ss')}`);
  
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_BOOKINGS_TABLE;

  const formattedRegistration = registration.replace(/\s+/g, '').toUpperCase();

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?` + 
    `filterByFormula=UPPER({Registration})=UPPER("${encodeURIComponent(formattedRegistration)}")&` +
    `cellFormat=string&timeZone=${timezone}&userLocale=en-gb`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`
      }
    });

    if (response.data.records.length === 0) {
      console.warn('No booking found for registration:', formattedRegistration);
      return { error: 'No booking found for this registration number.' };
    }

    const record = response.data.records[0];
    const recordId = record.id;

    let etaTime = moment().tz(timezone);

    if (customerETA.match(/\d+\s*(minutes?|hours?)/i)) {
      const duration = moment.duration(parseInt(customerETA), customerETA.toLowerCase().includes('minute') ? 'minutes' : 'hours');
      etaTime.add(duration);
    } else {
      const timeRegex = /(\d{1,2})[:.]?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/i;
      const match = customerETA.match(timeRegex);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2] || '0');
        const ampm = match[3] ? match[3].toLowerCase() : null;
  
        if (ampm && ampm.startsWith('p') && hours !== 12) hours += 12;
        if (ampm && ampm.startsWith('a') && hours === 12) hours = 0;
  
        etaTime.set({ hour: hours, minute: minutes, second: 0 });
      } else {
        return { error: 'Invalid time format provided.' };
      }
    }

    // Ensure the ETA is not in the past
    if (etaTime.isBefore(moment().tz(timezone))) {
      etaTime.add(1, 'day');
    }
  
    const patchUrl = `https://api.airtable.com/v0/${baseId}/${tableName}`;
    const patchData = {
      records: [{
        id: recordId,
        fields: {
          Current_ETA: etaTime.format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')
        }
      }],
      typecast: true
    };
  
    const patchResponse = await axios.patch(patchUrl, patchData, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
        'Content-Type': 'application/json'
      }
    });
  
    console.log(`ETA updated successfully. New ETA: ${etaTime.format('YYYY-MM-DD HH:mm:ss')}`);
    return { 
      success: 'ETA updated successfully.', 
      updatedRecord: patchResponse.data.records[0],
      formattedETA: etaTime.format('MMMM Do [at] h:mm A')
    };

  } catch (error) {
    console.error('Error updating ETA:', error);
    return { 
      error: 'Failed to update ETA.', 
      details: error.response ? error.response.data : error.message 
    };
  }
}

module.exports = updateETA;