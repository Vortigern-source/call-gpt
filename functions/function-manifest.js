// create metadata for all the available functions to pass to completions API
const tools = [
  {
    type: "function",
    function: {
      name: "findBooking",
      say: "Give me a moment while I find your booking details.",
      description: "Find booking details based on car registration number.",
      parameters: {
        type: "object",
        properties: {
          registration: {
            type: "string",
            description: "Car registration number"
          }
        },
        required: ["registration"]
      },
      returns: {
        type: "object",
        properties: {
          terminal: {
            type: "string",
            description: "Terminal number"
          },
          bookingTime: {
            type: "string",
            description: "Booking time"
          },
          contactNumber: {
            type: "string",
            description: "Contact number"
          },
          allocatedCarPark: {
            type: "string",
            description: "Allocated car park"
          },
          error: {
            type: "string",
            description: "Error message if no booking found or in case of a problem"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateETA",
      say: "I'll update the estimated ETA so our drivers can get there on time",
      description: "Update the estimated time of arrival (ETA) for a booking in Airtable.",
      parameters: {
        type: "object",
        properties: {
          registration: {
            type: "string",
            description: "Car registration number"
          },
          customerETA: {
            type: "string",
            description: "Customer's estimated time of arrival."
          },
          currentTime: {
            type: "string",
            description: "Current time in HH:mm format"
          }
        },
        required: ["registration", "customerETA", "currentTime"]
      },
      returns: {
        type: "object",
        properties: {
          success: {
            type: "string",
            description: "Success message if the ETA was updated successfully"
          },
          updatedRecord: {
            type: "object",
            description: "The updated record from Airtable"
          },
          formattedETA: {
            type: "string",
            description: "Formatted ETA string"
          },
          error: {
            type: "string",
            description: "Error message if the update failed or no booking was found"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "whatsappMessage",
      say: "A driver will be assigned soon.",
      description: "Sends a WhatsApp message to the manager group with booking details for driver assignment.",
      parameters: {
        type: "object",
        properties: {
          registration: {
            type: "string",
            description: "Vehicle registration number"
          }
        },
        required: ["registration"]
      },
      returns: {
        type: "object",
        properties: {
          success: {
            type: "string",
            description: "Success message if the notification was sent successfully"
          },
          messageId: {
            type: "string",
            description: "The ID of the sent WhatsApp message"
          },
          error: {
            type: "string",
            description: "Error message if the notification failed to send"
          },
          details: {
            type: "string",
            description: "Additional error details if available"
          }
        }
      }
    }
  }
];

module.exports = tools;