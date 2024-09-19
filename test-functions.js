require('dotenv').config();
const findBooking = require('./functions/findBooking');
const updateETA = require('./functions/updateETA');
const whatsappMessage = require('./functions/whatsappMessage');

const registration = 'HN16YLM';

async function runTests() {
  try {
    // Test findBooking
    console.log("Testing findBooking...");
    const bookingResult = await findBooking({ registration });
    console.log("findBooking result:", JSON.parse(bookingResult));

    // Test updateETA
    console.log("\nTesting updateETA...");
    const currentTime = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const updateETAResult = await updateETA({ 
      registration, 
      customerETA: "16:30", 
      currentTime: currentTime 
    });
    console.log("updateETA result:", updateETAResult);

    // Test whatsappMessage
    console.log("\nTesting whatsappMessage...");
    const whatsappResult = await whatsappMessage({ registration });
    console.log("whatsappMessage result:", whatsappResult);

    // Test error handling
    console.log("\nTesting error handling...");
    const invalidReg = 'INVALID123';
    const errorBookingResult = await findBooking({ registration: invalidReg });
    console.log("findBooking with invalid registration:", JSON.parse(errorBookingResult));

    const errorUpdateETAResult = await updateETA({ 
      registration: invalidReg, 
      customerETA: "16:30", 
      currentTime: currentTime 
    });
    console.log("updateETA with invalid registration:", errorUpdateETAResult);

    const errorWhatsappResult = await whatsappMessage({ registration: invalidReg });
    console.log("whatsappMessage with invalid registration:", errorWhatsappResult);

  } catch (error) {
    console.error("An error occurred during testing:", error);
  }
}

runTests().then(() => console.log("All tests completed."));