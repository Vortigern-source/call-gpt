require('dotenv').config();
const findBooking = require('./functions/findBooking');
const updateETA = require('./functions/updateETA');
const whatsappMessage = require('./functions/whatsappMessage');
const findBookingByPhone = require('./functions/findBookingByPhone');

const registration = 'YA19KXT';
const phoneNumber = '07921653420'; // Replace this with a valid phone number from your database

async function testFunctions() {
  // Test findBookingByPhone
  console.log('Testing findBookingByPhone...');
  const bookingByPhoneResult = await findBookingByPhone({ phoneNumber });
  console.log('findBookingByPhone result:', bookingByPhoneResult);

  // Test findBooking
  console.log('\nTesting findBooking...');
  const bookingResult = await findBooking({ registration });
  console.log('findBooking result:', bookingResult);

  // Test updateETA
  console.log('\nTesting updateETA...');
  const etaResult = await updateETA({ registration, customerETA: '2 hours' });
  console.log('updateETA result:', etaResult);

  // Test updateETA with specific time
  console.log('\nTesting updateETA with specific time...');
  const etaResult2 = await updateETA({ registration, customerETA: '3:30 PM' });
  console.log('updateETA result (specific time):', etaResult2);

  // Test whatsappMessage
  console.log('\nTesting whatsappMessage...');
  const whatsappResult = await whatsappMessage({ registration });
  console.log('whatsappMessage result:', whatsappResult);
}

testFunctions().then(() => console.log("\nAll tests completed."));