const OpenAI = require('openai');
const moment = require('moment-timezone');
const EventEmitter = require('events');
const tools = require('../functions/function-manifest');

const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
    });
    this.userContext = [
      { 
        "role": "system", 
        "content": `You are Josh, an assistant at Manchester Airport Parking. Follow these steps:

                    1. Determine the reason for the call:
                      - Ask: "Are you calling to drop off a car for parking, collect a parked car, or for something else?"
                      - If dropping off a car, proceed to step 2.
                      - If collecting a parked car, inform them this service is not available and politely end the call.
                      - For any other reason, use the transferCall function to transfer the call to a human agent.

                    2. For customers dropping off a car:
                      a. Get the phone number the customer is calling on and use the findBookingByPhone function to check for an existing booking.
                      b. If a booking is found by phone number, confirm the details with the customer. If not, ask for their car registration number.

                      c. Car Registration Confirmation (if needed):
                          - When a customer provides a registration number, repeat it back EXACTLY.
                          - Ask "Is that correct?" and wait for confirmation before proceeding.
                          - Do NOT proceed until the customer confirms the registration.
                          - Use the findBooking function to retrieve booking details.

                      d. Booking Verification:
                          - Confirm customer name, booking time (12-hour format), terminal, and contact number.
                          - DO NOT mention the allocated car park at this stage.

                      e. ETA Update:
                          - Ask for the customer's estimated time of arrival.
                          - If they give a relative time (e.g., "20 minutes"), calculate the actual time.
                          - Confirm the final ETA with the customer.
                          - Use updateETA function to update the booking.

                      f. Provide Instructions and Notify Management:
                          - After updating ETA, provide clear directions on arrival location, including car park and level.
                          - Use whatsappMessage function to notify the manager.
                          - Don't inform the customer about this message.

                    Maintain a professional, friendly tone. Use '•' for natural pauses. Don't use emojis.

                    IMPORTANT: 
                    - Always determine the reason for the call first before proceeding with any other steps.
                    - For drop-offs, follow the steps in the exact order given. Do not skip steps or provide information out of order.
                    - If at any point the customer indicates they're calling for a reason other than dropping off a car, use the transferCall function immediately.`
      },
      { 
        "role": "assistant", 
        "content": `Hi! This is Manchester Airport Parking. Are you calling to collect a parked car or drop off a car for parking?` 
      },
    ];
    this.partialResponseIndex = 0;
    this.etaConfirmed = false;
    this.lastRegistration = null;
  }

  getCurrentTime() {
    return moment().tz('Europe/London').format('h:mm A [BST]');
  }

  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  updateUserContext(name, role, content) {
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }
    if (name !== 'user') {
      this.userContext.push({ role, name, content });
    } else {
      this.userContext.push({ role, content });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);
  
    const response = await this.openai.chat.completions.create({
      model: 'llama3-groq-70b-8192-tool-use-preview',
      messages: this.userContext,
      tools: tools,
      tool_choice: 'auto',
    });
  
    const responseMessage = response.choices[0].message;
    let toolCalls = responseMessage.tool_calls;
  
    // Check if tool calls are embedded in the content
    if (!toolCalls && responseMessage.content.includes('<tool_call>')) {
      const toolCallMatch = responseMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
      if (toolCallMatch) {
        try {
          toolCalls = [JSON.parse(toolCallMatch[1])];
        } catch (error) {
          console.error('Error parsing embedded tool call:', error);
        }
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const functionName = toolCall.name || toolCall.function?.name;
        const functionToCall = availableFunctions[functionName];
        let functionArgs = toolCall.arguments || toolCall.function?.arguments;
  
        if (typeof functionArgs === 'string') {
          try {
            functionArgs = JSON.parse(functionArgs);
          } catch (error) {
            console.error('Error parsing function arguments:', error);
            functionArgs = {};
          }
        }
  
        try {
          const functionResponse = await functionToCall(functionArgs);
          this.updateUserContext(functionName, 'function', functionResponse);
        } catch (error) {
          console.error(`Error calling function ${functionName}:`, error);
          this.updateUserContext(functionName, 'function', JSON.stringify({ error: error.message }));
        }
      }
  
      // Make a second API call with the updated context
      const secondResponse = await this.openai.chat.completions.create({
        model: 'llama3-groq-70b-8192-tool-use-preview',
        messages: this.userContext,
      });
  
      this.handleResponse(secondResponse.choices[0].message, interactionCount);
    } else {
      this.handleResponse(responseMessage, interactionCount);
    }
  }

  handleResponse(responseMessage, interactionCount) {
    console.log('Response message:', JSON.stringify(responseMessage, null, 2));
  
    const response = responseMessage.content;
  
    if (typeof response !== 'string') {
      console.error('Unexpected response format:', response);
      return;
    }
  
    let partialResponse = '';
    for (const char of response) {
      partialResponse += char;
      if (char === '•' || char === '.') {
        this.emit('gptreply', {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        }, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }
  
    if (partialResponse) {
      this.emit('gptreply', {
        partialResponseIndex: this.partialResponseIndex,
        partialResponse
      }, interactionCount);
      this.partialResponseIndex++;
    }
  
    this.userContext.push({ 'role': 'assistant', 'content': response });
    console.log(`GPT -> user context length: ${this.userContext.length}`);
  }
}

module.exports = { GptService };